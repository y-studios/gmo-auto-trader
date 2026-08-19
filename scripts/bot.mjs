#!/usr/bin/env node
// GMOコイン自動売買AI — ボットランナー（GitHub Actions の cron / ローカルで実行）
//
//   node scripts/bot.mjs            1回分の判定・発注を行い public/data/state.json を更新
//   node scripts/bot.mjs --check    APIキーの疎通確認（資産残高を表示）だけ行う
//   node scripts/bot.mjs --emergency 未約定注文キャンセル＋保有全売却＋停止フラグ（実弾時はGMOへ発注）
//   node scripts/bot.mjs --resume   停止フラグを解除
//
// 環境変数:
//   GMO_API_KEY / GMO_API_SECRET  GMOコインのAPIキー（Read/Trade。出金権限は付けない）
//   LIVE_TRADING=true             実際に成行注文を出す（未設定なら「ペーパー」＝実際の価格で仮想売買のみ）
//   STATE_FILE                    既定 public/data/state.json
//
// 1時間足の確定値で判定するため、15分おきに起動しても「同じ足で二度判定しない」よう lastBarTime を記録する。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { GmoClient } from "../lib/gmo.mjs";
import {
  RISK,
  snapshot,
  evaluateEntry,
  evaluateExit,
  positionSize,
  circuitBreaker,
  volatilityLotMultiplier,
  stats,
} from "../lib/strategy.mjs";

const STATE_FILE = process.env.STATE_FILE || "public/data/state.json";
const LIVE = process.env.LIVE_TRADING === "true";
const args = new Set(process.argv.slice(2));
const SYMS = /** @type {const} */ (["BTC", "ETH", "SOL"]);
const JST = 9 * 3600_000;

const log = (...a) => console.log(new Date().toISOString(), ...a);
const nowIso = () => new Date().toISOString();
const jstDate = (d = new Date()) => new Date(d.getTime() + JST).toISOString().slice(0, 10);
const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function loadState() {
  if (existsSync(STATE_FILE)) {
    try {
      const s = JSON.parse(readFileSync(STATE_FILE, "utf8"));
      if (s && s.source === "bot") return s;
    } catch {
      /* fallthrough */
    }
  }
  return {
    source: "bot",
    mode: LIVE ? "live" : "paper",
    startAt: nowIso(),
    asOf: nowIso(),
    paperCash: RISK.startCapital,
    lastPrices: { BTC: 0, ETH: 0, SOL: 0 },
    closedTrades: [],
    openPositions: [],
    decisionLogs: [],
    equityCurve: [],
    marketCloses: { BTC: [], ETH: [], SOL: [] },
    marketClosesAt: nowIso(),
    lastBarTime: {},
    lastExitAt: {},
    haltedByBot: null,
  };
}

function saveState(s) {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  s.asOf = nowIso();
  s.mode = LIVE ? "live" : "paper";
  // ログは最新80件、決済は全件保持
  s.decisionLogs = s.decisionLogs.slice(0, 80);
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 1));
  log("state saved ->", STATE_FILE);
}

function addLog(s, { symbol = null, kind, title, reason }) {
  s.decisionLogs.unshift({ id: uid("L"), at: nowIso(), symbol, kind, title, reason });
}

/** 口座の現金（実弾なら JPY available、ペーパーなら state.paperCash） */
async function getCash(client, s) {
  if (!LIVE) return s.paperCash;
  const assets = await client.assets();
  const jpy = assets.find((a) => a.symbol === "JPY");
  return jpy ? jpy.available : 0;
}

