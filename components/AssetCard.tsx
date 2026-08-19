"use client";
import { motion } from "framer-motion";
import { Hourglass, TrendingUp, Wallet } from "lucide-react";
import { RISK } from "@/lib/strategy.mjs";
import { pct, yen, fmtDateTime } from "@/lib/format";
import type { DashboardModel } from "@/lib/engine";

export function AssetCard({ m }: { m: DashboardModel }) {
  const up = m.totalPnl >= 0;
  const progress = Math.min(100, (m.dayIndex / RISK.challengeDays) * 100);
  return (
    <section className="card p-5 sm:p-6 flex flex-col gap-5 h-full" aria-label="資産残高と3ヶ月トータル損益">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-ink-2 text-[13px] font-bold">
          <Wallet size={16} className="text-mint-deep" />
          現在の総資産
        </div>
        <span className="pill pill-gray num">{fmtDateTime(m.asOf)} 時点</span>
      </div>

      <div>
        <motion.p
          className="num text-[44px] sm:text-[56px] leading-none font-extrabold tracking-tight"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <span className="text-[26px] sm:text-[32px] align-top mr-1 text-ink-2">¥</span>
          {Math.round(m.equity).toLocaleString("ja-JP")}
        </motion.p>
        <p className="text-ink-3 text-[12px] mt-2">
          開始元手: <span className="num">¥{RISK.startCapital.toLocaleString("ja-JP")}</span> ・ 現金 <span className="num">{yen(m.cash)}</span> ・ 評価額{" "}
          <span className="num">{yen(m.equity - m.cash)}</span>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={`pill ${up ? "pill-mint" : "pill-coral"} !text-[14px] !px-3.5 !py-1.5`}>
          <TrendingUp size={15} className={up ? "" : "rotate-180"} />
          <span className="num">
            トータル収益 {yen(m.totalPnl, { sign: true })} ({pct(m.totalPnlPct)})
          </span>
        </span>
        <span className="pill pill-gray num">
          確定 {yen(m.realized, { sign: true })} / 含み {yen(m.unrealized, { sign: true })}
        </span>
      </div>

      <div className="mt-auto">
        <div className="flex items-center justify-between text-[12px] font-bold text-ink-2 mb-1.5">
          <span className="inline-flex items-center gap-1.5">
            <Hourglass size={14} className="text-amber" />
            運用経過: <span className="num">{m.dayIndex}日目 / {RISK.challengeDays}日</span>（3ヶ月チャレンジ中）
          </span>
          <span className="num text-ink-3">{progress.toFixed(0)}%</span>
        </div>
        <div className="h-2 rounded-full bg-surface-3 overflow-hidden" role="progressbar" aria-valuenow={m.dayIndex} aria-valuemin={0} aria-valuemax={RISK.challengeDays}>
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-mint to-mint-deep"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
      </div>
    </section>
  );
}
