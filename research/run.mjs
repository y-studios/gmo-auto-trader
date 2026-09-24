// バックテスト実行 CLI
//   node research/run.mjs --strategy current --from 2022-01-01 --to 2026-09-23
//   node research/run.mjs --strategy random --seeds 20
import { loadUniverse } from "./lib/data.mjs";
import { backtest } from "./lib/engine.mjs";
import { evaluate, report } from "./lib/metrics.mjs";

const argv = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]?.startsWith("--") ? true : arr[i + 1]]);
    return acc;
  }, [])
);

const DEFAULT_SYMBOLS = ["BTC", "XRP", "ETH", "SOL", "DOGE"];

/** 再現性のある乱数（mulberry32） */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const name = argv.strategy ?? "current";
const symbols = (argv.symbols ?? DEFAULT_SYMBOLS.join(",")).split(",");
const strategy = (await import(`./strategies/${name}.mjs`)).default;
const universe = loadUniverse(symbols, { from: argv.from, to: argv.to });

const opts = {
  universe,
  strategy,
  maxConcurrent: Number(argv.maxConcurrent ?? 2),
  cooldownHours: Number(argv.cooldown ?? 4),
  haltDrawdownPct: argv.halt === "off" ? null : Number(argv.halt ?? 0.2),
};

console.log(
  `銘柄 ${symbols.join(", ")} / ${new Date(universe.timeline[0]).toISOString().slice(0, 10)}` +
    ` 〜 ${new Date(universe.timeline.at(-1)).toISOString().slice(0, 10)} / ${universe.timeline.length.toLocaleString()}本`
);

const seeds = Number(argv.seeds ?? 1);
if (seeds > 1) {
  // ランダム対照群などをN回まわして分布で見る
  const evs = [];
  for (let s = 1; s <= seeds; s++) {
    const r = backtest({ ...opts, rng: seeded(s) });
    evs.push(evaluate(r, universe));
  }
  const avg = (f) => evs.reduce((a, e) => a + f(e), 0) / evs.length;
  console.log(`\n━━━ ${strategy.name} × ${seeds}シード ━━━`);
  console.log(`勝率       平均 ${(avg((e) => e.winRate) * 100).toFixed(1)}%  (最小 ${(Math.min(...evs.map((e) => e.winRate)) * 100).toFixed(1)}% / 最大 ${(Math.max(...evs.map((e) => e.winRate)) * 100).toFixed(1)}%)`);
  console.log(`総リターン 平均 ${(avg((e) => e.totalReturn) * 100).toFixed(1)}%  (最小 ${(Math.min(...evs.map((e) => e.totalReturn)) * 100).toFixed(1)}% / 最大 ${(Math.max(...evs.map((e) => e.totalReturn)) * 100).toFixed(1)}%)`);
  console.log(`期待値     平均 ¥${Math.round(avg((e) => e.expectancy)).toLocaleString()}/トレード`);
  console.log(`トレード数 平均 ${avg((e) => e.trades).toFixed(0)}件  最大DD 平均 ${(avg((e) => e.maxDrawdown) * 100).toFixed(1)}%`);
  console.log(`ガチホ     ${(evs[0].buyHold.avgReturn * 100).toFixed(1)}%`);
} else {
  const result = backtest({ ...opts, rng: seeded(Number(argv.seed ?? 1)) });
  const ev = evaluate(result, universe);
  console.log(report(ev, strategy.name));
  if (argv.periods) {
    console.log("\n月次内訳:");
    for (const r of ev.monthly.rows) {
      console.log(`  ${r.period}  ${String(r.trades).padStart(3)}件  勝率 ${(r.winRate * 100).toFixed(0).padStart(3)}%  ${r.pnl >= 0 ? "+" : ""}¥${Math.round(r.pnl).toLocaleString()}`);
    }
  }
}
