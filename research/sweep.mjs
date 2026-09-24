// パラメータ探索。過剰最適化を避けるため train / test を分け、
// 「trainで選んだ最良パラメータが、一度も見ていないtestでも通用するか」を必ず確認する。
//   node research/sweep.mjs --strategy trendfollow
import { loadUniverse } from "./lib/data.mjs";
import { backtest } from "./lib/engine.mjs";
import { evaluate } from "./lib/metrics.mjs";

const argv = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]?.startsWith("--") ? true : arr[i + 1]]);
    return acc;
  }, [])
);
const seeded = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

const SPLIT = argv.split ?? "2025-01-01"; // これ以前=train / 以降=test（testは最後に一度だけ見る）
const symbols = (argv.symbols ?? "BTC,XRP,ETH,SOL,DOGE").split(",");
const name = argv.strategy ?? "trendfollow";
const base = (await import(`./strategies/${name}.mjs`)).default;

const GRIDS = {
  trendfollow: { smaPeriod: [100, 200, 300, 500, 720], buffer: [0, 0.005, 0.01, 0.02, 0.03], exitSmaPeriod: [null] },
  breakout: { lookback: [24, 48, 96, 168], slAtr: [1.5, 2, 3], tpAtr: [4, 6, 10], smaPeriod: [168] },
  meanrev: { rsiEntry: [5, 10, 15], tpAtr: [0.5, 1, 2], slAtr: [2, 3], smaPeriod: [100, 200] },
};
const grid = GRIDS[name];
if (!grid) throw new Error(`${name} のパラメータグリッド未定義`);

function combos(g) {
  const keys = Object.keys(g);
  let out = [{}];
  for (const k of keys) out = out.flatMap((o) => g[k].map((v) => ({ ...o, [k]: v })));
  return out;
}

const trainU = loadUniverse(symbols, { to: SPLIT });
const testU = loadUniverse(symbols, { from: SPLIT });

function run(universe, params) {
  const r = backtest({
    universe,
    strategy: { ...base, params: { ...base.params, ...params } },
    maxConcurrent: Number(argv.maxConcurrent ?? 2),
    cooldownHours: Number(argv.cooldown ?? 4),
    haltDrawdownPct: null,
    orderStyle: argv.maker ? "maker" : "taker",
    rng: seeded(1),
  });
  return evaluate(r, universe);
}

const list = combos(grid);
console.log(`${base.name} / ${list.length}通り / train 〜${SPLIT} / test ${SPLIT}〜\n`);

const rows = list.map((p) => ({ p, ev: run(trainU, p) }));
// 選定基準はリターンではなく「PF」。リターンだけで選ぶと、たまたま大相場を踏んだ設定を拾ってしまう
rows.sort((a, b) => b.ev.profitFactor - a.ev.profitFactor);

const pct = (v) => `${(v * 100).toFixed(1)}%`;
console.log("【train 上位10】");
console.log("パラメータ".padEnd(46) + "件数".padStart(6) + "勝率".padStart(7) + "PF".padStart(7) + "リターン".padStart(10) + "最大DD".padStart(9));
for (const { p, ev } of rows.slice(0, 10)) {
  console.log(
    JSON.stringify(p).padEnd(46) + String(ev.trades).padStart(6) + pct(ev.winRate).padStart(7) +
    ev.profitFactor.toFixed(2).padStart(7) + pct(ev.totalReturn).padStart(10) + pct(ev.maxDrawdown).padStart(9)
  );
}

console.log("\n【test（未見データ）で上位5を検証】");
console.log("パラメータ".padEnd(46) + "件数".padStart(6) + "勝率".padStart(7) + "PF".padStart(7) + "リターン".padStart(10) + "最大DD".padStart(9));
for (const { p } of rows.slice(0, 5)) {
  const ev = run(testU, p);
  console.log(
    JSON.stringify(p).padEnd(46) + String(ev.trades).padStart(6) + pct(ev.winRate).padStart(7) +
    ev.profitFactor.toFixed(2).padStart(7) + pct(ev.totalReturn).padStart(10) + pct(ev.maxDrawdown).padStart(9)
  );
}
const bhTrain = rows[0].ev.buyHold, bhTest = run(testU, rows[0].p).buyHold;
console.log(`\n【基準】ガチホ train ${pct(bhTrain.avgReturn)} / test ${pct(bhTest.avgReturn)}`);
