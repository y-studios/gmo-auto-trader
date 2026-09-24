// バックテスト結果の評価。勝率だけでなく期待値・リスクリワード・期間安定性を必ず一緒に見る。

const MS_DAY = 86_400_000;

const jstDate = (t) => new Date(t + 9 * 3600 * 1000); // JSTの暦で区切る
const weekKey = (t) => {
  const d = jstDate(t);
  const day = (d.getUTCDay() + 6) % 7; // 月曜始まり
  const mon = new Date(d.getTime() - day * MS_DAY);
  return mon.toISOString().slice(0, 10);
};
const monthKey = (t) => jstDate(t).toISOString().slice(0, 7);

function basic(trades) {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const gp = wins.reduce((a, t) => a + t.pnl, 0);
  const gl = -losses.reduce((a, t) => a + t.pnl, 0);
  const winRate = trades.length ? wins.length / trades.length : 0;
  const avgWin = wins.length ? gp / wins.length : 0;
  const avgLoss = losses.length ? gl / losses.length : 0;
  return {
    trades: trades.length,
    winRate,
    profitFactor: gl > 0 ? gp / gl : gp > 0 ? Infinity : 0,
    avgWin,
    avgLoss,
    rr: avgLoss > 0 ? avgWin / avgLoss : Infinity, // リスクリワード
    expectancy: trades.length ? (gp - gl) / trades.length : 0, // 1トレードあたり期待値（円）
    netPnl: gp - gl,
    fees: trades.reduce((a, t) => a + t.fees, 0),
  };
}

/** 期間ごと（週/月）に切って、勝率と損益の安定性を見る */
function byPeriod(trades, keyFn) {
  const map = new Map();
  for (const t of trades) {
    const k = keyFn(t.exitAt);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(t);
  }
  const rows = [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([k, ts]) => {
      const b = basic(ts);
      return { period: k, trades: b.trades, winRate: b.winRate, pnl: b.netPnl };
    });
  const withEnough = rows.filter((r) => r.trades >= 5);
  const rates = withEnough.map((r) => r.winRate);
  return {
    rows,
    periods: rows.length,
    medianTrades: median(rows.map((r) => r.trades)),
    // 勝率が目標を満たした期間の割合（トレード数5件以上の期間のみで判定）
    hitRate60: rates.length ? rates.filter((r) => r >= 0.6).length / rates.length : 0,
    meanWinRate: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0,
    winRateStd: std(rates),
    profitablePeriods: rows.length ? rows.filter((r) => r.pnl > 0).length / rows.length : 0,
  };
}

function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}
function std(a) {
  if (a.length < 2) return 0;
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}

function drawdown(equityCurve) {
  let peak = -Infinity;
  let maxDD = 0;
  for (const p of equityCurve) {
    peak = Math.max(peak, p.equity);
    maxDD = Math.min(maxDD, (p.equity - peak) / peak);
  }
  return maxDD;
}

/** 同期間を等分ガチホした場合のリターン（比較基準） */
export function buyAndHold(universe, symbols) {
  const { series, timeline } = universe;
  let sum = 0;
  let n = 0;
  for (const s of symbols) {
    const first = series[s].find((b) => b);
    const last = [...series[s]].reverse().find((b) => b);
    if (!first || !last) continue;
    sum += (last.c - first.c) / first.c;
    n++;
  }
  return { avgReturn: n ? sum / n : 0, days: (timeline.at(-1) - timeline[0]) / MS_DAY };
}

export function evaluate(result, universe) {
  const b = basic(result.trades);
  const days = (result.to - result.from) / MS_DAY;
  const bh = universe ? buyAndHold(universe, universe.symbols) : null;
  const totalReturn = (result.finalEquity - result.startCapital) / result.startCapital;
  return {
    ...b,
    days: Math.round(days),
    tradesPerWeek: days > 0 ? (b.trades / days) * 7 : 0,
    totalReturn,
    annualized: days > 0 ? Math.pow(1 + totalReturn, 365 / days) - 1 : 0,
    maxDrawdown: drawdown(result.equityCurve),
    halted: result.halted,
    weekly: byPeriod(result.trades, weekKey),
    monthly: byPeriod(result.trades, monthKey),
    buyHold: bh,
    exitBreakdown: countBy(result.trades, (t) => t.exitType),
  };
}

function countBy(arr, fn) {
  const m = {};
  for (const a of arr) m[fn(a)] = (m[fn(a)] ?? 0) + 1;
  return m;
}

const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`;
const yen = (v) => `¥${Math.round(v).toLocaleString("ja-JP")}`;

export function report(ev, title) {
  const L = [];
  L.push(`\n━━━ ${title} ━━━`);
  L.push(`期間 ${ev.days}日 / トレード ${ev.trades}件 (週あたり ${ev.tradesPerWeek.toFixed(1)}件)`);
  L.push(`勝率        ${pct(ev.winRate)}      期待値 ${yen(ev.expectancy)}/トレード`);
  L.push(`RR(利/損)   ${ev.rr === Infinity ? "∞" : ev.rr.toFixed(2)}      PF ${ev.profitFactor === Infinity ? "∞" : ev.profitFactor.toFixed(2)}`);
  L.push(`平均利益 ${yen(ev.avgWin)} / 平均損失 ${yen(ev.avgLoss)}   手数料計 ${yen(ev.fees)}`);
  L.push(`総リターン  ${pct(ev.totalReturn)}  (年率 ${pct(ev.annualized)})   最大DD ${pct(ev.maxDrawdown)}`);
  if (ev.buyHold) L.push(`ガチホ比較  等分ガチホ ${pct(ev.buyHold.avgReturn)} → 差 ${pct(ev.totalReturn - ev.buyHold.avgReturn)}`);
  if (ev.halted) L.push(`⚠ サーキットブレーカー作動`);
  L.push(`決済内訳    ${Object.entries(ev.exitBreakdown).map(([k, v]) => `${k}:${v}`).join("  ") || "なし"}`);
  for (const [label, p] of [["週次", ev.weekly], ["月次", ev.monthly]]) {
    L.push(
      `${label}  ${p.periods}期間 / 中央値${p.medianTrades}件  ` +
        `平均勝率 ${pct(p.meanWinRate)}(±${pct(p.winRateStd)})  ` +
        `勝率60%達成 ${pct(p.hitRate60)}  プラス期間 ${pct(p.profitablePeriods)}`
    );
  }
  return L.join("\n");
}
