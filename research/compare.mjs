// 複数戦略を同一条件で回して比較する。
//   node research/compare.mjs
//   node research/compare.mjs --from 2022-01-01 --to 2024-12-31
import { loadUniverse } from "./lib/data.mjs";
import { backtest } from "./lib/engine.mjs";
import { evaluate } from "./lib/metrics.mjs";

const argv = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]?.startsWith("--") ? true : arr[i + 1]]);
    return acc;
  }, [])
);

const STRATEGIES = ["current", "meanrev", "breakout", "volbreak", "xmom", "random"];
const DEFAULT_SYMBOLS = ["BTC", "XRP", "ETH", "SOL", "DOGE"];

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const symbols = (argv.symbols ?? DEFAULT_SYMBOLS.join(",")).split(",");
const universe = loadUniverse(symbols, { from: argv.from, to: argv.to });
const names = (argv.only ?? STRATEGIES.join(",")).split(",");

const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`;

console.log(
  `銘柄 ${symbols.join(",")} / ` +
    `${new Date(universe.timeline[0]).toISOString().slice(0, 10)}〜${new Date(universe.timeline.at(-1)).toISOString().slice(0, 10)}` +
    ` / ${universe.timeline.length.toLocaleString()}本\n`
);

const header = [
  "戦略".padEnd(30),
  "件数".padStart(6),
  "週".padStart(5),
  "勝率".padStart(7),
  "RR".padStart(6),
  "PF".padStart(6),
  "期待値".padStart(8),
  "総riターン".padStart(9),
  "最大DD".padStart(8),
  "週60%達成".padStart(10),
  "月プラス".padStart(9),
  "約定率".padStart(8),
].join("");
console.log(header);
console.log("─".repeat(header.length));

const results = [];
for (const name of names) {
  const strategy = (await import(`./strategies/${name}.mjs`)).default;
  const r = backtest({
    universe,
    strategy,
    maxConcurrent: Number(argv.maxConcurrent ?? 2),
    cooldownHours: Number(argv.cooldown ?? 4),
    haltDrawdownPct: argv.halt === "off" ? null : Number(argv.halt ?? 0.2),
    costs: argv.nocost
      ? { takerFeePct: 0, slippagePct: 0 }
      : { takerFeePct: Number(argv.fee ?? 0.0005), slippagePct: Number(argv.slip ?? 0.0003) },
    orderStyle: argv.maker ? "maker" : "taker",
    limitOffsetPct: Number(argv.offset ?? 0),
    limitTimeoutBars: Number(argv.timeout ?? 3),
    rng: seeded(1),
  });
  const ev = evaluate(r, universe);
  results.push({ name, ev, strategy, r });
  console.log(
    [
      name.padEnd(30),
      String(ev.trades).padStart(6),
      ev.tradesPerWeek.toFixed(1).padStart(5),
      pct(ev.winRate).padStart(7),
      (ev.rr === Infinity ? "∞" : ev.rr.toFixed(2)).padStart(6),
      (ev.profitFactor === Infinity ? "∞" : ev.profitFactor.toFixed(2)).padStart(6),
      `¥${Math.round(ev.expectancy)}`.padStart(8),
      pct(ev.totalReturn).padStart(9),
      pct(ev.maxDrawdown).padStart(8),
      pct(ev.weekly.hitRate60).padStart(10),
      pct(ev.monthly.profitablePeriods).padStart(9),
      (r.orderStyle === "maker" ? pct(r.fillRate) : "成行").padStart(8),
    ].join("")
  );
}

const bh = results[0]?.ev.buyHold;
if (bh) console.log(`\n【比較基準】同期間の等分ガチホ: ${pct(bh.avgReturn)}`);
console.log(`【比較基準】random に勝てない戦略は、シグナルに情報が無いということ`);
