// GMOコイン自動売買AI — 売買判定・リスク管理ロジック（純関数）
// ダッシュボード（ブラウザ）と scripts/bot.mjs（GitHub Actions / ローカル）で同じコードを使う。
import { rsi, macd, bollinger, last } from "./indicators.mjs";

/** 取引対象と GMOコイン現物の最小注文単位 */
export const SYMBOLS = /** @type {const} */ ({
  // 最小注文数量・注文単位は GMO公開API /v1/symbols の実値（2026-09 時点）
  BTC:  { name: "ビットコイン", pair: "BTC/JPY",  step: 0.00001, minSize: 0.00001, pricePrecision: 0 },
  XRP:  { name: "リップル",     pair: "XRP/JPY",  step: 1,       minSize: 1,       pricePrecision: 3 },
  ETH:  { name: "イーサリアム", pair: "ETH/JPY",  step: 0.0001,  minSize: 0.001,   pricePrecision: 0 },
  SOL:  { name: "ソラナ",       pair: "SOL/JPY",  step: 0.01,    minSize: 0.01,    pricePrecision: 0 },
  DOGE: { name: "ドージコイン", pair: "DOGE/JPY", step: 1,       minSize: 10,      pricePrecision: 3 },
});

/** 安全装置・リスク管理パラメータ（ダッシュボードの「リスク管理」カードにもそのまま表示する） */
export const RISK = {
  startCapital: 100_000, // 元手
  challengeDays: 90,

  // ▼ 売買ルール（4年バックテスト + 未見データ検証で確定。research/ 参照）
  //   直近168本(7日)の高値を上抜け、かつSMA168の上にあるときだけ買う。
  //   損切り・利確は固定%ではなく ATR（実際のボラティリティ）基準。
  lookbackBars: 168,   // ブレイク判定に使う高値の期間
  smaPeriod: 168,      // トレンドフィルタ
  atrPeriod: 24,       // ATRの計算期間
  slAtr: 3,            // 損切り = 買値 - ATR×3
  tpAtr: 4,            // 利確   = 買値 + ATR×4
  trailAtr: 3,         // 含み益 ATR×3 に達したらトレーリング開始
  trailGapAtr: 1.8,    // 最高値から ATR×1.8 下げたら利確
  maxHoldHours: 240,   // 10日で手仕舞い（塩漬け防止）

  riskPerTradePct: 0.02,
  riskPerTradeMaxPct: 0.03,
  maxPositionPct: 0.5,   // 1銘柄あたり総資産の50%
  maxConcurrent: 2,      // 同時保有は最大2銘柄
  maxExposurePct: 1.0,   // 現物のみ（レバレッジ無し）
  cooldownHours: 4,      // 同一銘柄の再エントリーは決済から4時間
  volLotReduceRatio: 1.8,
  drawdownHaltPct: 0.2,  // 元手 -20% で強制停止
  minNotionalJpy: 1_000,
  timeframe: "1hour",

  // 参考表示用（ATR基準なので固定値ではないが、UIの目安として残す）
  stopLossPct: 0.03,
  takeProfitPct: 0.05,
  rsiOverbought: 75,
  rsiOversold: 35,
  trailingActivatePct: 0.02,
  trailingGapPct: 0.012,
};

/** 緊急停止ライン（円） */
export const HALT_EQUITY = RISK.startCapital * (1 - RISK.drawdownHaltPct);

/**
 * @typedef {Object} IndicatorSnapshot
 * @property {number} price
 * @property {number|null} rsi
 * @property {number|null} rsiPrev
 * @property {number|null} macd
 * @property {number|null} macdSignal
 * @property {number|null} hist
 * @property {number|null} histPrev
 * @property {number|null} histPrev2
 * @property {number|null} bbUpper
 * @property {number|null} bbMiddle
 * @property {number|null} bbLower
 * @property {number|null} percentB
 * @property {number|null} bandwidth
 * @property {boolean} squeeze
 */

/**
 * 終値配列から指標スナップショットを作る
 * @param {number[]} closes 古い→新しい
 * @returns {IndicatorSnapshot}
 */