async function main() {
  const client = new GmoClient({ apiKey: process.env.GMO_API_KEY, apiSecret: process.env.GMO_API_SECRET });
  const s = loadState();

  if (args.has("--check")) {
    log("GMO status:", await client.status());
    if (!client.hasCredentials) {
      log("APIキー未設定（GMO_API_KEY / GMO_API_SECRET）。Public API のみ疎通OK");
      return;
    }
    const assets = await client.assets();
    for (const a of assets) if (a.amount > 0) log(`  ${a.symbol}: amount=${a.amount} available=${a.available} rate=${a.conversionRate}`);
    log("Private API 疎通OK");
    return;
  }

  if (args.has("--resume")) {
    s.haltedByBot = null;
    addLog(s, { kind: "resume", title: "自動売買を再開", reason: "停止フラグを解除。次の1時間足確定から判定を再開" });
    saveState(s);
    return;
  }

  // 価格取得
  const tickers = {};
  for (const sym of SYMS) tickers[sym] = await client.ticker(sym);
  for (const sym of SYMS) s.lastPrices[sym] = tickers[sym].last;

  if (args.has("--emergency")) {
    await emergencyStop(client, s, "手動の緊急停止コマンド");
    saveState(s);
    return;
  }

  if (s.haltedByBot) {
    log("停止中（", s.haltedByBot.reason, "）。判定・発注は行わず、価格と評価だけ更新");
    await refreshMarket(client, s);
    updateCurve(s);
    saveState(s);
    return;
  }

  if (LIVE && !client.hasCredentials) {
    throw new Error("LIVE_TRADING=true ですが GMO_API_KEY / GMO_API_SECRET が未設定です");
  }
  const status = await client.status();
  if (status !== "OPEN") {
    addLog(s, { kind: "system", title: `取引所ステータス ${status}`, reason: "GMOコインがメンテナンス/プレオープン中のため判定をスキップ" });
    saveState(s);
    return;
  }

  await refreshMarket(client, s);

  // 1) 既存ポジションの決済判定
  for (const pos of [...s.openPositions]) {
    const closes = s.marketCloses[pos.symbol];
    const snap = snapshot(closes);
    snap.price = s.lastPrices[pos.symbol]; // 判定は最新ティックで
    pos.peakPrice = Math.max(pos.peakPrice ?? pos.entryPrice, snap.price);
    const d = evaluateExit(pos, snap);
    if (d.action === "sell") {
      await closePosition(client, s, pos, snap.price, d.exitType, d.reasons.join("。"));
    }
  }

  // 2) 緊急停止ライン
  const cash = await getCash(client, s);
  if (LIVE) s.liveCash = cash;
  const equity = cash + s.openPositions.reduce((a, p) => a + p.size * s.lastPrices[p.symbol], 0);
  const cb = circuitBreaker(equity);
  if (cb.halted) {
    await emergencyStop(client, s, cb.message);
    saveState(s);
    return;
  }

  // 3) 新規エントリー判定（1時間足が新しく確定したときだけ）
  for (const sym of SYMS) {
    const closes = s.marketCloses[sym];
    const barTime = s.marketBarTimes?.[sym];
    if (barTime && s.lastBarTime[sym] === barTime) continue; // 同じ足では再判定しない
    s.lastBarTime[sym] = barTime;
    if (s.openPositions.some((p) => p.symbol === sym)) continue;
    if (s.openPositions.length >= RISK.maxConcurrent) {
      addLog(s, { symbol: sym, kind: "skip", title: "見送り（同時保有上限）", reason: `同時保有 ${RISK.maxConcurrent} 銘柄の上限に達しているため新規エントリーなし` });
      continue;
    }
    const lastExit = s.lastExitAt[sym];
    if (lastExit && Date.now() - new Date(lastExit).getTime() < RISK.cooldownHours * 3600_000) {
      addLog(s, { symbol: sym, kind: "skip", title: "見送り（クールダウン）", reason: `決済から ${RISK.cooldownHours} 時間のクールダウン中` });
      continue;
    }
    const snap = snapshot(closes);
    const d = evaluateEntry(snap);
    if (d.action !== "buy") {
      addLog(s, { symbol: sym, kind: "skip", title: d.action === "skip" ? "見送り（待機）" : "見送り（条件未達）", reason: `${d.summary}。${d.reasons.join("／")}` });
      continue;
    }
    const vol = volatilityLotMultiplier(closes);
    const cashNow = await getCash(client, s);
    const exposure = s.openPositions.reduce((a, p) => a + p.size * s.lastPrices[p.symbol], 0);
    const size = positionSize({ symbol: sym, price: s.lastPrices[sym], equity: cashNow + exposure, cash: cashNow, openExposure: exposure, lotMultiplier: vol.multiplier });
    if (!size) {
      addLog(s, { symbol: sym, kind: "skip", title: "見送り（資金不足）", reason: "計算したロットが最小注文単位/最低金額を下回るため見送り" });
      continue;
    }
    if (vol.multiplier < 1) addLog(s, { symbol: sym, kind: "lot", title: "ロット半減（ボラティリティ連動）", reason: `24h値幅が7日平均の ${vol.ratio.toFixed(2)} 倍に拡大。ロットを50%に縮小` });
    await openPosition(client, s, sym, size, s.lastPrices[sym], `${d.summary}。${d.reasons.join("／")}`);
  }

  updateCurve(s);
  saveState(s);
  const st = stats(s.closedTrades);
  log(`done: equity≈¥${Math.round(equity).toLocaleString()} trades=${st.total} win=${(st.winRate * 100).toFixed(1)}% PF=${st.profitFactor.toFixed(2)} open=${s.openPositions.length}`);
}

