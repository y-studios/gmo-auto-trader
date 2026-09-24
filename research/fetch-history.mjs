// GMOコイン 取引所現物の1時間足を全期間ローカルに落とす（バックテスト用）
// 出力: research/data/<SYMBOL>_1hour.csv  (openTime,open,high,low,close,volume)
// 再実行すると不足分だけ取りに行く（レジューム対応）

import fs from "node:fs";
import path from "node:path";

const BASE = "https://api.coin.z.com/public";
const OUT = path.join(import.meta.dirname, "data");
const SYMBOLS = ["BTC", "XRP", "ETH", "SOL", "DOGE", "ADA", "LINK", "XLM"];
const START = "20220101";   // これ以前は klines が Not found
const REQ_GAP_MS = 130;     // 公開APIへの礼儀（1秒あたり数発に抑える）
const CONCURRENCY = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

function dateRange(startYmd) {
  const out = [];
  const d = new Date(`${startYmd.slice(0, 4)}-${startYmd.slice(4, 6)}-${startYmd.slice(6, 8)}T12:00:00+09:00`);
  // 当日ぶんは未確定足が混じるので前日まで
  const end = new Date(Date.now() - 24 * 3600 * 1000);
  while (d <= end) {
    out.push(ymd(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

async function getKlines(symbol, date, attempt = 0) {
  try {
    const res = await fetch(`${BASE}/v1/klines?symbol=${symbol}&interval=1hour&date=${date}`);
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    if (j.status !== 0) {
      // ERR-5207 Not found = その日はまだ上場していない／データ無し
      if (j.messages?.[0]?.message_code === "ERR-5207") return [];
      throw new Error(j.messages?.[0]?.message_string ?? `status ${j.status}`);
    }
    return j.data ?? [];
  } catch (e) {
    if (attempt >= 5) throw e;
    await sleep(1000 * 2 ** attempt);
    return getKlines(symbol, date, attempt + 1);
  }
}

/** 既存CSVを読み、openTime -> 行 のMapにする */
function loadExisting(file) {
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  for (const line of lines.slice(1)) {
    const t = line.slice(0, line.indexOf(","));
    if (t) map.set(Number(t), line);
  }
  return map;
}

async function fetchSymbol(symbol, dates) {
  const file = path.join(OUT, `${symbol}_1hour.csv`);
  const rows = loadExisting(file);
  const before = rows.size;
  // 既に持っている最終足の翌日から取る（欠損日の再取得はしない＝上場前の空振りを繰り返さない）
  let from = 0;
  if (rows.size) {
    const lastT = Math.max(...rows.keys());
    from = lastT;
  }
  let fetched = 0;
  for (const date of dates) {
    // 取得済み範囲は飛ばす（最終足の属する日だけは未完の可能性があるので取り直す）
    if (from) {
      const dayEnd = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T23:59:59+09:00`).getTime();
      if (dayEnd < from) continue;
    }
    const data = await getKlines(symbol, date);
    for (const k of data) {
      const t = Number(k.openTime);
      rows.set(t, `${t},${k.open},${k.high},${k.low},${k.close},${k.volume}`);
    }
    fetched++;
    await sleep(REQ_GAP_MS);
  }
  const sorted = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  fs.writeFileSync(file, "openTime,open,high,low,close,volume\n" + sorted.join("\n") + "\n");
  const firstT = sorted.length ? Number(sorted[0].slice(0, sorted[0].indexOf(","))) : null;
  console.log(
    `[${symbol}] ${sorted.length.toLocaleString()}本 (+${sorted.length - before})  ` +
      `${firstT ? new Date(firstT).toISOString().slice(0, 10) : "-"} 〜  APIリクエスト ${fetched}日分`
  );
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const dates = dateRange(START);
  console.log(`対象 ${SYMBOLS.length}銘柄 × ${dates.length}日 (${START}〜)`);
  const queue = [...SYMBOLS];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const s = queue.shift();
      try {
        await fetchSymbol(s, dates);
      } catch (e) {
        console.error(`[${s}] 失敗: ${e.message}`);
      }
    }
  });
  await Promise.all(workers);
  console.log("完了");
}

main();