export function snapshot(input) {
  // 終値の配列でも、OHLCバーの配列でも受け取れる（バーならATR・高値ブレイクも計算できる）
  const isBars = input.length > 0 && typeof input[0] === "object";
  const bars = isBars ? input : null;
  const closes = isBars ? input.map((b) => b.close ?? b.c) : input;

  const r = rsi(closes, 14);
  const m = macd(closes, 12, 26, 9);
  const b = bollinger(closes, 20, 2);
  const bw = b.bandwidth.filter((v) => v != null).slice(-48);
  const sorted = [...bw].sort((a, b2) => a - b2);
  const q25 = sorted.length ? sorted[Math.floor(sorted.length * 0.25)] : null;
  const bandwidth = last(b.bandwidth);

  // --- ブレイクアウト判定に必要な値 ---
  let atrValue = null;
  let breakoutHigh = null;
  if (bars && bars.length >= 2) {
    const g = (x, k1, k2) => Number(x[k1] ?? x[k2]);
    const w = bars.slice(-(RISK.atrPeriod + 1));
    let trSum = 0;
    for (let k = 1; k < w.length; k++) {
      const h = g(w[k], "high", "h"), l = g(w[k], "low", "l"), pc = g(w[k - 1], "close", "c");
      trSum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    }
    if (w.length > 1) atrValue = trSum / (w.length - 1);
    // 当バーを含めない直近 lookbackBars 本の高値
    const lb = bars.slice(-(RISK.lookbackBars + 1), -1);
    if (lb.length >= RISK.lookbackBars) breakoutHigh = Math.max(...lb.map((x) => g(x, "high", "h")));
  }
  const smaWin = closes.slice(-RISK.smaPeriod);
  const smaTrend = smaWin.length >= RISK.smaPeriod ? smaWin.reduce((a, c) => a + c, 0) / smaWin.length : null;

  return {
    price: closes[closes.length - 1],
    rsi: last(r),
    rsiPrev: last(r, 1),
    macd: last(m.macd),
    macdSignal: last(m.signal),
    hist: last(m.hist),
    histPrev: last(m.hist, 1),
    histPrev2: last(m.hist, 2),
    bbUpper: last(b.upper),
    bbMiddle: last(b.middle),
    bbLower: last(b.lower),
    percentB: last(b.percentB),
    bandwidth,
    squeeze: bandwidth != null && q25 != null && bandwidth <= q25,
    atr: atrValue,
    breakoutHigh,
    smaTrend,
  };
}

/**
 * @typedef {Object} Position
 * @property {keyof typeof SYMBOLS} symbol
 * @property {number} size
 * @property {number} entryPrice
 * @property {string} entryAt ISO
 * @property {number} [peakPrice]
 */

/**
 * @typedef {Object} Decision
 * @property {"buy"|"sell"|"hold"|"skip"} action
 * @property {"stop_loss"|"take_profit"|"trailing"|"signal_exit"|"early_cut"|null} exitType
 * @property {number} score
 * @property {string[]} reasons
 * @property {string} summary
 */

const fmt = (v, d = 0) => (v == null ? "–" : v.toLocaleString("ja-JP", { maximumFractionDigits: d, minimumFractionDigits: d }));

/**
 * エントリー判定（現物の買いのみ）
 * @param {IndicatorSnapshot} s
 * @returns {Decision}
 */
