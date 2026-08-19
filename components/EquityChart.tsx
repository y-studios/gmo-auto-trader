"use client";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LineChart as LineChartIcon } from "lucide-react";
import { RISK } from "@/lib/strategy.mjs";
import { pct, yen } from "@/lib/format";
import type { DashboardModel } from "@/lib/engine";

function fmtAxisDate(d: string) {
  const [, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}`;
}

type TooltipPayload = { payload?: { date: string; equity: number } };

function EquityTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length || !payload[0].payload) return null;
  const p = payload[0].payload;
  const diff = p.equity - RISK.startCapital;
  return (
    <div className="rounded-xl border border-line bg-surface shadow-card px-3 py-2 text-[12px]">
      <p className="text-ink-3 num">{p.date.replace(/-/g, "/")}</p>
      <p className="num font-extrabold text-[15px]">¥{p.equity.toLocaleString("ja-JP")}</p>
      <p className={`num font-bold ${diff >= 0 ? "text-mint-deep" : "text-coral"}`}>
        {yen(diff, { sign: true })} ({pct((diff / RISK.startCapital) * 100)})
      </p>
    </div>
  );
}

export function EquityChart({ m }: { m: DashboardModel }) {
  const data = m.equityCurve;
  const min = Math.min(...data.map((d) => d.equity), RISK.startCapital);
  const max = Math.max(...data.map((d) => d.equity), RISK.startCapital);
  const pad = Math.max(1000, (max - min) * 0.15);
  const peak = data.reduce((a, d) => (d.equity > a.equity ? d : a), data[0]);
  const trough = data.reduce((a, d) => (d.equity < a.equity ? d : a), data[0]);
  return (
    <section className="card p-5 sm:p-6 h-full flex flex-col" aria-label="資産推移チャート">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-ink-2 text-[13px] font-bold">
          <LineChartIcon size={16} className="text-mint-deep" />
          資産推移（日次・円）
        </div>
        <div className="flex items-center gap-3 text-[11px] text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-4 h-[3px] rounded bg-mint" />
            総資産
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-4 border-t-2 border-dashed border-ink-3" />
            元手 ¥100,000
          </span>
        </div>
      </div>

      <div className="mt-3 flex-1 min-h-[240px] h-[240px] sm:h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--mint)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--mint)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="0" />
            <XAxis dataKey="date" tickFormatter={fmtAxisDate} tick={{ fontSize: 11, fill: "var(--ink-3)" }} axisLine={false} tickLine={false} minTickGap={28} />
            <YAxis
              domain={[Math.floor((min - pad) / 1000) * 1000, Math.ceil((max + pad) / 1000) * 1000]}
              tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
              tick={{ fontSize: 11, fill: "var(--ink-3)" }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip content={<EquityTooltip />} cursor={{ stroke: "var(--line-strong)", strokeDasharray: "3 3" }} />
            <ReferenceLine y={RISK.startCapital} stroke="var(--ink-3)" strokeDasharray="5 5" />
            <Area
              type="monotone"
              dataKey="equity"
              stroke="var(--mint)"
              strokeWidth={2.5}
              fill="url(#eqFill)"
              dot={false}
              activeDot={{ r: 5, fill: "var(--mint)", stroke: "#fff", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 text-[11px]">
        <div className="rounded-xl bg-surface-2 border border-line px-3 py-2">
          <p className="text-ink-3 font-bold">最高（{fmtAxisDate(peak.date)}）</p>
          <p className="num font-bold">¥{peak.equity.toLocaleString("ja-JP")}</p>
        </div>
        <div className="rounded-xl bg-surface-2 border border-line px-3 py-2">
          <p className="text-ink-3 font-bold">最低（{fmtAxisDate(trough.date)}）</p>
          <p className="num font-bold">¥{trough.equity.toLocaleString("ja-JP")}</p>
        </div>
        <div className="rounded-xl bg-surface-2 border border-line px-3 py-2">
          <p className="text-ink-3 font-bold">直近7日</p>
          {(() => {
            const a = data[Math.max(0, data.length - 8)]?.equity ?? RISK.startCapital;
            const b = data[data.length - 1].equity;
            return <p className={`num font-bold ${b - a >= 0 ? "text-mint-deep" : "text-coral"}`}>{yen(b - a, { sign: true })}</p>;
          })()}
        </div>
      </div>
    </section>
  );
}
