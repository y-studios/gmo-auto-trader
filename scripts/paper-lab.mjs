// 複数戦略の同時ペーパー運用（架空資金）。
//
// 重要: バックテストと「同じ手順」で判定する。
//   バーの終値で判断 → 次のバーの始値で約定。損切り/利確はバーの高安で判定し、
//   同一バーで両方に触れたら損切り側に倒す。手数料とスリッページも同じ率で引く。
// こうしておかないと「ペーパーでは勝つのにバックテストと違う」が起きて比較にならない。
//
//   node scripts/paper-lab.mjs           通常実行（新しい確定足のぶんだけ進める）
//   node scripts/paper-lab.mjs --report  現在の成績を表示
import fs from "node:fs";
import path from "node:path";
import { GmoClient } from "../lib/gmo.mjs";
import { evaluate, report } from "../research/lib/metrics.mjs";

const LAB_FILE = path.join(import.meta.dirname, "..", "public", "data", "lab.json");
const SYMS = ["BTC", "XRP", "ETH", "SOL", "DOGE"];
const START_CAPITAL = 100_000;
const COSTS = { takerFeePct: 0.0005, makerFeePct: -0.0001, slippagePct: 0.0003 };
const STEPS = { BTC: 0.00001, ETH: 0.0001, SOL: 0.01, XRP: 1, DOGE: 1 };
const MIN_SIZE = { BTC: 0.00001, ETH: 0.001, SOL: 0.01, XRP: 1, DOGE: 10 };
const MIN_NOTIONAL = 1_000;
const MAX_CONCURRENT = 2;
const COOLDOWN_H = 4;
const LIMIT_TIMEOUT_BARS = 3;

/**
 * 比較する6案。バックテスト上の期待値（pf/ret）も一緒に持たせ、
 * 「ペーパーの結果がバックテストとどれだけズレたか」を測れるようにする。
 */
export const VARIANTS = [
  { id: "A", label: "breakout 本命（本番と同一）", module: "current",        maker: false, expect: { pf: 1.17, ret: 1.161 } },
  { id: "B", label: "breakout 指値(メイカー)",      module: "current",        maker: true,  expect: { pf: 1.29, ret: 2.582 } },
  { id: "C", label: "breakout-wide 薄利厚損切り",   module: "breakout-wide",  maker: false, expect: { pf: 1.37, ret: 3.267 } },
  { id: "D", label: "meanrev 高勝率型（勝率60%狙い）", module: "meanrev",      maker: false, expect: { pf: 0.80, ret: -0.801 } },
  { id: "E", label: "hold ガチホ（比較基準）",       module: "hold",           maker: false, expect: { pf: null, ret: 1.729 } },
  { id: "F", label: "volbreak レンジ幅ブレイク",     module: "volbreak",       maker: false, expect: { pf: 0.92, ret: -0.185 } },
];

const log = (...a) => console.log(new Date().toISOString(), ...a);

/** 欠損足を直前の値で埋めた終値配列（idx を含む） */
function closesUpTo(bars, idx) {
  const out = [];
  let prev = null;
  for (let k = 0; k <= idx; k++) {
    const b = bars[k];
    if (b) prev = b.c;
    if (prev != null) out.push(prev);
  }
  return out;
}

function emptyVariant() {
  return { cash: START_CAPITAL, positions: [], pending: [], trades: [], curve: [], lastExitAt: {}, skipped: 0 };
}

function loadLab() {
  if (fs.existsSync(LAB_FILE)) {
    try {
      const s = JSON.parse(fs.readFileSync(LAB_FILE, "utf8"));
      for (const v of VARIANTS) s.variants[v.id] = s.variants[v.id] ?? emptyVariant();
      return s;
    } catch (e) {
      log("lab.json 読み込み失敗。作り直す:", e.message);
    }
  }
  return {
    startedAt: new Date().toISOString(),
    startCapital: START_CAPITAL,
    lastBarTime: null,
    variants: Object.fromEntries(VARIANTS.map((v) => [v.id, emptyVariant()])),
  };
}

const saveLab = (s) => {
  fs.mkdirSync(path.dirname(LAB_FILE), { recursive: true });
  fs.writeFileSync(LAB_FILE, JSON.stringify(s, null, 2));
};

/** GMOの1時間足を {t,o,h,l,c,v} に揃える */
async function fetchBars(client, sym, hours = 220) {
  const raw = await client.hourlyCloses(sym, hours);
  return raw
    .filter((b) => b.openTime + 3600_000 <= Date.now()) // 確定足のみ
    .map((b) => ({ t: b.openTime, o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume }));
}

function roundSize(sym, notional, price) {
  const step = STEPS[sym];
  const size = Number((Math.floor(notional / price / step) * step).toFixed(8));
  return size >= MIN_SIZE[sym] ? size : 0;
}

