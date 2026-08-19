import type { SymbolCode } from "@/lib/types";

const LABEL: Record<SymbolCode, string> = { BTC: "₿", ETH: "Ξ", SOL: "◎" };

export function CoinIcon({ symbol, size = 32, className = "" }: { symbol: SymbolCode; size?: number; className?: string }) {
  return (
    <span
      className={`coin-dot coin-${symbol} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden
    >
      {LABEL[symbol]}
    </span>
  );
}

export const SYMBOL_NAME: Record<SymbolCode, string> = { BTC: "ビットコイン", ETH: "イーサリアム", SOL: "ソラナ" };
export const PAIR: Record<SymbolCode, string> = { BTC: "BTC/JPY", ETH: "ETH/JPY", SOL: "SOL/JPY" };
