// イベント駆動バックテスト・エンジン（1時間足・現物買いのみ・複数銘柄）
//
// 設計上のルール:
//  - 先読み禁止: バー i の終値で判断し、約定は バー i+1 の始値。
//  - 値幅系の決済（損切り/利確/トレーリング）は保有中の各バーの高安で判定する（実ボットは15分ごとに監視するため）。
//    同一バー内で損切りと利確の両方に触れた場合は「損切りが先」に倒す（楽観にならないように）。
//  - コスト: 往復とも taker 手数料 + スリッページ。GMO取引所現物の taker は 0.05%。
import { closesUpTo } from "./data.mjs";

export const DEFAULT_COSTS = {
  takerFeePct: 0.0005,  // GMO取引所現物 taker 0.05%
  makerFeePct: -0.0001, // GMO取引所現物 maker -0.01%（受け取り）
  slippagePct: 0.0003,  // 板を食う分＋約定ズレ（片道・テイカー時のみ）
};

/** 数量の丸め単位 */
export const STEPS = {
  BTC: 0.00001, ETH: 0.0001, SOL: 0.01, XRP: 1, DOGE: 1, ADA: 1, LINK: 0.1, XLM: 1,
};

/**
 * @param {Object} cfg
 * @param {import('./data.mjs').loadUniverse extends any ? any : any} cfg.universe
 * @param {any} cfg.strategy
 * @param {number} [cfg.startCapital]
 * @param {number} [cfg.maxConcurrent]
 * @param {number} [cfg.cooldownHours]
 * @param {number} [cfg.minNotional]
 * @param {number} [cfg.haltDrawdownPct] 総資産がこの割合下落したら停止（null で無効）
 * @param {typeof DEFAULT_COSTS} [cfg.costs]
 * @param {() => number} [cfg.rng]
 */