export function evaluateEntry(s) {
  const reasons = [];
  if (s.price == null || s.atr == null || s.breakoutHigh == null || s.smaTrend == null) {
    return { action: "skip", exitType: null, score: 0, reasons: ["ブレイク判定に必要な足が不足"], summary: "データ不足のため見送り" };
  }

  // 1) トレンドフィルタ: 長期平均より上でなければ買わない（下落局面に乗らない）
  if (s.price < s.smaTrend) {
    reasons.push(`価格 ¥${fmt(s.price)} が SMA${RISK.smaPeriod} ¥${fmt(s.smaTrend)} を下回る（下降トレンド）`);
    return { action: "hold", exitType: null, score: 0, reasons, summary: "下降トレンドのため見送り" };
  }
  reasons.push(`SMA${RISK.smaPeriod} ¥${fmt(s.smaTrend)} の上でトレンドは上向き`);

  // 2) ブレイク判定: 直近168本(7日)の高値を上抜けたか
  if (s.price <= s.breakoutHigh) {
    reasons.push(`直近${RISK.lookbackBars}本の高値 ¥${fmt(s.breakoutHigh)} をまだ超えていない`);
    return { action: "hold", exitType: null, score: 0, reasons, summary: "高値ブレイク待ち" };
  }

  // スコア = 高値をATRの何倍ぶん抜いたか。複数銘柄が同時に出たら強い方を採る
  const score = (s.price - s.breakoutHigh) / s.atr;
  reasons.push(`直近${RISK.lookbackBars}本の高値 ¥${fmt(s.breakoutHigh)} を上抜け（ATRの${score.toFixed(2)}倍）`);
  reasons.push(`ATR ¥${fmt(s.atr)} → 損切り ¥${fmt(s.price - s.atr * RISK.slAtr)} / 利確 ¥${fmt(s.price + s.atr * RISK.tpAtr)}`);
  return { action: "buy", exitType: null, score, reasons, summary: `買いシグナル（高値ブレイク・強さ ${score.toFixed(2)}ATR）` };
}

/**
 * エントリー時に確定させる損切り・利確の価格（ATR基準なので銘柄・局面ごとに変わる）
 * @param {number} entryPrice
 * @param {number} atrValue
 */
export function entryLevels(entryPrice, atrValue) {
  return {
    stopPrice: entryPrice - atrValue * RISK.slAtr,
    tpPrice: entryPrice + atrValue * RISK.tpAtr,
    atrAtEntry: atrValue,
  };
}

/**
 * 決済判定
 * @param {Position} pos
 * @param {IndicatorSnapshot} s
 * @returns {Decision}
 */
export function evaluateExit(pos, s) {
  const price = s.price;
  const pnlPct = (price - pos.entryPrice) / pos.entryPrice;
  const reasons = [];

  // エントリー時に確定したライン。無い古いポジションは現在のATR（無ければ固定%）で代用
  const fallbackAtr = s.atr ?? pos.entryPrice * RISK.stopLossPct / RISK.slAtr;
  const stop = pos.stopPrice ?? pos.entryPrice - fallbackAtr * RISK.slAtr;
  const tp = pos.tpPrice ?? pos.entryPrice + fallbackAtr * RISK.tpAtr;

  if (price <= stop) {
    reasons.push(`買値 ¥${fmt(pos.entryPrice)} から ${fmt(pnlPct * 100, 2)}%。損切りライン ¥${fmt(stop)}（ATR×${RISK.slAtr}）に到達`);
    return { action: "sell", exitType: "stop_loss", score: 0, reasons, summary: "損切り（ATR基準ライン到達）" };
  }
  if (price >= tp) {
    reasons.push(`利確ライン ¥${fmt(tp)}（ATR×${RISK.tpAtr}）に到達。+${fmt(pnlPct * 100, 2)}%`);
    return { action: "sell", exitType: "take_profit", score: 0, reasons, summary: "利確（ATR基準ライン到達）" };
  }

  // トレーリング: 十分含み益が乗ったら、高値からの押しで利益を確定する
  const atrAtEntry = pos.atrAtEntry ?? fallbackAtr;
  const peak = Math.max(pos.peakPrice ?? pos.entryPrice, price);
  if (peak - pos.entryPrice >= atrAtEntry * RISK.trailAtr) {
    const trail = peak - atrAtEntry * RISK.trailGapAtr;
    if (price <= trail) {
      reasons.push(`最高値 ¥${fmt(peak)} から ATR×${RISK.trailGapAtr} 下落。利益を確定（${fmt(pnlPct * 100, 2)}%）`);
      return { action: "sell", exitType: "trailing", score: 0, reasons, summary: "トレーリング利確" };
    }
  }

  // 時間切れ: 10日持っても決着しないものは手仕舞い
  if (pos.entryAt) {
    const heldH = (Date.now() - new Date(pos.entryAt).getTime()) / 3600_000;
    if (heldH >= RISK.maxHoldHours) {
      reasons.push(`保有 ${Math.round(heldH)} 時間が上限 ${RISK.maxHoldHours} 時間に到達。含み損益 ${fmt(pnlPct * 100, 2)}%`);
      return { action: "sell", exitType: "timeout", score: 0, reasons, summary: "時間切れで手仕舞い" };
    }
  }

  reasons.push(`含み損益 ${fmt(pnlPct * 100, 2)}%。利確 ¥${fmt(tp)} / 損切り ¥${fmt(stop)} を監視中`);
  return { action: "hold", exitType: null, score: 0, reasons, summary: "保有継続" };
}

