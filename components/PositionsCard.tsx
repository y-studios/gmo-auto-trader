"use client";
import { Crosshair, ShieldCheck, Target } from "lucide-react";
import { CoinIcon, PAIR } from "./CoinIcon";
import { fmtDateTime, pct, sizeStr, yen, holdDuration } from "@/lib/format";
import type { DashboardModel } from "@/lib/engine";

export function PositionsCard({ m }: { m: DashboardModel }) {
  return (
    <section className="card p-5 sm:p-6 h-full flex flex-col" aria-label="現在保有中のポジション">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-ink-2 text-[13px] font-bold whitespace-nowrap">
          <Crosshair size={16} className="text-mint-deep" />
          現在保有中のポジション
        </div>
        <span className="pill pill-gray num flex-none">
          {m.openPositions.length}/2銘柄 ・ 投入 {m.exposurePct.toFixed(0)}%
        </span>
      </div>

      {m.openPositions.length === 0 ? (
        <div className="mt-4 flex-1 rounded-2xl border border-dashed border-line-strong bg-surface-2 p-5 text-center text-[13px] text-ink-3">
          {m.status === "halted" ? "緊急停止により全ポジションを成行決済済み。現在はノーポジション（現金100%）です。" : "現在ノーポジション。AIが次のエントリー条件を監視中です。"}
        </div>
      ) : (
        <ul className="mt-3 space-y-3">
          {m.openPositions.map((p) => {
            const up = p.unrealized >= 0;
            // 損切り〜利確の間での現在位置（0..1）
            const span = p.takeProfit - p.stopLoss;
            const pos = Math.min(1, Math.max(0, (p.lastPrice - p.stopLoss) / span));
            return (
              <li key={p.id} className="rounded-2xl border border-line bg-surface-2 p-4">
                <div className="flex items-center gap-3">
                  <CoinIcon symbol={p.symbol} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-[14px] leading-tight">
                      {PAIR[p.symbol]} <span className="pill pill-mint ml-1">買い</span>
                    </p>
                    <p className="text-[11px] text-ink-3 num mt-0.5">
                      保有量 {sizeStr(p.symbol, p.size)} ・ エントリー {yen(p.entryPrice)} ・ {fmtDateTime(p.entryAt)}（{holdDuration(p.entryAt, m.asOf)}）
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`num text-[18px] font-extrabold leading-tight ${up ? "text-mint-deep" : "text-coral"}`}>{yen(p.unrealized, { sign: true })}</p>
                    <p className={`num text-[12px] font-bold ${up ? "text-mint-deep" : "text-coral"}`}>{pct(p.unrealizedPct, { digits: 1 })}</p>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="relative h-2 rounded-full bg-gradient-to-r from-coral-soft via-surface-3 to-mint-soft overflow-visible">
                    <span className="absolute inset-y-0 left-0 w-[3px] bg-coral rounded-full" />
                    <span className="absolute inset-y-0 right-0 w-[3px] bg-mint rounded-full" />
                    {p.trailingStop && (
                      <span
                        className="absolute -top-[3px] w-[2px] h-[14px] bg-amber rounded"
                        style={{ left: `${Math.min(100, Math.max(0, ((p.trailingStop - p.stopLoss) / span) * 100))}%` }}
                        title={`トレーリング決済ライン ${yen(p.trailingStop)}`}
                      />
                    )}
                    <span
                      className="absolute -top-[4px] w-4 h-4 rounded-full bg-ink border-2 border-white shadow"
                      style={{ left: `calc(${pos * 100}% - 8px)` }}
                      title={`現在値 ${yen(p.lastPrice)}`}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2 text-[11px] num">
                    <span className="inline-flex items-center gap-1 text-coral font-bold">
                      <ShieldCheck size={12} /> 損切り {yen(p.stopLoss)} ({pct(-3, { digits: 1 })})
                    </span>
                    <span className="text-ink-3">現在 {yen(p.lastPrice)}</span>
                    <span className="inline-flex items-center gap-1 text-mint-deep font-bold">
                      <Target size={12} /> 利確 {yen(p.takeProfit)} (+5.0%)
                    </span>
                  </div>
                  {p.trailingStop && (
                    <p className="mt-1.5 text-[11px] text-amber-700 num">
                      🟡 トレーリング発動中: 最高値 {yen(Math.max(p.peakPrice, p.lastPrice))}（+{p.peakGainPct.toFixed(2)}%）→ {yen(p.trailingStop)} で自動利確
                    </p>
                  )}
                </div>
                <p className="mt-2.5 text-[12px] text-ink-2 leading-relaxed">
                  <span className="font-bold text-ink">AIのエントリー理由:</span> {p.entryReason}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
