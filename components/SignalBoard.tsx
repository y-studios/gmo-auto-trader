"use client";
import { useMemo } from "react";
import { Activity, ChevronRight } from "lucide-react";
import { evaluateEntry, evaluateExit, snapshot, volatilityLotMultiplier } from "@/lib/strategy.mjs";
import { CoinIcon, PAIR } from "./CoinIcon";
import { fmtDateTime, num, pct, yen } from "@/lib/format";
import type { DashboardModel } from "@/lib/engine";
import type { SymbolCode } from "@/lib/types";

const SYMS: SymbolCode[] = ["BTC", "ETH", "SOL"];

function RsiBar({ value }: { value: number | null }) {
  const v = value ?? 50;
  return (
    <div className="relative h-1.5 rounded-full bg-surface-3 overflow-visible">
      <span className="absolute inset-y-0 left-0 w-[35%] rounded-l-full bg-mint-soft" />
      <span className="absolute inset-y-0 right-0 w-[25%] rounded-r-full bg-coral-soft" />
      <span className="absolute -top-[3px] w-3 h-3 rounded-full bg-ink border-2 border-white shadow" style={{ left: `calc(${Math.min(100, Math.max(0, v))}% - 6px)` }} />
    </div>
  );
}

export function SignalBoard({ m }: { m: DashboardModel }) {
  const rows = useMemo(() => {
    return SYMS.map((s) => {
      const closes = m.marketCloses[s];
      const snap = snapshot(closes);
      const open = m.openPositions.find((p) => p.symbol === s);
      const decision = open ? evaluateExit({ symbol: s, size: open.size, entryPrice: open.entryPrice, entryAt: open.entryAt, peakPrice: open.peakPrice }, snap) : evaluateEntry(snap);
      const vol = volatilityLotMultiplier(closes);
      const change24 = closes.length > 24 ? ((closes[closes.length - 1] - closes[closes.length - 25]) / closes[closes.length - 25]) * 100 : 0;
      return { s, snap, decision, open, vol, change24 };
    });
  }, [m.openPositions, m.marketCloses]);

  return (
    <section className="card p-5 sm:p-6 h-full flex flex-col" aria-label="AIテクニカル判定ボード">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-ink-2 text-[13px] font-bold">
          <Activity size={16} className="text-mint-deep" />
          AIテクニカル判定ボード（1時間足）
        </div>
        <span className="pill pill-gray num" title="GMOコイン公開API klines から取得した直近120本の1時間足で算出">
          GMOコイン公開API {fmtDateTime(m.marketClosesAt)} 取得
        </span>
      </div>

      <ul className="mt-3 divide-y divide-line">
        {rows.map(({ s, snap, decision, open, vol, change24 }) => {
          const action = decision.action;
          const badge =
            action === "buy"
              ? { cls: "pill-mint", label: "買いシグナル" }
              : action === "sell"
                ? { cls: "pill-coral", label: "決済シグナル" }
                : open
                  ? { cls: "pill-amber", label: "保有継続" }
                  : { cls: "pill-gray", label: "見送り・待機" };
          return (
            <li key={s} className="py-3.5 first:pt-2 last:pb-0">
              <div className="flex items-center gap-3">
                <CoinIcon symbol={s} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-[14px]">{PAIR[s]}</p>
                    <span className={`pill ${badge.cls}`}>{badge.label}</span>
                    {vol.multiplier < 1 && <span className="pill pill-amber">ボラ拡大→ロット半減</span>}
                  </div>
                  <p className="text-[11px] text-ink-3 num mt-0.5">
                    終値 {yen(snap.price)} ・ 24h <span className={change24 >= 0 ? "text-mint-deep" : "text-coral"}>{pct(change24)}</span> ・ スコア {decision.score}/6
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-3">
                <div className="rounded-xl bg-surface-2 border border-line px-3 py-2">
                  <p className="text-[10px] text-ink-3 font-bold">RSI(14)</p>
                  <p className="num text-[15px] font-extrabold leading-tight">{snap.rsi == null ? "–" : snap.rsi.toFixed(1)}</p>
                  <div className="mt-1.5">
                    <RsiBar value={snap.rsi} />
                  </div>
                </div>
                <div className="rounded-xl bg-surface-2 border border-line px-3 py-2">
                  <p className="text-[10px] text-ink-3 font-bold">MACD(hist)</p>
                  <p className={`num text-[15px] font-extrabold leading-tight ${(snap.hist ?? 0) >= 0 ? "text-mint-deep" : "text-coral"}`}>
                    {snap.hist == null ? "–" : `${snap.hist >= 0 ? "+" : ""}${num(snap.hist, s === "SOL" ? 1 : 0)}`}
                  </p>
                  <p className="text-[10px] text-ink-3 num">
                    {snap.histPrev != null && snap.hist != null ? (snap.hist > snap.histPrev ? "拡大中 ↗" : "縮小中 ↘") : ""}
                  </p>
                </div>
                <div className="rounded-xl bg-surface-2 border border-line px-3 py-2">
                  <p className="text-[10px] text-ink-3 font-bold">BB %B(20,2σ)</p>
                  <p className="num text-[15px] font-extrabold leading-tight">{snap.percentB == null ? "–" : `${(snap.percentB * 100).toFixed(0)}%`}</p>
                  <p className="text-[10px] text-ink-3 num">{snap.squeeze ? "スクイーズ中" : snap.bbLower != null && snap.bbUpper != null ? `${num(snap.bbLower)}〜${num(snap.bbUpper)}` : ""}</p>
                </div>
              </div>

              <p className="mt-2.5 text-[12px] text-ink-2 leading-relaxed">
                <ChevronRight size={12} className="inline -mt-0.5 text-mint-deep" /> <span className="font-bold text-ink">{decision.summary}</span>
                <span className="text-ink-3"> — {decision.reasons.join("／")}</span>
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
