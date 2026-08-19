"use client";
import { ShieldCheck, ShieldAlert, KeyRound, Lock } from "lucide-react";
import { HALT_EQUITY, RISK } from "@/lib/strategy.mjs";
import { yen } from "@/lib/format";
import type { DashboardModel } from "@/lib/engine";

export function RiskCard({ m, hasKeys }: { m: DashboardModel; hasKeys: boolean }) {
  const distance = m.equity - HALT_EQUITY;
  const ratio = Math.min(1, Math.max(0, (m.equity - HALT_EQUITY) / (RISK.startCapital * 0.3)));
  const halted = m.status === "halted";
  const rules = [
    { k: "許容リスク/回", v: `資金の最大 ${RISK.riskPerTradePct * 100}〜${RISK.riskPerTradeMaxPct * 100}%（¥${(RISK.startCapital * RISK.riskPerTradePct).toLocaleString()}〜¥${(RISK.startCapital * RISK.riskPerTradeMaxPct).toLocaleString()}）` },
    { k: "自動損切り", v: `買値から -${RISK.stopLossPct * 100}% で成行強制決済` },
    { k: "利確", v: `+${RISK.takeProfitPct * 100}% 到達／含み益+${RISK.trailingActivatePct * 100}%からトレーリング（-${RISK.trailingGapPct * 100}%）` },
    { k: "同時保有", v: `最大 ${RISK.maxConcurrent} 銘柄・1銘柄 ${RISK.maxPositionPct * 100}% まで・現物のみ（レバなし）` },
    { k: "再エントリー", v: `同一銘柄は決済から ${RISK.cooldownHours} 時間のクールダウン` },
    { k: "ボラ連動", v: `24h値幅が7日平均の ${RISK.volLotReduceRatio} 倍以上でロット半減` },
  ];
  return (
    <section className="card p-5 sm:p-6 h-full flex flex-col" aria-label="リスク管理・安全装置">
      <div className="flex items-center gap-2 text-ink-2 text-[13px] font-bold">
        {halted ? <ShieldAlert size={16} className="text-coral" /> : <ShieldCheck size={16} className="text-mint-deep" />}
        リスク管理 ＆ 安全装置
      </div>

      <div className={`mt-3 rounded-2xl border p-4 ${halted ? "border-coral/40 bg-coral-soft" : "border-line bg-surface-2"}`}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-bold text-ink-2">ドローダウン緊急停止ライン</p>
          <span className={`pill ${halted ? "pill-coral" : "pill-mint"}`}>{halted ? "停止中" : "安全圏"}</span>
        </div>
        <p className="num text-[22px] font-extrabold leading-tight mt-1">
          ¥{HALT_EQUITY.toLocaleString("ja-JP")} <span className="text-[12px] text-ink-3 font-bold">（元手 -{RISK.drawdownHaltPct * 100}%）</span>
        </p>
        <div className="mt-2 h-2 rounded-full bg-surface-3 overflow-hidden">
          <div className={`h-full rounded-full ${ratio > 0.4 ? "bg-mint" : ratio > 0.15 ? "bg-amber" : "bg-coral"}`} style={{ width: `${ratio * 100}%` }} />
        </div>
        <p className="text-[11px] text-ink-3 num mt-1.5">
          現在の総資産 {yen(m.equity)} → 停止ラインまで余裕 <span className="font-bold text-ink">{yen(distance)}</span>。到達時は全ポジション成行決済＆新規停止
        </p>
      </div>

      <ul className="mt-3 space-y-1.5 text-[12px]">
        {rules.map((r) => (
          <li key={r.k} className="flex gap-2">
            <span className="flex-none w-[96px] text-ink-3 font-bold">{r.k}</span>
            <span className="text-ink-2 num">{r.v}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-xl bg-surface-2 border border-line px-3 py-2 flex items-start gap-2">
          <KeyRound size={14} className={`flex-none mt-0.5 ${hasKeys ? "text-mint-deep" : "text-ink-3"}`} />
          <div>
            <p className="font-bold">APIキー権限</p>
            <p className="text-ink-3">Read / Trade のみ・出金権限ゼロ{hasKeys ? "（設定済み）" : "（未設定）"}</p>
          </div>
        </div>
        <div className="rounded-xl bg-surface-2 border border-line px-3 py-2 flex items-start gap-2">
          <Lock size={14} className="flex-none mt-0.5 text-mint-deep" />
          <div>
            <p className="font-bold">鍵の保管</p>
            <p className="text-ink-3">この端末のLocalStorageとGitHub Secretsのみ。ページから外部送信しない</p>
          </div>
        </div>
      </div>
    </section>
  );
}
