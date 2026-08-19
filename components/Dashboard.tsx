"use client";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { Info } from "lucide-react";
import { Header } from "./Header";
import { AssetCard } from "./AssetCard";
import { StatsCard } from "./StatsCard";
import { EquityChart } from "./EquityChart";
import { PositionsCard } from "./PositionsCard";
import { SignalBoard } from "./SignalBoard";
import { RiskCard } from "./RiskCard";
import { TradeLog } from "./TradeLog";
import { EmergencyModal } from "./EmergencyModal";
import { ApiKeyModal } from "./ApiKeyModal";
import { Footer } from "./Footer";
import { buildModel, PRESET_DATASET, type Dataset } from "@/lib/engine";
import { botStore, settingsStore } from "@/lib/stores";
import { fmtDateTime } from "@/lib/format";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const STATE_URL = `${BASE_PATH}/data/state.json`;

/** ボットが書き出した state.json を1回だけ取得する外部ストア（無ければプリセット） */
let remote: Dataset | null = null;
let remoteFetched = false;
const remoteListeners = new Set<() => void>();
function subscribeRemote(l: () => void) {
  remoteListeners.add(l);
  if (!remoteFetched) {
    remoteFetched = true;
    fetch(`${STATE_URL}?t=${Math.floor(Date.now() / 60000)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && j.source === "bot" && Array.isArray(j.closedTrades)) {
          remote = j as Dataset;
          remoteListeners.forEach((x) => x());
        }
      })
      .catch(() => {});
  }
  return () => {
    remoteListeners.delete(l);
  };
}
const getRemote = () => remote;
const getRemoteServer = () => null;

const fade = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };

export function Dashboard() {
  const bot = botStore.useStore();
  const settings = settingsStore.useStore();
  const remoteDs = useSyncExternalStore(subscribeRemote, getRemote, getRemoteServer);
  const ds = remoteDs ?? PRESET_DATASET;
  const m = useMemo(() => buildModel(bot, ds), [bot, ds]);
  const hasKeys = Boolean(settings.apiKey && settings.apiSecret);

  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [apiOpen, setApiOpen] = useState(false);
  const closeEmergency = useCallback(() => setEmergencyOpen(false), []);
  const closeApi = useCallback(() => setApiOpen(false), []);

  return (
    <>
      <Header status={m.status} hasKeys={hasKeys} onEmergency={() => setEmergencyOpen(true)} onSettings={() => setApiOpen(true)} />

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-5 sm:py-7 flex-1">
        {m.source === "preset" && (
          <motion.div {...fade} transition={{ duration: 0.3 }} className="mb-4 flex items-start gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-[12px] text-ink-2">
            <Info size={15} className="flex-none mt-0.5 text-mint-deep" />
            <p className="leading-relaxed">
              <span className="font-bold text-ink">表示中のデータ: </span>
              10万円運用シミュレーション（プリセット）— 2026/07/27〜{fmtDateTime(m.asOf)} の GMOコイン実勢価格（1時間足）に基づく24回の決済と保有1件。
              APIキーを設定し GitHub Actions のボットを有効化すると、実口座の state.json に自動で切り替わります。
            </p>
          </motion.div>
        )}
        {m.source === "bot" && (
          <motion.div {...fade} transition={{ duration: 0.3 }} className="mb-4 flex items-start gap-2 rounded-2xl border border-mint/30 bg-mint-tint px-4 py-3 text-[12px] text-ink-2">
            <Info size={15} className="flex-none mt-0.5 text-mint-deep" />
            <p className="leading-relaxed">
              <span className="font-bold text-ink">ボット稼働データ（{m.mode === "live" ? "実弾" : "ペーパー"}）: </span>
              最終更新 {fmtDateTime(m.asOf)}。GitHub Actions が書き出した state.json を表示しています。
            </p>
          </motion.div>
        )}

        {/* Bento grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <motion.div {...fade} transition={{ duration: 0.3, delay: 0.02 }} className="lg:col-span-2">
            <AssetCard m={m} />
          </motion.div>
          <motion.div {...fade} transition={{ duration: 0.3, delay: 0.06 }}>
            <StatsCard m={m} />
          </motion.div>

          <motion.div {...fade} transition={{ duration: 0.3, delay: 0.1 }} className="lg:col-span-2">
            <EquityChart m={m} />
          </motion.div>
          <motion.div {...fade} transition={{ duration: 0.3, delay: 0.14 }}>
            <PositionsCard m={m} />
          </motion.div>

          <motion.div {...fade} transition={{ duration: 0.3, delay: 0.18 }} className="lg:col-span-2">
            <SignalBoard m={m} />
          </motion.div>
          <motion.div {...fade} transition={{ duration: 0.3, delay: 0.22 }}>
            <RiskCard m={m} hasKeys={hasKeys} />
          </motion.div>

          <motion.div {...fade} transition={{ duration: 0.3, delay: 0.26 }} className="lg:col-span-3">
            <TradeLog m={m} />
          </motion.div>
        </div>
      </main>

      <Footer />

      <EmergencyModal open={emergencyOpen} onClose={closeEmergency} m={m} hasKeys={hasKeys} />
      {apiOpen && <ApiKeyModal open={apiOpen} onClose={closeApi} settings={settings} />}
    </>
  );
}
