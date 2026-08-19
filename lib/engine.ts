import { RISK, circuitBreaker, stats as calcStats } from "./strategy.mjs";
import {
  PRESET_AS_OF,
  PRESET_CLOSED_TRADES,
  PRESET_DECISION_LOGS,
  PRESET_EQUITY_CURVE,
  PRESET_LAST_PRICES,
  PRESET_MARKET_CLOSES,
  PRESET_MARKET_CLOSES_AT,
  PRESET_OPEN_POSITIONS,
  PRESET_START_AT,
} from "./preset-data";
import type { BotState, ClosedTrade, DecisionLog, EquityPoint, ExitType, OpenPosition, SymbolCode } from "./types";

/** ダッシュボードが描画する元データ。プリセット（シミュレーション）か、ボットが書き出した state.json のどちらか */
export interface Dataset {
  source: "preset" | "bot";
  mode?: "paper" | "live";
  asOf: string;
  startAt: string;
  lastPrices: Record<SymbolCode, number>;
  closedTrades: ClosedTrade[];
  openPositions: OpenPosition[];
  decisionLogs: DecisionLog[];
  equityCurve: EquityPoint[];
  marketCloses: Record<SymbolCode, number[]>;
  marketClosesAt: string;
  haltedByBot?: { at: string; reason: string } | null;
}

export const PRESET_DATASET: Dataset = {
  source: "preset",
  asOf: PRESET_AS_OF,
  startAt: PRESET_START_AT,
  lastPrices: PRESET_LAST_PRICES,
  closedTrades: PRESET_CLOSED_TRADES,
  openPositions: PRESET_OPEN_POSITIONS,
  decisionLogs: PRESET_DECISION_LOGS,
  equityCurve: PRESET_EQUITY_CURVE,
  marketCloses: PRESET_MARKET_CLOSES,
  marketClosesAt: PRESET_MARKET_CLOSES_AT,
  haltedByBot: null,
};

export interface OpenPositionView extends OpenPosition {
  lastPrice: number;
  value: number;
  unrealized: number;
  unrealizedPct: number;
  takeProfit: number;
  stopLoss: number;
  trailingStop: number | null;
  peakGainPct: number;
  /** 利確までの残り% */
  toTakeProfitPct: number;
  toStopLossPct: number;
}

export type TimelineTone = "mint" | "coral" | "gray" | "amber" | "blue";

export interface TimelineItem {
  id: string;
  at: string;
  type: "exit" | "entry" | "decision" | "system";
  symbol: SymbolCode | null;
  title: string;
  amount: number | null;
  pct: number | null;
  reason: string;
  subReason?: string;
  exitType?: ExitType;
  tone: TimelineTone;
  size?: number;
  price?: number;
}

export interface DashboardModel {
  source: Dataset["source"];
  mode: Dataset["mode"];
  marketCloses: Record<SymbolCode, number[]>;
  marketClosesAt: string;
  asOf: string;
  startAt: string;
  dayIndex: number;
  lastPrices: Record<SymbolCode, number>;
  closedTrades: ClosedTrade[];
  openPositions: OpenPositionView[];
  cash: number;
  equity: number;
  realized: number;
  unrealized: number;
  totalPnl: number;
  totalPnlPct: number;
  stats: ReturnType<typeof calcStats>;
  equityCurve: EquityPoint[];
  timeline: TimelineItem[];
  circuit: ReturnType<typeof circuitBreaker>;
  status: BotState["status"];
  haltedAt: string | null;
  haltReason: string | null;
  exposurePct: number;
}

export const EXIT_LABEL: Record<ExitType, { label: string; tone: TimelineTone }> = {
  take_profit: { label: "利確完了（+5%目標）", tone: "mint" },
  trailing: { label: "トレーリング利確", tone: "mint" },
  signal_exit: { label: "シグナル決済", tone: "mint" },
  stop_loss: { label: "損切り発動", tone: "coral" },
  early_cut: { label: "早期カット", tone: "coral" },
  emergency: { label: "緊急停止・成行決済", tone: "amber" },
};

export const DECISION_LABEL: Record<DecisionLog["kind"], TimelineTone> = {
  skip: "gray",
  hold: "blue",
  lot: "amber",
  halt: "coral",
  resume: "mint",
  system: "gray",
};

const dayIndexOf = (startAt: string, asOf: string) => Math.floor((new Date(asOf).getTime() - new Date(startAt).getTime()) / 86400_000) + 1;

