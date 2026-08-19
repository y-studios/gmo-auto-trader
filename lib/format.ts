export const yen = (v: number, opts: { sign?: boolean; digits?: number } = {}) => {
  const { sign = false, digits = 0 } = opts;
  const abs = Math.abs(v).toLocaleString("ja-JP", { maximumFractionDigits: digits, minimumFractionDigits: digits });
  if (v < 0) return `-¥${abs}`;
  return `${sign && v > 0 ? "+" : ""}¥${abs}`;
};

export const pct = (v: number, opts: { sign?: boolean; digits?: number } = {}) => {
  const { sign = true, digits = 2 } = opts;
  const s = v.toFixed(digits);
  if (v < 0) return `${s}%`;
  return `${sign && v > 0 ? "+" : ""}${s}%`;
};

export const num = (v: number, digits = 0) => v.toLocaleString("ja-JP", { maximumFractionDigits: digits, minimumFractionDigits: digits });

const JST_FMT: Intl.DateTimeFormatOptions = { timeZone: "Asia/Tokyo" };

export const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  const y = d.toLocaleString("ja-JP", { ...JST_FMT, year: "numeric" }).replace(/年/, "");
  const md = d.toLocaleString("ja-JP", { ...JST_FMT, month: "2-digit", day: "2-digit" });
  const hm = d.toLocaleString("ja-JP", { ...JST_FMT, hour: "2-digit", minute: "2-digit", hour12: false });
  return `${y}/${md} ${hm}`;
};

export const fmtShortDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("ja-JP", { ...JST_FMT, month: "numeric", day: "numeric" });
};

export const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("ja-JP", { ...JST_FMT, hour: "2-digit", minute: "2-digit", hour12: false });
};

export const holdDuration = (fromIso: string, toIso: string) => {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  const h = Math.round(ms / 3600_000);
  if (h < 24) return `${h}時間`;
  const d = Math.floor(h / 24);
  const r = h % 24;
  return r ? `${d}日${r}時間` : `${d}日`;
};

export const sizeStr = (symbol: string, size: number) => {
  const digits = symbol === "BTC" ? 4 : symbol === "ETH" ? 2 : 1;
  return `${size.toFixed(digits).replace(/\.?0+$/, "")} ${symbol}`;
};
