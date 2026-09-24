// バックテスト用の指標（高安を使うものを追加）
export { rsi, macd, bollinger, sma, last } from "../../lib/indicators.mjs";

/** 欠損を除いた直近 n 本の OHLC を返す（i を含む・古い→新しい） */
export function window(bars, i, n) {
  const out = [];
  for (let k = i; k >= 0 && out.length < n; k--) if (bars[k]) out.push(bars[k]);
  return out.reverse();
}

/** ATR（Wilder平滑なしの単純平均版。n本ぶんの True Range 平均） */
export function atr(w) {
  if (w.length < 2) return null;
  let sum = 0;
  for (let k = 1; k < w.length; k++) {
    const tr = Math.max(w[k].h - w[k].l, Math.abs(w[k].h - w[k - 1].c), Math.abs(w[k].l - w[k - 1].c));
    sum += tr;
  }
  return sum / (w.length - 1);
}

/** ドンチャン・チャネル（直近 n 本の高値/安値。当バーは含めない） */
export function donchian(w) {
  if (w.length < 2) return null;
  const prev = w.slice(0, -1);
  return { high: Math.max(...prev.map((b) => b.h)), low: Math.min(...prev.map((b) => b.l)) };
}

export function mean(a) {
  return a.reduce((x, y) => x + y, 0) / a.length;
}

export function stdev(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}

/** n本前からの騰落率 */
export function roc(closes, n) {
  if (closes.length <= n) return null;
  const a = closes[closes.length - 1 - n];
  return a ? (closes[closes.length - 1] - a) / a : null;
}
