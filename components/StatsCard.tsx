"use client";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Trophy } from "lucide-react";
import { pct, yen } from "@/lib/format";
import type { DashboardModel } from "@/lib/engine";

export function StatsCard({ m }: { m: DashboardModel }) {
  const s = m.stats;
  const winRate = s.winRate * 100;
  const data = [
    { name: "勝ち", value: s.wins },
    { name: "負け", value: s.losses },
  ];
  const pf = Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞";
  const ddOk = s.maxDrawdown > -0.1;
  return (
    <section className="card p-5 sm:p-6 h-full flex flex-col" aria-label="トレード戦績と勝率">
      <div className="flex items-center gap-2 text-ink-2 text-[13px] font-bold">
        <Trophy size={16} className="text-mint-deep" />
        トレード戦績 ＆ 勝率メーター
      </div>

      <div className="flex items-center gap-4 mt-3">
        <div className="relative w-[128px] h-[128px] flex-none">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                innerRadius={46}
                outerRadius={60}
                startAngle={90}
                endAngle={-270}
                paddingAngle={2}
                cornerRadius={6}
                stroke="none"
                isAnimationActive={false}
              >
                <Cell fill="var(--mint)" />
                <Cell fill="var(--coral)" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="num text-[22px] font-extrabold leading-none">{winRate.toFixed(1)}%</span>
            <span className="text-[10px] text-ink-3 font-bold mt-1">勝率</span>
          </div>
        </div>
        <div className="min-w-0">
          <p className="num text-[15px] font-bold">
            <span className="text-mint-deep">{s.wins}勝</span> <span className="text-coral">{s.losses}敗</span>
            <span className="text-ink-3 font-medium text-[12px]"> / 総取引 {s.total}回</span>
          </p>
          <ul className="mt-2 space-y-1 text-[12px] text-ink-2">
            <li className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-mint" /> 平均利益 <span className="num font-bold text-ink">{yen(s.avgWin)}</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-coral" /> 平均損失 <span className="num font-bold text-ink">{yen(-s.avgLoss)}</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 mt-4">
        <div className="rounded-2xl bg-surface-2 border border-line px-3.5 py-3">
          <p className="text-[11px] text-ink-3 font-bold">プロフィットファクター（PF）</p>
          <p className="num text-[22px] font-extrabold leading-tight mt-0.5">{pf}</p>
          <p className="text-[10px] text-ink-3 num">総利益 {yen(s.grossProfit)} ÷ 総損失 {yen(s.grossLoss)}</p>
        </div>
        <div className="rounded-2xl bg-surface-2 border border-line px-3.5 py-3">
          <p className="text-[11px] text-ink-3 font-bold">最大ドローダウン</p>
          <p className={`num text-[22px] font-extrabold leading-tight mt-0.5 ${ddOk ? "text-ink" : "text-coral"}`}>{pct(s.maxDrawdown * 100, { digits: 1 })}</p>
          <p className={`text-[10px] num ${ddOk ? "text-mint-deep" : "text-coral"}`}>{ddOk ? "安全基準内（決済ベース）" : "要注意"}</p>
        </div>
      </div>
    </section>
  );
}
