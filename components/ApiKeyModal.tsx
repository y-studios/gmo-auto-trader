"use client";
import { useState } from "react";
import { Check, Copy, Eye, EyeOff, KeyRound, ShieldCheck, Trash2, RotateCcw } from "lucide-react";
import { Modal } from "./Modal";
import { botStore, settingsStore } from "@/lib/stores";
import { deobfuscate, obfuscate } from "@/lib/storage";
import type { ApiSettings } from "@/lib/types";

export const REPO = "y-studios/gmo-auto-trader";

export function ApiKeyModal({ open, onClose, settings }: { open: boolean; onClose: () => void; settings: ApiSettings }) {
  const [apiKey, setApiKey] = useState(() => deobfuscate(settings.apiKey));
  const [apiSecret, setApiSecret] = useState(() => deobfuscate(settings.apiSecret));
  const [live, setLive] = useState(settings.liveTrading);
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = () => {
    settingsStore.set({ apiKey: obfuscate(apiKey.trim()), apiSecret: obfuscate(apiSecret.trim()), savedAt: new Date().toISOString(), liveTrading: live });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };
  const clear = () => {
    settingsStore.reset();
    setApiKey("");
    setApiSecret("");
    setLive(false);
  };
  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* noop */
    }
  };
  const secretCmd = `gh secret set GMO_API_KEY --repo ${REPO} --body '${apiKey || "<API_KEY>"}'\ngh secret set GMO_API_SECRET --repo ${REPO} --body '${apiSecret || "<API_SECRET>"}'\ngh variable set BOT_ENABLED --repo ${REPO} --body true\ngh variable set LIVE_TRADING --repo ${REPO} --body ${live ? "true" : "false"}`;

  return (
    <Modal open={open} onClose={onClose} title="GMOコイン APIキー設定（Read / Trade）" icon={<KeyRound size={20} />} width="max-w-xl">
      <div className="space-y-4 text-[13px]">
        <div className="rounded-2xl bg-mint-tint border border-mint/30 p-3.5 text-[12px] leading-relaxed text-ink-2">
          <p className="font-bold text-ink flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-mint-deep" /> 安全運用の前提
          </p>
          <ul className="mt-1 space-y-0.5 list-disc pl-4">
            <li>GMOコイン会員ページ ＞ API で「<span className="font-bold">資産残高の参照・取引</span>」のみ許可し、<span className="font-bold text-coral">出金権限は付与しない</span></li>
            <li>鍵はこの端末のLocalStorage（難読化保存）と、ボット実行用のGitHub Secretsにだけ置く。ページから外部へ送信しない</li>
            <li>ブラウザからGMOの取引APIは直接叩けない（CORS）ため、実際の発注は <span className="num">scripts/bot.mjs</span>（GitHub Actions 15分おき／ローカル）が行う</li>
          </ul>
        </div>

        <label className="block">
          <span className="text-[12px] font-bold text-ink-2">API Key</span>
          <input className="input num mt-1" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="GMOコインの API Key" autoComplete="off" spellCheck={false} />
        </label>
        <label className="block">
          <span className="text-[12px] font-bold text-ink-2">API Secret</span>
          <div className="relative mt-1">
            <input className="input num pr-11" type={show ? "text" : "password"} value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} placeholder="GMOコインの API Secret" autoComplete="off" spellCheck={false} />
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost !p-1.5" onClick={() => setShow((v) => !v)} aria-label={show ? "隠す" : "表示"}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>

        <div className="rounded-2xl border border-line bg-surface-2 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-bold">発注モード</p>
              <p className="text-[11px] text-ink-3">ペーパー＝実際の価格で仮想売買のみ（発注しない）。実弾＝GMOコインに成行注文を出す</p>
            </div>
            <div className="flex rounded-full border border-line bg-surface p-0.5">
              <button type="button" className="tab" data-active={!live} onClick={() => setLive(false)}>
                ペーパー
              </button>
              <button type="button" className="tab" data-active={live} onClick={() => setLive(true)}>
                実弾 ¥100,000
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-between items-center">
          <div className="flex gap-2">
            <button type="button" className="btn text-coral" onClick={clear}>
              <Trash2 size={15} /> 削除
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (window.confirm("緊急停止・再開などの操作履歴をリセットして、プリセット表示に戻します。よろしいですか？")) botStore.reset();
              }}
              title="緊急停止などの操作履歴（LocalStorage）を消してプリセットに戻す"
            >
              <RotateCcw size={15} /> デモ状態をリセット
            </button>
          </div>
          <button type="button" className="btn btn-mint" onClick={save}>
            {saved ? <Check size={16} /> : <KeyRound size={16} />} {saved ? "保存しました" : "この端末に保存"}
          </button>
        </div>
        {settings.savedAt && <p className="text-[11px] text-ink-3 num">最終保存: {new Date(settings.savedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</p>}

        <div className="divider" />

        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="font-bold">ボット（GitHub Actions）への登録コマンド</p>
            <button type="button" className="btn !py-1 !px-2.5 text-[12px]" onClick={() => copy("cmd", secretCmd)}>
              {copied === "cmd" ? <Check size={14} /> : <Copy size={14} />} コピー
            </button>
          </div>
          <pre className="mt-1.5 rounded-xl bg-ink text-[11px] leading-relaxed text-white/90 p-3 overflow-x-auto scrollbar-thin num">{secretCmd}</pre>
          <p className="text-[11px] text-ink-3 mt-1.5 leading-relaxed">
            Secrets を登録して <span className="num">BOT_ENABLED=true</span> にすると、15分おきに <span className="num">bot.yml</span> が1時間足を取得→RSI/MACD/BBで判定→（実弾モードなら）GMOコインへ成行発注→結果を{" "}
            <span className="num">public/data/state.json</span> にコミットし、このダッシュボードが自動で最新状態に切り替わります。ローカルで動かす場合は{" "}
            <span className="num">GMO_API_KEY=… GMO_API_SECRET=… npm run bot</span>。
          </p>
        </div>
      </div>
    </Modal>
  );
}