/** 1本のバーぶん、ある案の状態を進める */
function stepVariant(v, strat, barsBySym, idx, t) {
  const equityAt = () => {
    let e = v.cash;
    for (const p of v.positions) {
      const b = barsBySym[p.symbol][idx];
      if (b) e += p.size * b.c;
    }
    return e;
  };

  // --- 1) 出してある注文の執行 ---
  const stillPending = [];
  for (const o of v.pending) {
    const bar = barsBySym[o.symbol][idx];
    if (!bar) continue;
    if (v.positions.some((p) => p.symbol === o.symbol) || v.positions.length >= MAX_CONCURRENT) continue;

    let price = null;
    let isMaker = false;
    if (o.limitPrice != null) {
      if (bar.l <= o.limitPrice) { price = Math.min(o.limitPrice, bar.o); isMaker = true; }
      else if (o.expiresAtBar <= t) continue;          // 期限切れでキャンセル
      else { stillPending.push(o); continue; }          // まだ板に置いたまま
    } else {
      price = bar.o * (1 + COSTS.slippagePct);          // 成行は次バー始値＋滑り
    }

    const size = roundSize(o.symbol, Math.min(o.notional, v.cash), price);
    const notional = size * price;
    if (!size || notional < MIN_NOTIONAL || notional > v.cash) continue;
    const fee = notional * (isMaker ? COSTS.makerFeePct : COSTS.takerFeePct);
    v.cash -= notional + fee;
    v.positions.push({
      symbol: o.symbol, size, entryPrice: price, entryAt: new Date(t).toISOString(), entryBar: t,
      entryIndex: idx, peak: price, feePaid: fee, levels: o.levels, reason: o.reason, maker: isMaker,
    });
  }
  v.pending = stillPending;

  // --- 2) 決済判定（バーの高安。損切りと利確に同時に触れたら損切り優先） ---
  for (const pos of [...v.positions]) {
    const bar = barsBySym[pos.symbol][idx];
    if (!bar || pos.entryBar === t) continue;
    const lv = pos.levels ?? {};
    const stop = lv.stopPct ? pos.entryPrice * (1 - lv.stopPct) : null;
    const tp = lv.tpPct ? pos.entryPrice * (1 + lv.tpPct) : null;
    const trail =
      lv.trailActivatePct != null && (pos.peak - pos.entryPrice) / pos.entryPrice >= lv.trailActivatePct
        ? pos.peak * (1 - lv.trailGapPct) : null;

    let exitPrice = null, exitType = null;
    const downs = [stop, trail].filter((x) => x != null);
    const down = downs.length ? Math.max(...downs) : null;
    if (down != null && bar.l <= down) {
      exitPrice = Math.min(down, bar.o);
      exitType = stop != null && down === stop ? "stop_loss" : "trailing";
    } else if (tp != null && bar.h >= tp) {
      exitPrice = Math.max(tp, bar.o);
      exitType = "take_profit";
    } else if (strat.exitSignal) {
      const closes = closesUpTo(barsBySym[pos.symbol], idx);
      const sig = strat.exitSignal({ symbol: pos.symbol, pos, bar, closes, params: strat.params ?? {}, i: idx });
      if (sig) { exitPrice = bar.c; exitType = sig.type ?? "signal_exit"; }
    }
    pos.peak = Math.max(pos.peak, bar.h);

    if (exitPrice != null) {
      // 利確は指値で置けるのでメイカー。損切り等は成行にせざるを得ない
      const exitMaker = pos.maker && exitType === "take_profit";
      const fill = exitMaker ? exitPrice : exitPrice * (1 - COSTS.slippagePct);
      const gross = pos.size * fill;
      const fee = gross * (exitMaker ? COSTS.makerFeePct : COSTS.takerFeePct);
      v.cash += gross - fee;
      const cost = pos.size * pos.entryPrice + pos.feePaid;
      const pnl = gross - fee - cost;
      v.trades.push({
        symbol: pos.symbol, entryAt: pos.entryBar, exitAt: t, holdBars: idx - pos.entryIndex,
        entryPrice: pos.entryPrice, exitPrice: fill, size: pos.size, notional: pos.size * pos.entryPrice,
        fees: pos.feePaid + fee, pnl, pnlPct: pnl / cost, exitType, entryReason: pos.reason,
      });
      v.positions = v.positions.filter((p) => p !== pos);
      v.lastExitAt[pos.symbol] = t;
    }
  }

  const equity = equityAt();
  v.curve.push({ t, equity: Math.round(equity), cash: Math.round(v.cash), open: v.positions.length });
  if (v.curve.length > 3000) v.curve = v.curve.slice(-3000);

  // --- 3) 新規エントリー判定（次のバーで執行） ---
  if (v.positions.length >= MAX_CONCURRENT) return;
  const warmup = strat.warmup ?? 200;
  if (idx < warmup) return;
  const slots = MAX_CONCURRENT - v.positions.length;
  const cands = [];
  for (const sym of SYMS) {
    if (v.positions.some((p) => p.symbol === sym)) continue;
    if (v.pending.some((p) => p.symbol === sym)) continue;
    if ((v.lastExitAt[sym] ?? 0) + COOLDOWN_H * 3600_000 > t) continue;
    const bars = barsBySym[sym];
    const bar = bars[idx];
    if (!bar) continue;
    const closes = closesUpTo(bars, idx);
    if (closes.length < warmup) continue;
    const d = strat.entry({ symbol: sym, bar, closes, bars, i: idx, params: strat.params ?? {}, equity, rng: Math.random });
    if (d && d.enter) cands.push({ symbol: sym, bar, ...d });
  }
  cands.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  for (const c of cands.slice(0, slots)) {
    const notional = Math.min(equity * (c.sizeFrac ?? 0.5), v.cash * 0.995);
    if (notional < MIN_NOTIONAL) { v.skipped++; continue; }
    v.pending.push({
      symbol: c.symbol, notional, levels: c.levels ?? {}, reason: c.reason,
      limitPrice: c.maker ? c.bar.c : null,
      expiresAtBar: t + LIMIT_TIMEOUT_BARS * 3600_000,
    });
  }
}

