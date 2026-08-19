// GMOコイン 公式 REST API クライアント（Public / Private）
// 依存なし・fetch + WebCrypto のみ。Node 20+ とブラウザで動く。
// 仕様: https://api.coin.z.com/docs/
//   - Public:  https://api.coin.z.com/public/v1/...
//   - Private: https://api.coin.z.com/private/v1/...（API-KEY / API-TIMESTAMP / API-SIGN ヘッダ）
//   - 署名: HMAC-SHA256(secret, timestamp + method + path + body) を hex で付与
//
// ★ ブラウザから Private API は叩かない設計（CORS ヘッダ無し・鍵がページ内に露出するため）。
//   実際の発注は scripts/bot.mjs（GitHub Actions / ローカル）側で行う。

export const PUBLIC_BASE = "https://api.coin.z.com/public";
export const PRIVATE_BASE = "https://api.coin.z.com/private";

/**
 * @param {string} secret
 * @param {string} text
 */
export async function hmacSha256Hex(secret, text) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(text));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Private API 用の署名ヘッダを作る（テスト可能なように分離）
 * @param {{apiKey:string, apiSecret:string}} cred
 * @param {"GET"|"POST"} method
 * @param {string} path 例: "/v1/account/assets"
 * @param {object} [body]
 * @param {number} [timestamp]
 */
export async function signRequest(cred, method, path, body, timestamp = Date.now()) {
  const ts = String(timestamp);
  const payload = body ? JSON.stringify(body) : "";
  const sign = await hmacSha256Hex(cred.apiSecret, ts + method + path + payload);
  return {
    "API-KEY": cred.apiKey,
    "API-TIMESTAMP": ts,
    "API-SIGN": sign,
    ...(body ? { "Content-Type": "application/json" } : {}),
  };
}

export class GmoApiError extends Error {
  /** @param {string} message @param {any} [detail] */
  constructor(message, detail) {
    super(message);
    this.name = "GmoApiError";
    this.detail = detail;
  }
}

export class GmoClient {
  /**
   * @param {{apiKey?:string, apiSecret?:string, fetchImpl?:typeof fetch}} [opts]
   */
  constructor(opts = {}) {
    this.apiKey = opts.apiKey ?? "";
    this.apiSecret = opts.apiSecret ?? "";
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  get hasCredentials() {
    return Boolean(this.apiKey && this.apiSecret);
  }

  /** @param {Response} res */
  async #unwrap(res) {
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new GmoApiError(`HTTP ${res.status}`, json);
    if (!json || json.status !== 0) {
      const msgs = json?.messages?.map((m) => `${m.message_code}: ${m.message_string}`).join(" / ");
      throw new GmoApiError(msgs || "GMO API error", json);
    }
    return json.data;
  }

  // ---------- Public ----------
  /** 取引所ステータス: OPEN / PREOPEN / MAINTENANCE */
  async status() {
    const d = await this.#unwrap(await this.fetchImpl(`${PUBLIC_BASE}/v1/status`));
    return d.status;
  }

  /** @param {string} symbol 例 "BTC" */
  async ticker(symbol) {
    const d = await this.#unwrap(await this.fetchImpl(`${PUBLIC_BASE}/v1/ticker?symbol=${symbol}`));
    const t = d[0];
    return { symbol, ask: Number(t.ask), bid: Number(t.bid), last: Number(t.last), high: Number(t.high), low: Number(t.low), volume: Number(t.volume), timestamp: t.timestamp };
  }

  /**
   * ローソク足。interval: 1min,5min,10min,15min,30min,1hour(→date=YYYYMMDD) / 4hour,8hour,12hour,1day,1week,1month(→date=YYYY)
   * @param {string} symbol
   * @param {string} interval
   * @param {string} date
   */
  async klines(symbol, interval, date) {
    const d = await this.#unwrap(await this.fetchImpl(`${PUBLIC_BASE}/v1/klines?symbol=${symbol}&interval=${interval}&date=${date}`));
    return d.map((k) => ({ openTime: Number(k.openTime), open: Number(k.open), high: Number(k.high), low: Number(k.low), close: Number(k.close), volume: Number(k.volume) }));
  }