export function buildModel(bot: BotState, ds: Dataset = PRESET_DATASET): DashboardModel {
  const lastPrices = ds.lastPrices;
  const asOf = bot.emergencyClosed.length && bot.haltedAt && new Date(bot.haltedAt) > new Date(ds.asOf) ? bot.haltedAt : ds.asOf;

  // 緊急停止で決済されたポジション → 決済済み取引へ
  const emergencyTrades: ClosedTrade[] = bot.emergencyClosed
    .map((c): ClosedTrade | null => {
      const p = ds.openPositions.find((x) => x.id === c.id);
      if (!p) return null;
      return {
        id: `E-${p.id}`,
        symbol: p.symbol,
        size: p.size,
        entryAt: p.entryAt,
        entryPrice: p.entryPrice,
        exitAt: c.closedAt,
        exitPrice: c.price,
        pnl: c.pnl,
        pnlPct: Math.round(((c.price - p.entryPrice) / p.entryPrice) * 10000) / 100,
        exitType: "emergency" as const,
        entryReason: p.entryReason,
        exitReason: "🚨 緊急停止ボタンにより全ポジションを成行で決済。自動売買は停止中",
      };
    })
    .filter((t): t is ClosedTrade => t != null);

  const closedTrades = [...ds.closedTrades, ...emergencyTrades].sort((a, b) => new Date(a.exitAt).getTime() - new Date(b.exitAt).getTime());
  const closedIds = new Set(bot.emergencyClosed.map((c) => c.id));
  const openRaw = ds.openPositions.filter((p) => !closedIds.has(p.id));

  const openPositions: OpenPositionView[] = openRaw.map((p) => {
    const lastPrice = lastPrices[p.symbol];
    const value = lastPrice * p.size;
    const unrealized = (lastPrice - p.entryPrice) * p.size;
    const unrealizedPct = ((lastPrice - p.entryPrice) / p.entryPrice) * 100;
    const takeProfit = Math.round(p.entryPrice * (1 + RISK.takeProfitPct));
    const stopLoss = Math.round(p.entryPrice * (1 - RISK.stopLossPct));
    const peak = Math.max(p.peakPrice, lastPrice);
    const peakGainPct = ((peak - p.entryPrice) / p.entryPrice) * 100;
    const trailingStop = peakGainPct >= RISK.trailingActivatePct * 100 ? Math.round(peak * (1 - RISK.trailingGapPct)) : null;
    return {
      ...p,
      lastPrice,
      value,
      unrealized,
      unrealizedPct,
      takeProfit,
      stopLoss,
      trailingStop,
      peakGainPct,
      toTakeProfitPct: ((takeProfit - lastPrice) / lastPrice) * 100,
      toStopLossPct: ((lastPrice - stopLoss) / lastPrice) * 100,
    };
  });

  const stats = calcStats(closedTrades);
  const realized = stats.realized;
  const unrealized = openPositions.reduce((a, p) => a + p.unrealized, 0);
  const cash = RISK.startCapital + realized - openPositions.reduce((a, p) => a + p.entryPrice * p.size, 0);
  const equity = RISK.startCapital + realized + unrealized;
  const totalPnl = equity - RISK.startCapital;
  const exposurePct = equity > 0 ? (openPositions.reduce((a, p) => a + p.value, 0) / equity) * 100 : 0;

  const equityCurve = [...ds.equityCurve];
  equityCurve[equityCurve.length - 1] = { ...equityCurve[equityCurve.length - 1], equity: Math.round(equity) };

  // タイムライン
  const timeline: TimelineItem[] = [];
  for (const t of closedTrades) {
    const meta = EXIT_LABEL[t.exitType];
    timeline.push({
      id: `${t.id}-exit`,
      at: t.exitAt,
      type: "exit",
      symbol: t.symbol,
      title: meta.label,
      amount: t.pnl,
      pct: t.pnlPct,
      reason: t.exitReason,
      subReason: t.entryReason,
      exitType: t.exitType,
      tone: meta.tone,
      size: t.size,
      price: t.exitPrice,
    });
  }
  for (const p of openRaw) {
    timeline.push({
      id: `${p.id}-entry`,
      at: p.entryAt,
      type: "entry",
      symbol: p.symbol,
      title: "新規エントリー（買い）",
      amount: null,
      pct: null,
      reason: p.entryReason,
      tone: "blue",
      size: p.size,
      price: p.entryPrice,
    });
  }
  for (const l of [...ds.decisionLogs, ...bot.events]) {
    timeline.push({
      id: l.id,
      at: l.at,
      type: l.kind === "halt" || l.kind === "resume" || l.kind === "system" ? "system" : "decision",
      symbol: l.symbol,
      title: l.title,
      amount: null,
      pct: null,
      reason: l.reason,
      tone: DECISION_LABEL[l.kind],
    });
  }
  timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const haltedByBot = Boolean(ds.haltedByBot);
  return {
    source: ds.source,
    mode: ds.mode,
    marketCloses: ds.marketCloses,
    marketClosesAt: ds.marketClosesAt,
    asOf,
    startAt: ds.startAt,
    dayIndex: Math.min(RISK.challengeDays, dayIndexOf(ds.startAt, ds.asOf)),
    lastPrices,
    closedTrades,
    openPositions,
    cash,
    equity,
    realized,
    unrealized,
    totalPnl,
    totalPnlPct: (totalPnl / RISK.startCapital) * 100,
    stats,
    equityCurve,
    timeline,
    circuit: circuitBreaker(equity),
    status: haltedByBot ? "halted" : bot.status,
    haltedAt: haltedByBot ? ds.haltedByBot!.at : bot.haltedAt,
    haltReason: haltedByBot ? ds.haltedByBot!.reason : bot.haltReason,
    exposurePct,
  };
}

export const INITIAL_BOT_STATE: BotState = {
  status: "running",
  haltedAt: null,
  haltReason: null,
  emergencyClosed: [],
  events: [],
  updatedAt: null,
};
