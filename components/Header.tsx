"use client";
import { AlertOctagon, Settings2, Bot } from "lucide-react";
import type { BotStatus } from "@/lib/types";

export function Header({
  status,
  hasKeys,
  onEmergency,
  onSettings,
}: {
  status: BotStatus;
  hasKeys: boolean;
  onEmergency: () => void;
  onSettings: () => void;
}) {
  const running = status === "running";
  return (
    <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur border-b border-line">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex items-center gap-3 h-16">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex-none inline-flex items-center justify-center w-9 h-9 rounded-xl bg-mint text-white shadow-[0_6px_16px_-8px_rgba(0,208,156,0.8)]">
              <Bot size={20} strokeWidth={2.4} />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="font-bold text-[15px] truncate"><span className="hidden sm:inline">GMOコイン自動売買AI</span><span className="sm:hidden">GMO自動売買</span></p>
              <p className="num text-[10px] text-ink-3 tracking-wide hidden sm:block whitespace-nowrap">GMO COIN AUTO TRADER AI · PRIVATE</p>
            </div>
          </div>

          <div className="hidden md:flex items-center ml-3">
            {running ? (
              <span className="pill pill-mint">
                <span className="live-dot inline-block w-2 h-2 rounded-full bg-mint" />
                AI自動売買: 稼働中（24h常時監視）
              </span>
            ) : (
              <span className="pill pill-coral">
                <span className="halt-dot inline-block w-2 h-2 rounded-full bg-coral" />
                AI自動売買: 緊急停止中
              </span>
            )}
            {!hasKeys && (
              <span className="pill pill-gray ml-2" title="GMOコインのAPIキーが未設定のため、表示はシミュレーション（プリセット）データです">
                APIキー未設定・デモ運用
              </span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button className="btn" onClick={onSettings} aria-label="GMOコイン APIキー設定">
              <Settings2 size={16} />
              <span className="hidden sm:inline">GMOコイン APIキー設定</span>
              <span className="sm:hidden">API</span>
            </button>
            <button className={`btn ${running ? "btn-coral" : ""}`} onClick={onEmergency} aria-label="緊急停止">
              <AlertOctagon size={16} />
              <span className="hidden lg:inline">{running ? "緊急停止＆全ポジション成行決済" : "停止中・再開する"}</span>
              <span className="lg:hidden">{running ? "緊急停止" : "停止中"}</span>
            </button>
          </div>
        </div>
        <div className="md:hidden pb-2.5 -mt-1 flex items-center gap-2 overflow-x-auto scrollbar-thin">
          {running ? (
            <span className="pill pill-mint">
              <span className="live-dot inline-block w-2 h-2 rounded-full bg-mint" />
              AI自動売買: 稼働中（24h常時監視）
            </span>
          ) : (
            <span className="pill pill-coral">
              <span className="halt-dot inline-block w-2 h-2 rounded-full bg-coral" />
              AI自動売買: 緊急停止中
            </span>
          )}
          {!hasKeys && <span className="pill pill-gray">デモ運用</span>}
        </div>
      </div>
    </header>
  );
}
