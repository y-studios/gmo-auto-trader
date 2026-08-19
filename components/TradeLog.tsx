"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Brain, ChevronDown, ListFilter } from "lucide-react";
import { CoinIcon, PAIR } from "./CoinIcon";
import { fmtDateTime, pct, sizeStr, yen } from "@/lib/format";
import type { DashboardModel, TimelineItem, TimelineTone } from "@/lib/engine";

type Filter = "all" | "win" | "loss" | "decision" | "system";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "win", label: "🟢 利確" },
  { key: "loss", label: "🔴 損切り・カット" },
  { key: "decision", label: "🧠 見送り・判断" },
  { key: "system", label: "⚙️ システム" },
];

const TONE: Record<TimelineTone, { dot: string; text: string; pill: string }> = {
  mint: { dot: "bg-mint", text: "text-mint-deep", pill: "pill-mint" },
  coral: { dot: "bg-coral", text: "text-coral", pill: "pill-coral" },
  gray: { dot: "bg-ink-3", text: "text-ink-2", pill: "pill-gray" },
  amber: { dot: "bg-amber", text: "text-amber-700", pill: "pill-amber" },
  blue: { dot: "bg-blue", text: "text-blue", pill: "pill-gray" },
};

const PAGE = 12;

function matches(item: TimelineItem, f: Filter) {
  switch (f) {
    case "all":
      return true;
    case "win":
      return item.type === "exit" && (item.amount ?? 0) > 0;
    case "loss":
      return item.type === "exit" && (item.amount ?? 0) < 0;
    case "decision":
      return item.type === "decision" || item.type === "entry";
    case "system":
      return item.type === "system";
  }
}

function Row({ item }: { item: TimelineItem }) {
  const [open, setOpen] = useState(false);
  const tone = TONE[item.tone];
  const icon = item.type === "exit" ? (item.amount != null && item.amount > 0 ? "🟢" : "🔴") : item.type === "entry" ? "🔵" : item.type === "system" ? "⚙️" : "🧠";
  return (
    <li className="py-3.5">
      <div className="flex items-start gap-3">
        {item.symbol ? <CoinIcon symbol={item.symbol} size={34} className="mt-0.5" /> : <span className="coin-dot bg-surface-3 text-ink-2 mt-0.5" style={{ width: 34, height: 34 }}>ALL</span>}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
            <span className="num text-[11px] text-ink-3">[{fmtDateTime(item.at)}]</span>
            <span className="text-[13px] font-bold">
              {icon} 【{item.title}】{item.symbol ? ` ${PAIR[item.symbol]}` : ""}
            </span>
            {item.amount != null && (
              <span className={`num text-[13px] font-extrabold ${tone.text}`}>
                {yen(item.amount, { sign: true })} ({pct(item.pct ?? 0, { digits: 1 })})
              </span>
            )}
            {item.type === "entry" && item.size != null && item.price != null && (
              <span className="num text-[12px] text-ink-2">
                {sizeStr(item.symbol!, item.size)} @ {yen(item.price)}
              </span>
            )}
          </div>
          <p className="mt-1 text-[12.5px] text-ink-2 leading-relaxed">
            <span className="font-bold text-ink">AIの判断理由:</span> 「{item.reason}」
          </p>
          {item.type === "exit" && (
            <div className="mt-1">
              <button className="inline-flex items-center gap-1 text-[11px] font-bold text-ink-3 hover:text-ink" onClick={() => setOpen((v) => !v)}>
                <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
                エントリー時の理由と約定詳細
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                    <div className="mt-1.5 rounded-xl bg-surface-2 border border-line p-3 text-[12px] text-ink-2 space-y-1">
                      <p>
                        <span className="font-bold text-ink">エントリー理由:</span> {item.subReason}
                      </p>
                      {item.size != null && item.price != null && (
                        <p className="num text-ink-3">
                          数量 {sizeStr(item.symbol!, item.size)} ・ 決済価格 {yen(item.price)}
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export function TradeLog({ m }: { m: DashboardModel }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(PAGE);
  const items = useMemo(() => m.timeline.filter((t) => matches(t, filter)), [m.timeline, filter]);
  const shown = items.slice(0, limit);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, win: 0, loss: 0, decision: 0, system: 0 };
    for (const f of FILTERS) c[f.key] = m.timeline.filter((t) => matches(t, f.key)).length;
    return c;
  }, [m.timeline]);

  return (
    <section className="card p-5 sm:p-6" aria-label="AIトレード履歴と売買判断ログ">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-ink-2 text-[13px] font-bold">
            <Brain size={16} className="text-mint-deep" />
            AIトレード履歴 ＆ 売買判断ログ
          </div>
          <p className="text-[11px] text-ink-3 mt-1">「なぜ買ったのか／なぜ売ったのか」を全件可視化。決済 {m.closedTrades.length} 件＋判断ログ。</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <ListFilter size={14} className="text-ink-3" />
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className="tab"
              data-active={filter === f.key}
              onClick={() => {
                setFilter(f.key);
                setLimit(PAGE);
              }}
            >
              {f.label} <span className="num opacity-70">{counts[f.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-2 divide-y divide-line">
        {shown.map((item) => (
          <Row key={item.id} item={item} />
        ))}
        {shown.length === 0 && <li className="py-8 text-center text-[13px] text-ink-3">該当するログはありません</li>}
      </ul>

      {items.length > limit && (
        <div className="pt-2 text-center">
          <button className="btn" onClick={() => setLimit((l) => l + PAGE)}>
            もっと見る（残り {items.length - limit} 件）
          </button>
        </div>
      )}
    </section>
  );
}