async function main() {
  const reportOnly = process.argv.includes("--report");
  const lab = loadLab();

  if (!reportOnly) {
    const client = new GmoClient({});
    const barsBySym = {};
    for (const sym of SYMS) barsBySym[sym] = await fetchBars(client, sym);

    // 全銘柄で共通のタイムライン（1時間刻み）に揃える
    const times = [...new Set(Object.values(barsBySym).flat().map((b) => b.t))].sort((a, b) => a - b);
    const aligned = {};
    for (const sym of SYMS) {
      const idx = new Map(barsBySym[sym].map((b) => [b.t, b]));
      aligned[sym] = times.map((t) => idx.get(t) ?? null);
    }

    const strats = {};
    for (const v of VARIANTS) {
      const m = (await import(`../research/strategies/${v.module}.mjs`)).default;
      strats[v.id] = { ...m, params: { ...(m.params ?? {}) } };
    }

    const from = lab.lastBarTime ? times.findIndex((t) => t > lab.lastBarTime) : Math.max(0, times.length - 1);
    if (from < 0) { log("新しい確定足なし"); saveLab(lab); return printReport(lab); }

    let processed = 0;
    for (let idx = from; idx < times.length; idx++) {
      for (const v of VARIANTS) {
        const st = strats[v.id];
        // 指値で出す案は entry の返り値に maker 印をつける
        const wrapped = v.maker
          ? { ...st, entry: (a) => { const d = st.entry(a); return d && d.enter ? { ...d, maker: true } : d; } }
          : st;
        stepVariant(lab.variants[v.id], wrapped, aligned, idx, times[idx]);
      }
      lab.lastBarTime = times[idx];
      processed++;
    }
    log(`${processed}本ぶん進めた（最終足 ${new Date(lab.lastBarTime).toISOString()}）`);
    saveLab(lab);
  }
  printReport(lab);
}

function printReport(lab) {
  const days = (Date.now() - new Date(lab.startedAt).getTime()) / 86400_000;
  console.log(`\nペーパー並走ラボ  開始 ${lab.startedAt.slice(0, 10)}（${days.toFixed(1)}日経過） 各案 元手 ¥${lab.startCapital.toLocaleString()}\n`);
  console.log("案".padEnd(4) + "内容".padEnd(34) + "件数".padStart(6) + "勝率".padStart(8) + "PF".padStart(7) + "資産".padStart(11) + "損益率".padStart(9) + "  バックテスト予想との差");
  console.log("─".repeat(110));
  for (const vd of VARIANTS) {
    const v = lab.variants[vd.id];
    const equity = v.curve.length ? v.curve[v.curve.length - 1].equity : lab.startCapital;
    const ret = equity / lab.startCapital - 1;
    const wins = v.trades.filter((t) => t.pnl > 0);
    const gp = wins.reduce((a, t) => a + t.pnl, 0);
    const gl = -v.trades.filter((t) => t.pnl <= 0).reduce((a, t) => a + t.pnl, 0);
    const pf = gl > 0 ? gp / gl : gp > 0 ? Infinity : 0;
    const wr = v.trades.length ? wins.length / v.trades.length : 0;
    const diff = vd.expect.pf != null && v.trades.length >= 5 ? `PF ${pf.toFixed(2)} vs 予想 ${vd.expect.pf.toFixed(2)}` : "件数不足で判定不可";
    console.log(
      vd.id.padEnd(4) + vd.label.padEnd(34) + String(v.trades.length).padStart(6) +
      `${(wr * 100).toFixed(1)}%`.padStart(8) + (pf === Infinity ? "∞" : pf.toFixed(2)).padStart(7) +
      `¥${equity.toLocaleString()}`.padStart(11) + `${(ret * 100).toFixed(1)}%`.padStart(9) + "  " + diff
    );
  }
  const total = VARIANTS.reduce((a, vd) => a + lab.variants[vd.id].trades.length, 0);
  console.log(`\n判定の目安: 各案30件以上のトレードが貯まるまで「成績が良い案」を採用しない（現在 合計${total}件）`);
}

main().catch((e) => { console.error(e); process.exit(1); });