export function backtest(cfg) {
  const {
    universe,
    strategy,
    startCapital = 100_000,
    maxConcurrent = 2,
    cooldownHours = 4,
    minNotional = 5_000,
    haltDrawdownPct = null,
    costs: costsIn = {},
    orderStyle = "taker", // "taker" = 成行 / "maker" = 指値（メイカー手数料だが約定しないことがある）
    limitOffsetPct = 0,   // 指値を現値から何%下に置くか
    limitTimeoutBars = 3, // 何本のあいだ板に置くか（超えたらキャンセル）
    rng = Math.random,
  } = cfg;
  const maker = orderStyle === "maker";
  const costs = { ...DEFAULT_COSTS, ...costsIn };

  const { timeline, series, symbols } = universe;
  const warmup = strategy.warmup ?? 200;
  const params = strategy.params ?? {};

  let cash = startCapital;
  /** @type {Record<string, any>} */
  const positions = {};
  /** @type {Record<string, number>} */
  const cooldownUntil = {};
  const trades = [];
  const equityCurve = [];
  let placedCount = 0;
  let filledCount = 0;
  /** 未執行の注文。テイカーなら次バー始値、メイカーなら指値に触れるまで板に置く */
  let restingOrders = [];
  let halted = false;

  const feeOf = (notional) => notional * (costs.takerFeePct + costs.slippagePct);

  const markToMarket = (i) => {
    let v = cash;
    for (const s of Object.keys(positions)) {
      const b = lastKnownBar(series[s], i);
      if (b) v += positions[s].size * b.c;
    }
    return v;
  };

  for (let i = 0; i < timeline.length; i++) {
    const now = timeline[i];

    // --- 1) 板に置いてある注文の執行判定 ---
    const stillResting = [];
    for (const order of restingOrders) {
      const bar = series[order.symbol][i];
      if (!bar) { stillResting.push(order); continue; }
      if (positions[order.symbol] || Object.keys(positions).length >= maxConcurrent) continue; // キャンセル

      let price = null;
      let isMaker = false;
      if (maker) {
        // 指値: このバーの安値が指値に届いたときだけ約定する。
        // 「下がってきたときだけ約定する」＝逆選択がそのまま再現される。
        if (bar.l <= order.limitPrice) {
          price = Math.min(order.limitPrice, bar.o); // 窓を開けて下に飛んだら始値
          isMaker = true;
        } else if (i >= order.expiresAt) {
          continue; // 期限切れでキャンセル（＝上に走った相場には乗れない）
        } else {
          stillResting.push(order);
          continue;
        }
      } else {
        price = bar.o * (1 + costs.slippagePct); // 成行: 次バー始値＋滑り
      }

      const step = STEPS[order.symbol] ?? 0.0001;
      const budget = Math.min(order.notional, cash);
      let size = Math.floor(budget / price / step) * step;
      size = Number(size.toFixed(8));
      const notional = size * price;
      if (size <= 0 || notional < minNotional || notional > cash) continue;
      const fee = notional * (isMaker ? costs.makerFeePct : costs.takerFeePct);
      cash -= notional + fee;
      positions[order.symbol] = {
        symbol: order.symbol,
        size,
        entryPrice: price,
        entryAt: now,
        entryIndex: i,
        peak: price,
        feePaid: fee,
        levels: order.levels,
        entryReason: order.reason,
      };
      filledCount++;
    }
    restingOrders = stillResting;

    // --- 2) 保有ポジションの決済判定（値幅系はバー内の高安、シグナル系は終値） ---
    for (const sym of Object.keys(positions)) {
      const pos = positions[sym];
      const bar = series[sym][i];
      if (!bar || i === pos.entryIndex) continue;

      const lv = pos.levels ?? {};
      let exitPrice = null;
      let exitType = null;

      const stopPrice = lv.stopPct ? pos.entryPrice * (1 - lv.stopPct) : null;
      const tpPrice = lv.tpPct ? pos.entryPrice * (1 + lv.tpPct) : null;
      // トレーリングは「前バーまでの最高値」を基準に使う（当バーの高値で引き上げてから同バーで引っかけるのは先読み）
      const trailPrice =
        lv.trailActivatePct != null && (pos.peak - pos.entryPrice) / pos.entryPrice >= lv.trailActivatePct
          ? pos.peak * (1 - lv.trailGapPct)
          : null;

      // 損切りを先に見る（同一バーで両方に触れた場合は不利な方を採用）
      const downLevels = [stopPrice, trailPrice].filter((v) => v != null);
      const downTrigger = downLevels.length ? Math.max(...downLevels) : null;
      if (downTrigger != null && bar.l <= downTrigger) {
        exitPrice = Math.min(downTrigger, bar.o); // ギャップダウンなら始値で約定
        exitType = stopPrice != null && downTrigger === stopPrice ? "stop_loss" : "trailing";
      } else if (tpPrice != null && bar.h >= tpPrice) {
        exitPrice = Math.max(tpPrice, bar.o);
        exitType = "take_profit";
      } else if (strategy.exitSignal) {
        const closes = closesUpTo(series[sym], i, warmup);
        const sig = strategy.exitSignal({ symbol: sym, pos, bar, closes, params, i });
        if (sig) {
          exitPrice = bar.c; // 終値判断→実際は次バー始値だが、1h足では差は僅少。保守側にスリッページで吸収
          exitType = sig.type ?? "signal_exit";
        }
      }

      // 当バーの高値で peak を更新（次バー以降のトレーリング基準）
      pos.peak = Math.max(pos.peak, bar.h);

      if (exitPrice != null) {
        // 利確は指値で置けるのでメイカー。損切り／トレーリング／シグナル決済は成行にせざるを得ない。
        const exitIsMaker = maker && exitType === "take_profit";
        const fill = exitIsMaker ? exitPrice : exitPrice * (1 - costs.slippagePct);
        const gross = pos.size * fill;
        const fee = gross * (exitIsMaker ? costs.makerFeePct : costs.takerFeePct);
        cash += gross - fee;
        const cost = pos.size * pos.entryPrice + pos.feePaid;
        const pnl = gross - fee - cost;
        trades.push({
          symbol: sym,
          entryAt: pos.entryAt,
          exitAt: now,
          holdBars: i - pos.entryIndex,
          entryPrice: pos.entryPrice,
          exitPrice: fill,
          size: pos.size,
          notional: pos.size * pos.entryPrice,
          fees: pos.feePaid + fee,
          pnl,
          pnlPct: pnl / cost,
          exitType,
          entryReason: pos.entryReason,
        });
        delete positions[sym];
        cooldownUntil[sym] = now + cooldownHours * 3600 * 1000;
      }
    }

    const equity = markToMarket(i);
    equityCurve.push({ t: now, equity, cash, open: Object.keys(positions).length });

    // --- 3) サーキットブレーカー ---
    if (haltDrawdownPct != null && !halted && equity <= startCapital * (1 - haltDrawdownPct)) {
      halted = true;
    }
    if (halted) continue;

    // --- 4) 新規エントリー判定（次バー始値で執行） ---
    if (i < warmup || Object.keys(positions).length >= maxConcurrent) continue;
    const slotsLeft = maxConcurrent - Object.keys(positions).length;
    const candidates = [];
    for (const sym of symbols) {
      if (positions[sym]) continue;
      if ((cooldownUntil[sym] ?? 0) > now) continue;
      const bar = series[sym][i];
      if (!bar) continue;
      const closes = closesUpTo(series[sym], i, warmup);
      if (closes.length < warmup) continue;
      const d = strategy.entry({ symbol: sym, bar, closes, bars: series[sym], i, params, equity, rng });
      if (d && d.enter) candidates.push({ symbol: sym, ...d });
    }
    // スコア順に、空きスロットぶんだけ
    candidates.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    for (const c of candidates.slice(0, slotsLeft)) {
      const notional = Math.min(
        equity * (c.sizeFrac ?? 0.5),
        cash * 0.995
      );
      if (notional < minNotional) continue;
      const bar = series[c.symbol][i];
      restingOrders.push({
        symbol: c.symbol,
        notional,
        levels: c.levels ?? {},
        reason: c.reason,
        limitPrice: bar.c * (1 - (c.limitOffsetPct ?? limitOffsetPct)),
        expiresAt: i + limitTimeoutBars,
      });
      placedCount++;
    }
  }

  // 未決済は最終バーの終値で評価
  const lastI = timeline.length - 1;
  const openPositions = Object.values(positions).map((p) => {
    const b = lastKnownBar(series[p.symbol], lastI);
    return { ...p, markPrice: b?.c ?? p.entryPrice };
  });

  return {
    trades,
    equityCurve,
    openPositions,
    halted,
    startCapital,
    finalEquity: markToMarket(lastI),
    from: timeline[0],
    to: timeline[lastI],
    orderStyle,
    placedCount,
    filledCount,
    fillRate: placedCount ? filledCount / placedCount : 0,
    strategyName: strategy.name,
    params,
    costs,
  };
}

function lastKnownBar(bars, i) {
  for (let k = i; k >= 0 && k > i - 48; k--) if (bars[k]) return bars[k];
  return null;
}