async function refreshMarket(client, s) {
  s.marketBarTimes = s.marketBarTimes || {};
  for (const sym of SYMS) {
    const bars = await client.hourlyCloses(sym, 170);
    // 最後の足は未確定の可能性があるため、確定済み（openTime + 1h <= now）のみ使う
    const done = bars.filter((b) => b.openTime + 3600_000 <= Date.now());
    s.marketCloses[sym] = done.slice(-120).map((b) => b.close);
    s.marketBarTimes[sym] = done.length ? done[done.length - 1].openTime : null;
  }
  s.marketClosesAt = nowIso();
}

function updateCurve(s) {
  const equity = (LIVE ? (s.liveCash ?? RISK.startCapital) : s.paperCash) + s.openPositions.reduce((a, p) => a + p.size * s.lastPrices[p.symbol], 0);
  const date = jstDate();
  const i = s.equityCurve.findIndex((p) => p.date === date);
  if (i >= 0) s.equityCurve[i].equity = Math.round(equity);
  else s.equityCurve.push({ date, equity: Math.round(equity) });
}

async function openPosition(client, s, symbol, size, price, reason) {
  let fill = price;
  if (LIVE) {
    const orderId = await client.marketOrder({ symbol, side: "BUY", size });
    log(`LIVE BUY ${symbol} ${size} orderId=${orderId}`);
    // 約定価格は直近約定から取得（失敗時はティック）
    try {
      const ex = await client.latestExecutions(symbol, 5);
      const mine = ex?.list?.find((e) => String(e.orderId) === String(orderId));
      if (mine) fill = Number(mine.price);
    } catch {
      /* noop */
    }
  } else {
    s.paperCash -= size * price;
  }
  const pos = { id: uid("P"), symbol, size, entryAt: nowIso(), entryPrice: fill, peakPrice: fill, entryReason: reason };
  s.openPositions.push(pos);
  log(`${LIVE ? "LIVE" : "PAPER"} OPEN ${symbol} ${size} @ ${fill}`);
}

async function closePosition(client, s, pos, price, exitType, reason) {
  let fill = price;
  if (LIVE) {
    const orderId = await client.marketOrder({ symbol: pos.symbol, side: "SELL", size: pos.size });
    log(`LIVE SELL ${pos.symbol} ${pos.size} orderId=${orderId}`);
    try {
      const ex = await client.latestExecutions(pos.symbol, 5);
      const mine = ex?.list?.find((e) => String(e.orderId) === String(orderId));
      if (mine) fill = Number(mine.price);
    } catch {
      /* noop */
    }
  } else {
    s.paperCash += pos.size * price;
  }
  const pnl = Math.round((fill - pos.entryPrice) * pos.size);
  s.closedTrades.push({
    id: uid("T"),
    symbol: pos.symbol,
    size: pos.size,
    entryAt: pos.entryAt,
    entryPrice: pos.entryPrice,
    exitAt: nowIso(),
    exitPrice: fill,
    pnl,
    pnlPct: Math.round(((fill - pos.entryPrice) / pos.entryPrice) * 10000) / 100,
    exitType,
    entryReason: pos.entryReason,
    exitReason: reason,
  });
  s.openPositions = s.openPositions.filter((p) => p.id !== pos.id);
  s.lastExitAt[pos.symbol] = nowIso();
  log(`${LIVE ? "LIVE" : "PAPER"} CLOSE ${pos.symbol} @ ${fill} pnl=${pnl} (${exitType})`);
}

async function emergencyStop(client, s, reason) {
  log("EMERGENCY STOP:", reason);
  if (LIVE && client.hasCredentials) {
    await client.emergencyCloseAll([...SYMS], log);
  }
  for (const pos of [...s.openPositions]) {
    await closePosition({ marketOrder: async () => "emergency", latestExecutions: async () => null }, s, pos, s.lastPrices[pos.symbol], "emergency", `緊急停止: ${reason}`);
  }
  s.haltedByBot = { at: nowIso(), reason };
  addLog(s, { kind: "halt", title: "緊急停止・全ポジション成行決済", reason });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
