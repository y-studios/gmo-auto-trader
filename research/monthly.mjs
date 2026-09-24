// 実測ベースの着地見込み: バックテストの「月次リターン分布」をそのまま使う。
// 元手5,000円で最小注文単位の丸めがどう効くかも見る。
import { loadUniverse } from "./lib/data.mjs";
import { backtest } from "./lib/engine.mjs";

const argv = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]?.startsWith("--") ? true : arr[i + 1]]);
    return acc;
  }, [])
);
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const symbols = (argv.symbols ?? "BTC,XRP,ETH,SOL,DOGE").split(",");
const universe = loadUniverse(symbols, { from: argv.from, to: argv.to });
const cap = Number(argv.capital ?? 100000);
const names = (argv.only ?? "current,meanrev,breakout,volbreak,xmom").split(",");

console.log(`元手 ¥${cap.toLocaleString()} / 最小注文額 ¥${Number(argv.minNotional ?? 5000).toLocaleString()} / 銘柄 ${symbols.join(",")}\n`);
console.log("戦略".padEnd(12) + "月数".padStart(5) + "件/月".padStart(7) + "中央値".padStart(9) + "平均".padStart(9) + "下位10%".padStart(9) + "上位10%".padStart(9) + "プラス月".padStart(9) + "  → 5,000円が1ヶ月後");
console.log("─".repeat(100));

for (const name of names) {
  const strategy = (await import(`./strategies/${name}.mjs`)).default;
  const r = backtest({
    universe, strategy, startCapital: cap,
    minNotional: Number(argv.minNotional ?? 5000),
    maxConcurrent: Number(argv.maxConcurrent ?? 2),
    haltDrawdownPct: null,
    costs: { takerFeePct: Number(argv.fee ?? 0.0005), slippagePct: Number(argv.slip ?? 0.0003) },
    rng: seeded(1),
  });
  // 月ごとの資産増減率（エクイティカーブの月末値から算出＝含み損益も反映）
  const byMonth = new Map();
  for (const p of r.equityCurve) {
    const k = new Date(p.t + 9 * 3600e3).toISOString().slice(0, 7);
    byMonth.set(k, p.equity);
  }
  const months = [...byMonth.entries()].sort();
  const rets = [];
  for (let i = 1; i < months.length; i++) {
    const prev = months[i - 1][1];
    if (prev > 0) rets.push(months[i][1] / prev - 1);
  }
  if (!rets.length) { console.log(name.padEnd(12) + "   トレード成立せず（最小注文額に届かない）"); continue; }
  const s = [...rets].sort((a, b) => a - b);
  const q = (x) => s[Math.min(s.length - 1, Math.floor(s.length * x))];
  const med = q(0.5), avg = rets.reduce((a, b) => a + b, 0) / rets.length;
  const plus = rets.filter((v) => v > 0).length / rets.length;
  const best = Math.max(...rets), worst = Math.min(...rets);
  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  console.log(
    name.padEnd(12) + String(months.length).padStart(5) +
    (r.trades.length / months.length).toFixed(1).padStart(7) +
    pct(med).padStart(9) + pct(avg).padStart(9) + pct(q(0.1)).padStart(9) + pct(q(0.9)).padStart(9) + pct(plus).padStart(9) +
    `  最良月 ${(best*100).toFixed(1)}% / 最悪月 ${(worst*100).toFixed(1)}%   中央値 ¥${Math.round(5000 * (1 + med)).toLocaleString()}  (下位10% ¥${Math.round(5000 * (1 + q(0.1))).toLocaleString()} 〜 上位10% ¥${Math.round(5000 * (1 + q(0.9))).toLocaleString()})`
  );
}
