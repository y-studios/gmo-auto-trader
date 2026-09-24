// 10/14 の答え合わせ用に、各案の「20日後の着地」を事前に予想して JSON に書き出す。
// 当てずっぽうにしないため、バックテストの資産推移から20日間のローリング窓をすべて取り、
// その分布（中央値・上下10%）をそのまま予想とする。
import fs from "node:fs";
import path from "node:path";
import { loadUniverse } from "./lib/data.mjs";
import { backtest } from "./lib/engine.mjs";

const DAYS = Number(process.argv[2] ?? 20);
const TARGET = process.argv[3] ?? "2026-10-14";
const START_CAPITAL = 100_000;
const SYMBOLS = ["BTC", "XRP", "ETH", "SOL", "DOGE"];

const VARIANTS = [
  { id: "A", module: "current",       maker: false },
  { id: "B", module: "current",       maker: true },
  { id: "C", module: "breakout-wide", maker: false },
  { id: "D", module: "meanrev",       maker: false },
  { id: "E", module: "hold",          maker: false },
  { id: "F", module: "volbreak",      maker: false },
];

const seeded = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const q = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)))];

const universe = loadUniverse(SYMBOLS);
const out = { generatedAt: new Date().toISOString(), targetDate: TARGET, horizonDays: DAYS, startCapital: START_CAPITAL, variants: {} };

for (const v of VARIANTS) {
  const strategy = (await import(`./strategies/${v.module}.mjs`)).default;
  const r = backtest({
    universe, strategy, startCapital: START_CAPITAL,
    minNotional: 1_000, maxConcurrent: 2, haltDrawdownPct: null,
    orderStyle: v.maker ? "maker" : "taker",
    rng: seeded(1),
  });

  // 資産推移から DAYS 日のローリング窓をすべて取り、リターン分布を作る
  const curve = r.equityCurve;
  const span = DAYS * 24; // 1時間足なので DAYS×24 本
  const rets = [];
  for (let i = span; i < curve.length; i += 6) {
    const a = curve[i - span].equity, b = curve[i].equity;
    if (a > 0) rets.push(b / a - 1);
  }
  rets.sort((x, y) => x - y);

  // 同じ窓でのトレード件数の分布
  const counts = [];
  for (let i = span; i < curve.length; i += 24) {
    const t0 = curve[i - span].t, t1 = curve[i].t;
    counts.push(r.trades.filter((t) => t.exitAt > t0 && t.exitAt <= t1).length);
  }
  counts.sort((x, y) => x - y);

  // 同じ窓での勝率分布（5件以上の窓だけ）
  const wrs = [];
  for (let i = span; i < curve.length; i += 24) {
    const t0 = curve[i - span].t, t1 = curve[i].t;
    const ts = r.trades.filter((t) => t.exitAt > t0 && t.exitAt <= t1);
    if (ts.length >= 5) wrs.push(ts.filter((t) => t.pnl > 0).length / ts.length);
  }
  wrs.sort((x, y) => x - y);

  const yen = (ret) => Math.round(START_CAPITAL * (1 + ret));
  out.variants[v.id] = {
    samples: rets.length,
    equity: { p10: yen(q(rets, 0.1)), median: yen(q(rets, 0.5)), p90: yen(q(rets, 0.9)) },
    ret: { p10: q(rets, 0.1), median: q(rets, 0.5), p90: q(rets, 0.9) },
    trades: { p10: q(counts, 0.1), median: q(counts, 0.5), p90: q(counts, 0.9) },
    winRate: wrs.length ? { p10: q(wrs, 0.1), median: q(wrs, 0.5), p90: q(wrs, 0.9) } : null,
    upProbability: rets.filter((x) => x > 0).length / rets.length,
  };
}

const file = path.join(import.meta.dirname, "..", "public", "data", "forecast.json");
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(out, null, 2));

console.log(`${TARGET} 時点（${DAYS}日後）の予想 — 元手 ¥${START_CAPITAL.toLocaleString()}\n`);
console.log("案".padEnd(4) + "件数(中央)".padStart(11) + "勝率(中央)".padStart(11) + "資産(中央値)".padStart(14) + "  8割がこの範囲" + "         上がる確率");
console.log("─".repeat(88));
for (const v of VARIANTS) {
  const f = out.variants[v.id];
  console.log(
    v.id.padEnd(4) +
    String(f.trades.median).padStart(11) +
    (f.winRate ? `${(f.winRate.median * 100).toFixed(0)}%` : "—").padStart(11) +
    `¥${f.equity.median.toLocaleString()}`.padStart(14) +
    `   ¥${f.equity.p10.toLocaleString()} 〜 ¥${f.equity.p90.toLocaleString()}`.padEnd(30) +
    `${(f.upProbability * 100).toFixed(0)}%`
  );
}
