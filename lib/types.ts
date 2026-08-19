export type SymbolCode = "BTC" | "ETH" | "SOL";

export type ExitType = "stop_loss" | "take_profit" | "trailing" | "signal_exit" | "early_cut" | "emergency";

export interface ClosedTrade {
  id: string;
  symbol: SymbolCode;
  size: number;
  entryAt: string; // ISO (JST)
  entryPrice: number;
  exitAt: string;
  exitPrice: number;
  pnl: number; // 円
  pnlPct: number; // %
  exitType: ExitType;
  entryReason: string;
  exitReason: string;
}

export interface OpenPosition {
  id: string;
  symbol: SymbolCode;
  size: number;
  entryAt: string;
  entryPrice: number;
  peakPrice: number;
  entryReason: string;
}

export interface DecisionLog {
  id: string;
  at: string;
  symbol: SymbolCode | null;
  kind: "skip" | "hold" | "lot" | "halt" | "resume" | "system";
  title: string;
  reason: string;
}

export interface EquityPoint {
  date: string; // YYYY-MM-DD
  equity: number;
}

export type BotStatus = "running" | "halted";

export interface BotState {
  status: BotStatus;
  haltedAt: string | null;
  haltReason: string | null;
  /** 緊急停止で成行決済した保有ポジション（デモ内で反映） */
  emergencyClosed: Array<{ id: string; closedAt: string; price: number; pnl: number }>;
  events: DecisionLog[];
  updatedAt: string | null;
}

export interface ApiSettings {
  apiKey: string;
  apiSecret: string;
  savedAt: string | null;
  liveTrading: boolean;
}
