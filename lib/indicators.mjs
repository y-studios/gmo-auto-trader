// テクニカル指標（純関数）。ブラウザのダッシュボードと Node のボットランナーで共用する。
// すべて終値配列（古い→新しい）を受け取り、同じ長さの配列（計算不能な先頭は null）を返す。

/**
 * 単純移動平均
 * @param {number[]} values
 * @param {number} period
 * @returns {(number|null)[]}
 */
export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * 指数移動平均（最初の値は SMA で初期化）
 * @param {number[]} values
 * @param {number} period
 * @returns {(number|null)[]}
 */
export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev = null;
  let seed = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period) {
      seed += values[i];
      if (i === period - 1) {
        prev = seed / period;
        out[i] = prev;
      }
      continue;
    }
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/**
 * RSI（Wilder 平滑化）
 * @param {number[]} closes
 * @param {number} [period=14]
 * @returns {(number|null)[]}
 */
export function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/**
 * MACD（12/26/9）
 * @param {number[]} closes
 * @param {number} [fast=12]
 * @param {number} [slow=26]
 * @param {number} [signal=9]
 * @returns {{ macd:(number|null)[], signal:(number|null)[], hist:(number|null)[] }}
 */
export function macd(closes, fast = 12, slow = 26, signal = 9) {
  const ef = ema(closes, fast);
  const es = ema(closes, slow);
  const line = closes.map((_, i) => (ef[i] != null && es[i] != null ? ef[i] - es[i] : null));
  const firstIdx = line.findIndex((v) => v != null);
  const valid = firstIdx >= 0 ? line.slice(firstIdx).map((v) => /** @type {number} */ (v)) : [];
  const sigValid = ema(valid, signal);
  const sig = new Array(closes.length).fill(null);
  for (let i = 0; i < sigValid.length; i++) sig[firstIdx + i] = sigValid[i];
  const hist = line.map((v, i) => (v != null && sig[i] != null ? v - sig[i] : null));
  return { macd: line, signal: sig, hist };
}

/**
 * ボリンジャーバンド（20, 2σ）
 * @param {number[]} closes
 * @param {number} [period=20]
 * @param {number} [mult=2]
 * @returns {{ middle:(number|null)[], upper:(number|null)[], lower:(number|null)[], percentB:(number|null)[], bandwidth:(number|null)[] }}
 */
export function bollinger(closes, period = 20, mult = 2) {
  const middle = sma(closes, period);
  const upper = new Array(closes.length).fill(null);
  const lower = new Array(closes.length).fill(null);
  const percentB = new Array(closes.length).fill(null);
  const bandwidth = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const m = /** @type {number} */ (middle[i]);
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) v += (closes[j] - m) ** 2;
    const sd = Math.sqrt(v / period);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
    const w = upper[i] - lower[i];
    percentB[i] = w === 0 ? 0.5 : (closes[i] - lower[i]) / w;
    bandwidth[i] = m === 0 ? 0 : w / m;
  }
  return { middle, upper, lower, percentB, bandwidth };
}

/**
 * 末尾の値（null を飛ばす）
 * @param {(number|null)[]} arr
 * @param {number} [back=0]
 */
export function last(arr, back = 0) {
  const v = arr[arr.length - 1 - back];
  return v == null ? null : v;
}
