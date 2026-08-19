"use client";
import { useState } from "react";
import { AlertOctagon, PlayCircle, Siren } from "lucide-react";
import { Modal } from "./Modal";
import { CoinIcon, PAIR } from "./CoinIcon";
import { botStore } from "@/lib/stores";
import { sizeStr, yen, pct } from "@/lib/format";
import type { DashboardModel } from "@/lib/engine";

export function EmergencyModal({ open, onClose, m, hasKeys }: { open: boolean; onClose: () => void; m: DashboardModel; hasKeys: boolean }) {
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState<null | { closed: number; pnl: number }>(null);
  const halted = m.status === "halted";
  const ready = confirm.trim().toUpperCase() === "STOP";

  const close = () => {
    setConfirm("");
    setDone(null);
    onClose();
  };

  const execute = () => {
    const now = new Date().toISOString();
    const closedAt = new Date(Math.max(Date.now(), new Date(m.asOf).getTime() + 60_000)).toISOString();
    const emergencyClosed = m.openPositions.map((p) => ({ id: p.id, closedAt, price: p.lastPrice, pnl: Math.round(p.unrealized) }));
    const pnl = emergencyClosed.reduce((a, c) => a + c.pnl, 0);
    botStore.update((prev) => ({
      ...prev,
      status: "halted",
      haltedAt: closedAt,
      haltReason: "手動の緊急停止ボタン",
      emergencyClosed: [...prev.emergencyClosed, ...emergencyClosed],
      events: [
        {
          id: `H-${Date.now()}`,
          at: closedAt,
          symbol: null,
          kind: "halt",
          title: "緊急停止・全ポジション成行決済",
          reason: `ダッシュボードの緊急停止ボタンにより、未約定注文を全キャンセルし保有 ${emergencyClosed.length} ポジションを成行決済（${yen(pnl, { sign: true })}）。新規エントリーを停止。${hasKeys ? "GitHub Actions のボットは次回起動時に停止フラグを検知して発注しません" : "（APIキー未設定のためデモ内での反映）"}`,
        },
        ...prev.events,
      ],
      updatedAt: now,
    }));
    setDone({ closed: emergencyClosed.length, pnl });
  };

  const resume = () => {
    const now = new Date().toISOString();
    botStore.update((prev) => ({
      ...prev,
      status: "running",
      haltedAt: null,
      haltReason: null,
      events: [
        { id: `R-${Date.now()}`, at: now, symbol: null, kind: "resume", title: "自動売買を再開", reason: "ユーザー操作により停止フラグを解除。次の1時間足確定から通常ルールでエントリー判定を再開" },
        ...prev.events,
      ],
      updatedAt: now,
    }));
    close();
  };

  if (halted) {
    return (
      <Modal open={open} onClose={close} title="自動売買は緊急停止中です" icon={<Siren size={20} />} tone="danger">
        <div className="space-y-4 text-[13px]">
          <p className="text-ink-2 leading-relaxed">
            {m.haltedAt ? `${new Date(m.haltedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} に停止（理由: ${m.haltReason ?? "—"}）。` : ""}
            保有ポジションは成行決済済み、新規エントリーは行いません。再開すると次の1時間足確定から通常ルールで判定を再開します。
          </p>
          <div className="flex gap-2 justify-end">
            <button className="btn" onClick={close}>
              閉じる
            </button>
            <button className="btn btn-mint" onClick={resume}>
              <PlayCircle size={16} /> 自動売買を再開する
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={close} title="🚨 緊急停止＆全ポジション成行決済" icon={<AlertOctagon size={20} />} tone="danger">
      {done ? (
        <div className="space-y-4 text-[13px]">
          <div className="rounded-2xl bg-coral-soft border border-coral/30 p-4">
            <p className="font-bold text-coral">緊急停止を実行しました</p>
            <p className="text-ink-2 mt-1 num">
              決済ポジション {done.closed} 件・確定損益 {yen(done.pnl, { sign: true })}。自動売買は停止中です（ヘッダーの「停止中」から再開できます）。
            </p>
          </div>
          {!hasKeys && <p className="text-[12px] text-ink-3">※ APIキー未設定のため、デモデータ上での反映です。実口座に接続している場合は GMOコインの未約定注文キャンセル→保有数量の成行売却が実行されます。</p>}
          <div className="flex justify-end">
            <button className="btn" onClick={close}>
              閉じる
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 text-[13px]">
          <p className="text-ink-2 leading-relaxed">
            実行すると <span className="font-bold text-ink">①未約定注文を全キャンセル → ②保有ポジションを成行で全決済 → ③新規エントリーを停止</span> します。
            相場の急変時やAIの挙動に疑問があるときのための安全装置です。誤タップ防止のため、下に <span className="num font-bold">STOP</span> と入力してください。
          </p>

          <div className="rounded-2xl border border-line bg-surface-2 p-3">
            <p className="text-[11px] font-bold text-ink-3 mb-2">決済対象（現在値で成行）</p>
            {m.openPositions.length === 0 ? (
              <p className="text-ink-3">現在ノーポジションです。停止のみ行います。</p>
            ) : (
              <ul className="space-y-2">
                {m.openPositions.map((p) => (
                  <li key={p.id} className="flex items-center gap-2.5">
                    <CoinIcon symbol={p.symbol} size={28} />
                    <span className="font-bold">{PAIR[p.symbol]}</span>
                    <span className="num text-ink-2">{sizeStr(p.symbol, p.size)}</span>
                    <span className={`ml-auto num font-bold ${p.unrealized >= 0 ? "text-mint-deep" : "text-coral"}`}>
                      {yen(p.unrealized, { sign: true })} ({pct(p.unrealizedPct, { digits: 1 })})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <input className="input num" placeholder="STOP と入力" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" aria-label="確認入力" />

          <div className="flex gap-2 justify-end">
            <button className="btn" onClick={close}>
              キャンセル
            </button>
            <button className="btn btn-coral disabled:opacity-40 disabled:cursor-not-allowed" disabled={!ready} onClick={execute}>
              <AlertOctagon size={16} /> 緊急停止を実行
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