  /**
   * 直近 N 時間分の1時間足（日付をまたいで連結）
   * @param {string} symbol
   * @param {number} hours
   * @param {Date} [now]
   */
  async hourlyCloses(symbol, hours = 120, now = new Date()) {
    const days = Math.ceil(hours / 24) + 1;
    /** @type {{openTime:number, close:number}[]} */
    let all = [];
    for (let i = days; i >= 0; i--) {
      // GMOの日足は 06:00 JST 始まり。date は JST 日付
      const d = new Date(now.getTime() - i * 86400_000 + 9 * 3600_000 - 6 * 3600_000);
      const ymd = d.toISOString().slice(0, 10).replace(/-/g, "");
      try {
        const k = await this.klines(symbol, "1hour", ymd);
        all = all.concat(k);
      } catch {
        /* 未来日・未公開は無視 */
      }
    }
    const seen = new Set();
    all = all.filter((k) => (seen.has(k.openTime) ? false : (seen.add(k.openTime), true))).sort((a, b) => a.openTime - b.openTime);
    return all.slice(-hours);
  }

  // ---------- Private ----------
  /**
   * @param {"GET"|"POST"} method
   * @param {string} path
   * @param {object} [body]
   * @param {string} [query]
   */
  async #priv(method, path, body, query = "") {
    if (!this.hasCredentials) throw new GmoApiError("APIキー未設定");
    const headers = await signRequest({ apiKey: this.apiKey, apiSecret: this.apiSecret }, method, path, body);
    const res = await this.fetchImpl(`${PRIVATE_BASE}${path}${query}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return this.#unwrap(res);
  }

  /** 資産残高（JPY と各通貨） */
  async assets() {
    const d = await this.#priv("GET", "/v1/account/assets");
    return d.map((a) => ({ symbol: a.symbol, amount: Number(a.amount), available: Number(a.available), conversionRate: Number(a.conversionRate) }));
  }

  /**
   * 現物の成行注文
   * @param {{symbol:string, side:"BUY"|"SELL", size:number|string}} o
   * @returns {Promise<string>} orderId
   */
  async marketOrder(o) {
    return this.#priv("POST", "/v1/order", { symbol: o.symbol, side: o.side, executionType: "MARKET", size: String(o.size) });
  }

  /** @param {string} [symbol] */
  async activeOrders(symbol) {
    return this.#priv("GET", "/v1/activeOrders", undefined, symbol ? `?symbol=${symbol}` : "");
  }

  /** @param {string[]} symbols */
  async cancelBulk(symbols) {
    return this.#priv("POST", "/v1/cancelBulkOrder", { symbols });
  }

  /** @param {string} symbol @param {number} [count=100] */
  async latestExecutions(symbol, count = 100) {
    return this.#priv("GET", "/v1/latestExecutions", undefined, `?symbol=${symbol}&count=${count}`);
  }

  /**
   * 緊急停止: 対象銘柄の未約定注文を全キャンセルし、保有数量を成行で全売却する
   * @param {string[]} symbols
   * @param {(msg:string)=>void} [log]
   */
  async emergencyCloseAll(symbols, log = () => {}) {
    const results = [];
    try {
      await this.cancelBulk(symbols);
      log(`未約定注文を全キャンセル: ${symbols.join(", ")}`);
    } catch (e) {
      log(`キャンセル失敗: ${e.message}`);
    }
    const assets = await this.assets();
    for (const s of symbols) {
      const a = assets.find((x) => x.symbol === s);
      if (!a || a.available <= 0) continue;
      try {
        const id = await this.marketOrder({ symbol: s, side: "SELL", size: a.available });
        results.push({ symbol: s, size: a.available, orderId: id });
        log(`${s} ${a.available} を成行売却 (orderId ${id})`);
      } catch (e) {
        results.push({ symbol: s, size: a.available, error: e.message });
        log(`${s} 売却失敗: ${e.message}`);
      }
    }
    return results;
  }
}
