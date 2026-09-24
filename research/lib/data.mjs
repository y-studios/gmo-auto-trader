// バックテスト用のローソク足ロード・整列
import fs from "node:fs";
import path from "node:path";

const DATA = path.join(import.meta.dirname, "..", "data");

/** @typedef {{t:number,o:number,h:number,l:number,c:number,v:number}} Bar */

/** @returns {Bar[]} 古い→新しい */
export function loadBars(symbol) {
  const file = path.join(DATA, `${symbol}_1hour.csv`);
  if (!fs.existsSync(file)) throw new Error(`データが無い: ${file}（先に research/fetch-history.mjs を実行）`);
  const lines = fs.readFileSync(file, "utf8").trim().split("\n").slice(1);
  const bars = [];
  for (const line of lines) {
    const [t, o, h, l, c, v] = line.split(",");
    bars.push({ t: Number(t), o: Number(o), h: Number(h), l: Number(l), c: Number(c), v: Number(v) });
  }
  bars.sort((a, b) => a.t - b.t);
  return bars;
}

/**
 * 複数銘柄を共通のタイムライン（1時間刻み）に揃える。
 * 欠損足は null。各銘柄の終値配列も一緒に作る（指標計算用）。
 * @param {string[]} symbols
 * @param {{from?:string, to?:string}} [range] ISO日付
 */
export function loadUniverse(symbols, range = {}) {
  const raw = {};
  for (const s of symbols) raw[s] = loadBars(s);

  const fromT = range.from ? new Date(`${range.from}T00:00:00+09:00`).getTime() : -Infinity;
  const toT = range.to ? new Date(`${range.to}T23:59:59+09:00`).getTime() : Infinity;

  const times = new Set();
  for (const s of symbols) for (const b of raw[s]) if (b.t >= fromT && b.t <= toT) times.add(b.t);
  const timeline = [...times].sort((a, b) => a - b);

  /** @type {Record<string,(import('./data.mjs').Bar|null)[]>} */
  const series = {};
  for (const s of symbols) {
    const idx = new Map(raw[s].map((b) => [b.t, b]));
    series[s] = timeline.map((t) => idx.get(t) ?? null);
  }
  return { timeline, series, symbols };
}

/** 直近 n 本の終値（欠損は直前の値で埋める）。i を含む。 */
export function closesUpTo(bars, i, n) {
  const out = [];
  let prev = null;
  const start = Math.max(0, i - n + 1);
  for (let k = start; k <= i; k++) {
    const b = bars[k];
    if (b) prev = b.c;
    if (prev != null) out.push(prev);
  }
  return out;
}