/**
 * ポジションサイズ（数量）を計算する
 * @param {Object} p
 * @param {keyof typeof SYMBOLS} p.symbol
 * @param {number} p.price
 * @param {number} p.equity 総資産
 * @param {number} p.cash 注文可能な現金
 * @param {number} p.openExposure 既存ポジションの評価額
 * @param {number} [p.lotMultiplier=1] 連敗時の縮小など
 */
export function positionSize({ symbol, price, equity, cash, openExposure, lotMultiplier = 1 }) {
  const spec = SYMBOLS[symbol];
  const byPosition = equity * RISK.maxPositionPct;
  const byCash = Math.max(0, Math.min(cash, equity * RISK.maxExposurePct - openExposure));
  const notional = Math.min(byPosition, byCash) * lotMultiplier;
  if (notional < RISK.minNotionalJpy) return 0;
  const raw = notional / price;
  const size = Math.floor(raw / spec.step) * spec.step;
  const fixed = Number(size.toFixed(6));
  return fixed >= spec.minSize ? fixed : 0;
}

/**
 * ドローダウン緊急停止の判定
 * @param {number} equity
 */
export function circuitBreaker(equity) {
  const halted = equity <= HALT_EQUITY;
  return {
    halted,
    threshold: HALT_EQUITY,
    distancePct: (equity - HALT_EQUITY) / RISK.startCapital,
    message: halted
      ? `総資産 ¥${fmt(equity)} が停止ライン ¥${fmt(HALT_EQUITY)}（-20%）に到達。全自動売買を強制停止`
      : `停止ライン ¥${fmt(HALT_EQUITY)} まで余裕 ¥${fmt(equity - HALT_EQUITY)}`,
  };
}

/**
 * ボラティリティ連動のロット倍率。直近24本（=24h）の終値レンジが、その前6日分の平均レンジの
 * volLotReduceRatio 倍以上なら 0.5（ロット半減）、それ以外は 1。
 * @param {number[]} closes 1時間足の終値（古い→新しい、168本以上推奨）
 */
export function volatilityLotMultiplier(closes) {
  if (closes.length < 48) return { multiplier: 1, ratio: 1 };
  const range = (arr) => Math.max(...arr) - Math.min(...arr);
  const recent = range(closes.slice(-24));
  const prevDays = [];
  for (let d = 1; d <= 6; d++) {
    const seg = closes.slice(-24 * (d + 1), -24 * d);
    if (seg.length === 24) prevDays.push(range(seg));
  }
  if (!prevDays.length) return { multiplier: 1, ratio: 1 };
  const avg = prevDays.reduce((a, b) => a + b, 0) / prevDays.length;
  const ratio = avg > 0 ? recent / avg : 1;
  return { multiplier: ratio >= RISK.volLotReduceRatio ? 0.5 : 1, ratio };
}

/**
 * 口座統計
 * @param {{pnl:number}[]} closedTrades
 */
export function stats(closedTrades) {
  const wins = closedTrades.filter((t) => t.pnl > 0);
  const losses = closedTrades.filter((t) => t.pnl < 0);
  const grossProfit = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = -losses.reduce((a, t) => a + t.pnl, 0);
  const realized = grossProfit - grossLoss;
  // 決済ベースのドローダウン
  let equity = RISK.startCapital;
  let peak = equity;
  let maxDD = 0;
  for (const t of closedTrades) {
    equity += t.pnl;
    peak = Math.max(peak, equity);
    maxDD = Math.min(maxDD, (equity - peak) / peak);
  }
  return {
    total: closedTrades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closedTrades.length ? wins.length / closedTrades.length : 0,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    realized,
    avgWin: wins.length ? grossProfit / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    maxDrawdown: maxDD,
  };
}
