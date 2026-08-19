// GMOコイン自動売買AI — 売買判定・リスク管理ロジック（純関数）
// ダッシュボード（ブラウザ）と scripts/bot.mjs（GitHub Actions / ローカル）で同じコードを使う。
import { rsi, macd, bollinger, last } from "./indicators.mjs";

/** 取引対象と GMOコイン現物の最小注文単位 */
export const SYMBOLS = /** @type {const} */ ({
  BTC: { name: "ビットコイン", pair: "BTC/JPY", step: 0.0001, minSize: 0.0001, pricePrecision: 0 },
  ETH: { name: "イーサリアム", pair: "ETH/JPY", step: 0.01, minSize: 0.01, pricePrecision: 0 },
  SOL: { name: "ソラナ", pair: "SOL/JPY", step: 0.1, minSize: 0.1, pricePrecision: 0 },
});

/** 安全装置・リスク管理パラメータ（ダッシュボードの「リスク管理」カードにもそのまま表示する） */
export const RISK = {
  startCapital: 100_000, // 元手
  challengeDays: 90, // 3ヶ月チャレンジ
  riskPerTradePct: 0.02, // 1トレードの許容損失（元手の2%）。最大3%まで
  riskPerTradeMaxPct: 0.03,
  stopLossPct: 0.03, // 買値から -3% で機械的に成行決済
  takeProfitPct: 0.05, // +5% で利確
  trailingActivatePct: 0.02, // 含み益 +2% でトレーリング開始
  trailingGapPct: 0.012, // 最高値から -1.2% で利確
  rsiOverbought: 75, // RSI 75 超過で過熱→利確
  rsiOversold: 35,
  maxPositionPct: 0.6, // 1銘柄あたり総資産の最大60%
  maxConcurrent: 2, // 同時保有は最大2銘柄
  maxExposurePct: 1.0, // 現物のみ（レバレッジ無し）＝現金の範囲内
  cooldownHours: 4, // 同一銘柄の再エントリーは決済から4時間あける
  volLotReduceRatio: 1.8, // 直近24hの値幅が7日平均の1.8倍以上ならロット半減（ボラティリティ連動）
  drawdownHaltPct: 0.2, // 総資産が元手の -20%（8万円）で全自動売買を強制停止
  minNotionalJpy: 5_000,
  timeframe: "1hour",
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
export function snapshot(closes) {
  const r = rsi(closes, 14);
  const m = macd(closes, 12, 26, 9);
  const b = bollinger(closes, 20, 2);
  const bw = b.bandwidth.filter((v) => v != null).slice(-48);
  const sorted = [...bw].sort((a, b2) => a - b2);
  const q25 = sorted.length ? sorted[Math.floor(sorted.length * 0.25)] : null;
  const bandwidth = last(b.bandwidth);
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
  let score = 0;
  if (s.rsi == null || s.hist == null || s.percentB == null) {
    return { action: "skip", exitType: null, score: 0, reasons: ["指標の計算に必要な足が不足"], summary: "データ不足のため見送り" };
  }
  // 1) RSI
  const rsiRising = s.rsiPrev != null && s.rsi > s.rsiPrev;
  if (s.rsi <= RISK.rsiOversold && rsiRising) {
    score += 2;
    reasons.push(`RSI ${fmt(s.rsi, 1)} が売られすぎ圏から反転上昇`);
  } else if (s.rsi <= 45 && rsiRising) {
    score += 1;
    reasons.push(`RSI ${fmt(s.rsi, 1)} が中立下限から上向き`);
  } else if (s.rsi >= 70) {
    reasons.push(`RSI ${fmt(s.rsi, 1)} は過熱圏（高値掴み回避）`);
  } else {
    reasons.push(`RSI ${fmt(s.rsi, 1)} は中立で決め手なし`);
  }
  // 2) MACD
  const crossUp = s.hist > 0 && s.histPrev != null && s.histPrev <= 0;
  const histRising = s.histPrev != null && s.histPrev2 != null && s.hist > s.histPrev && s.histPrev > s.histPrev2;
  if (crossUp) {
    score += 2;
    reasons.push("MACDがシグナルを上抜け（ゴールデンクロス）");
  } else if (s.hist < 0 && histRising) {
    score += 1;
    reasons.push("MACDヒストグラムがマイナス圏で縮小中（底打ちの兆候）");
  } else if (s.hist > 0 && histRising) {
    score += 1;
    reasons.push("MACDヒストグラムがプラス圏で拡大中");
  } else {
    reasons.push("MACDに明確な買いシグナルなし");
  }
  // 3) ボリンジャーバンド
  if (s.percentB <= 0.15) {
    score += 2;
    reasons.push(`価格が-2σバンド付近（%B ${fmt(s.percentB * 100, 0)}%）`);
  } else if (s.percentB <= 0.35) {
    score += 1;
    reasons.push(`価格がバンド下半分（%B ${fmt(s.percentB * 100, 0)}%）`);
  } else if (s.percentB >= 0.9) {
    reasons.push(`価格が+2σバンド付近（%B ${fmt(s.percentB * 100, 0)}%）で追随買いは見送り`);
  }
  // 4) スクイーズ（ブレイク方向不明）
  if (s.squeeze && !crossUp) {
    reasons.push("BB幅が収縮（スクイーズ）でブレイク方向が不明");
    return { action: "skip", exitType: null, score, reasons, summary: "スクイーズ中のため待機" };
  }
  if (score >= 3) {
    return { action: "buy", exitType: null, score, reasons, summary: `買いシグナル（スコア ${score}/6）` };
  }
  return { action: "hold", exitType: null, score, reasons, summary: `条件未達（スコア ${score}/6）のため見送り` };
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
  const peak = Math.max(pos.peakPrice ?? pos.entryPrice, price);
  const stop = pos.entryPrice * (1 - RISK.stopLossPct);
  const tp = pos.entryPrice * (1 + RISK.takeProfitPct);
  const reasons = [];
  if (price <= stop) {
    reasons.push(`買値 ¥${fmt(pos.entryPrice)} から ${fmt(pnlPct * 100, 2)}%。損切りライン ¥${fmt(stop)} に到達`);
    return { action: "sell", exitType: "stop_loss", score: 0, reasons, summary: "損切り（-3%ライン到達）" };
  }
  if (price >= tp) {
    reasons.push(`利確目標 ¥${fmt(tp)}（+5%）に到達`);
    return { action: "sell", exitType: "take_profit", score: 0, reasons, summary: "利確（+5%目標到達）" };
  }
  const peakGain = (peak - pos.entryPrice) / pos.entryPrice;
  if (peakGain >= RISK.trailingActivatePct) {
    const trail = peak * (1 - RISK.trailingGapPct);
    if (price <= trail) {
      reasons.push(`含み益が最大 ${fmt(peakGain * 100, 2)}% に到達後、最高値 ¥${fmt(peak)} から ${fmt(RISK.trailingGapPct * 100, 1)}% 反落`);
      return { action: "sell", exitType: "trailing", score: 0, reasons, summary: "トレーリング利確" };
    }
  }
  if (s.rsi != null && s.rsi >= RISK.rsiOverbought && pnlPct > 0) {
    reasons.push(`RSI ${fmt(s.rsi, 1)} が ${RISK.rsiOverbought} を超過し過熱感`);
    return { action: "sell", exitType: "signal_exit", score: 0, reasons, summary: "過熱シグナルで利確" };
  }
  const crossDown = s.hist != null && s.histPrev != null && s.hist < 0 && s.histPrev >= 0;
  if (crossDown && pnlPct > 0.005) {
    reasons.push("MACDがシグナルを下抜け（デッドクロス）。利益を確保して撤退");
    return { action: "sell", exitType: "signal_exit", score: 0, reasons, summary: "MACD反転で決済" };
  }
  const histFalling = s.hist != null && s.histPrev != null && s.hist < s.histPrev;
  if (s.bbLower != null && price < s.bbLower && histFalling && pnlPct < -0.015) {
    reasons.push(`-2σバンド ¥${fmt(s.bbLower)} を下抜け、MACDも悪化。-3%到達前に早期カット`);
    return { action: "sell", exitType: "early_cut", score: 0, reasons, summary: "サポート割れで早期カット" };
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
  const byRisk = (equity * RISK.riskPerTradeMaxPct) / RISK.stopLossPct; // 損切り幅3%で許容損失3%以内
  const byPosition = equity * RISK.maxPositionPct;
  const byCash = Math.max(0, Math.min(cash, equity * RISK.maxExposurePct - openExposure));
  const notional = Math.min(byRisk, byPosition, byCash) * lotMultiplier;
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
