"use client";
import { useSyncExternalStore } from "react";
import { FlaskConical, CircleHelp, CalendarCheck, Target } from "lucide-react";
import { yen, pct, fmtDateTime } from "@/lib/format";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const LAB_URL = `${BASE_PATH}/data/lab.json`;
const FORECAST_URL = `${BASE_PATH}/data/forecast.json`;

/** 採用判断に必要なトレード数（これ未満では「成績が良い案」を選ばない） */
const PRELIM_TRADES = 30;
const FINAL_TRADES = 60;

type Trade = { pnl: number; exitAt: number };
type Variant = { cash: number; positions: unknown[]; trades: Trade[]; curve: { t: number; equity: number }[] };
type Lab = { startedAt: string; startCapital: number; lastBarTime: number | null; variants: Record<string, Variant> };

type Band = { p10: number; median: number; p90: number };
type Forecast = {
  generatedAt: string;
  targetDate: string;
  horizonDays: number;
  startCapital: number;
  variants: Record<string, { equity: Band; trades: Band; winRate: Band | null; upProbability: number }>;
};

/** 確認日カレンダー（CHECKPOINTS.md と同じ内容。日付は売買頻度からの見込み） */
const CHECKPOINTS = [
  { date: "2026-09-26", title: "最初の売買が出たか", detail: "どれか1案でも件数が1以上になっていれば配管は正常" },
  { date: "2026-10-01", title: "1週間ちゃんと回っているか", detail: "A/B/Cが各3件前後、Dが10件前後。最終足が当日か" },
  { date: "2026-10-14", title: "★Dの反証テスト（30件）", detail: "Dが勝率60%前後でマイナスなら基盤は信用してよい。増えていたら全部やり直し" },
  { date: "2026-11-03", title: "Dの本判定（60件）", detail: "件数が倍になっても結論が変わらないか" },
  { date: "2026-11-27", title: "予備判定（A/B/Cが30件）", detail: "実測PFが予想PFから外れていないかを見る。まだ採用は決めない" },
  { date: "2027-01-29", title: "★本判定・採用決定", detail: "PF1.0超え・予想どおりの案から1つ選び、実弾へ進む" },
];

const META = [
  { id: "A", label: "breakout 本命", note: "本番と同一ロジック", expectPf: 1.17 },
  { id: "B", label: "breakout 指値", note: "メイカー手数料 -0.01%", expectPf: 1.29 },
  { id: "C", label: "breakout-wide", note: "損切り浅く・利確遠く", expectPf: 1.37 },
  { id: "D", label: "meanrev 高勝率型", note: "勝率60%だが負ける予想", expectPf: 0.8 },
  { id: "E", label: "hold ガチホ", note: "比較の基準", expectPf: null },
  { id: "F", label: "volbreak", note: "負ける予想", expectPf: 0.92 },
];

let lab: Lab | null = null;
let forecast: Forecast | null = null;
let snap: { lab: Lab | null; forecast: Forecast | null } = { lab: null, forecast: null };
let fetched = false;
const listeners = new Set<() => void>();
const publish = () => {
  snap = { lab, forecast };
  listeners.forEach((x) => x());
};
function subscribe(l: () => void) {
  listeners.add(l);
  if (!fetched) {
    fetched = true;
    const bust = `?t=${Math.floor(Date.now() / 60000)}`;
    fetch(`${LAB_URL}${bust}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && j.variants) { lab = j as Lab; publish(); } })
      .catch(() => {});
    fetch(`${FORECAST_URL}${bust}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && j.variants) { forecast = j as Forecast; publish(); } })
      .catch(() => {});
  }
  return () => void listeners.delete(l);
}
const getLab = () => snap;
const getServer = () => snap;

function statsOf(v: Variant, startCapital: number) {
  const trades = v.trades ?? [];
  const wins = trades.filter((t) => t.pnl > 0);
  const gp = wins.reduce((a, t) => a + t.pnl, 0);
  const gl = -trades.filter((t) => t.pnl <= 0).reduce((a, t) => a + t.pnl, 0);
  const equity = v.curve?.length ? v.curve[v.curve.length - 1].equity : startCapital;
  return {
    n: trades.length,
    winRate: trades.length ? wins.length / trades.length : 0,
    pf: gl > 0 ? gp / gl : gp > 0 ? Infinity : 0,
    equity,
    ret: equity / startCapital - 1,
    open: v.positions?.length ?? 0,
  };
}

export function LabCard() {
  const store = useSyncExternalStore(subscribe, getLab, getServer);
  const data = store.lab;
  const fc = store.forecast;

  if (!data) {
    return (
      <section className="card p-5 sm:p-6" aria-label="6案の同時ペーパー運用">
        <div className="flex items-center gap-2 text-ink-2 text-[13px] font-bold">
          <FlaskConical size={16} className="text-mint-deep" />
          戦略ラボ — 6案の同時ペーパー運用
        </div>
        <p className="mt-3 text-[12px] text-ink-3">ラボのデータを読み込み中、またはまだ記録がありません。</p>
      </section>
    );
  }

  const rows = META.map((m) => ({ ...m, s: statsOf(data.variants[m.id] ?? { trades: [], curve: [], positions: [], cash: 0 }, data.startCapital) }));
  const totalTrades = rows.reduce((a, r) => a + r.s.n, 0);
  const minTrades = Math.min(...rows.filter((r) => r.id !== "E").map((r) => r.s.n));
  const days = (Date.now() - new Date(data.startedAt).getTime()) / 86400_000;
  const progress = Math.min(1, minTrades / PRELIM_TRADES);

  return (
    <section className="card p-5 sm:p-6" aria-label="6案の同時ペーパー運用">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-ink-2 text-[13px] font-bold">
          <FlaskConical size={16} className="text-mint-deep" />
          戦略ラボ — 6案の同時ペーパー運用（架空資金 各{yen(data.startCapital)}）
        </div>
        <div className="text-[11px] text-ink-3">
          開始 {data.startedAt.slice(0, 10)}（{days.toFixed(1)}日） / 最終足 {data.lastBarTime ? fmtDateTime(new Date(data.lastBarTime).toISOString()) : "—"}
        </div>
      </div>

      {/* 採用判断までの進捗 */}
      <div className="mt-4 rounded-2xl border border-line bg-surface px-4 py-3">
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-bold text-ink">予備判定まで</span>
          <span className="text-ink-2">
            最少の案で <span className="font-bold text-ink">{minTrades}</span> / {PRELIM_TRADES} 件
            <span className="text-ink-3">（本判定は {FINAL_TRADES} 件）</span>
          </span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-line overflow-hidden">
          <div className="h-full rounded-full bg-mint transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="mt-2 text-[11px] text-ink-3 leading-relaxed">
          件数が足りないうちに「一番成績が良い案」を選ぶと、実力ではなく運の良い案を拾ってしまいます。
          週3〜4件しか売買しないため、予備判定まで約2ヶ月かかります。
        </p>
      </div>

      {/* 次の確認日 */}
      {(() => {
        const today = new Date().toISOString().slice(0, 10);
        const next = CHECKPOINTS.find((c) => c.date >= today);
        if (!next) return null;
        const left = Math.ceil((new Date(`${next.date}T00:00:00+09:00`).getTime() - Date.now()) / 86400_000);
        return (
          <div className="mt-3 flex items-start gap-2 rounded-2xl border border-mint/30 bg-mint-tint px-4 py-3">
            <CalendarCheck size={15} className="flex-none mt-0.5 text-mint-deep" />
            <div className="text-[12px] leading-relaxed">
              <span className="font-bold text-ink">次に確認する日: {next.date}</span>
              <span className="text-ink-3">（{left <= 0 ? "今日" : `あと${left}日`}）</span>
              <span className="block text-ink-2">{next.title} — {next.detail}</span>
              <span className="block text-[11px] text-ink-3 mt-1">
                それ以外の日は見なくてよい。週3〜4件しか売買しないので数字はほとんど動かない。
              </span>
            </div>
          </div>
        );
      })()}

      {/* 一覧 */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-[12px] min-w-[620px]">
          <thead>
            <tr className="text-ink-3 text-[11px] border-b border-line">
              <th className="text-left font-bold py-2 pr-2">案</th>
              <th className="text-right font-bold py-2 px-2">件数<span className="block text-ink-3/70 font-normal">予想</span></th>
              <th className="text-right font-bold py-2 px-2">勝率<span className="block text-ink-3/70 font-normal">予想</span></th>
              <th className="text-right font-bold py-2 px-2">PF<span className="block text-ink-3/70 font-normal">予想</span></th>
              <th className="text-right font-bold py-2 px-2">資産<span className="block text-ink-3/70 font-normal">予想(中央値)</span></th>
              <th className="text-right font-bold py-2 pl-2">損益率<span className="block text-ink-3/70 font-normal">予想の8割レンジ</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const up = r.s.ret > 0;
              const f = fc?.variants?.[r.id];
              const pfText = r.s.n === 0 ? "—" : r.s.pf === Infinity ? "∞" : r.s.pf.toFixed(2);
              return (
                <tr key={r.id} className="border-b border-line/60 last:border-0">
                  <td className="py-2.5 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="flex-none w-5 h-5 rounded-lg bg-mint-soft text-mint-deep text-[11px] font-bold grid place-items-center">{r.id}</span>
                      <span>
                        <span className="font-bold text-ink">{r.label}</span>
                        <span className="block text-[10px] text-ink-3">{r.note}</span>
                      </span>
                      {r.s.open > 0 && <span className="flex-none text-[10px] text-mint-deep font-bold">保有{r.s.open}</span>}
                    </div>
                  </td>
                  <td className="text-right px-2 tabular-nums text-ink-2">
                    {r.s.n}
                    <span className="block text-[10px] text-ink-3">{f ? f.trades.median : "—"}</span>
                  </td>
                  <td className="text-right px-2 tabular-nums text-ink-2">
                    {r.s.n ? `${(r.s.winRate * 100).toFixed(1)}%` : "—"}
                    <span className="block text-[10px] text-ink-3">{f?.winRate ? `${(f.winRate.median * 100).toFixed(0)}%` : "—"}</span>
                  </td>
                  <td className="text-right px-2 tabular-nums font-bold text-ink">
                    {pfText}
                    <span className="block text-[10px] text-ink-3 font-normal">{r.expectPf != null ? r.expectPf.toFixed(2) : "—"}</span>
                  </td>
                  <td className="text-right px-2 tabular-nums text-ink-2">
                    {yen(r.s.equity)}
                    <span className="block text-[10px] text-ink-3">{f ? yen(f.equity.median) : "—"}</span>
                  </td>
                  <td className={`text-right pl-2 tabular-nums font-bold ${up ? "text-mint-deep" : r.s.ret < 0 ? "text-coral-deep" : "text-ink-3"}`}>
                    {r.s.n || r.s.open ? pct(r.s.ret * 100) : "—"}
                    <span className="block text-[10px] text-ink-3 font-normal">
                      {f ? `${yen(f.equity.p10)}〜${yen(f.equity.p90)}` : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {fc && (
        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-[11px] text-ink-2">
          <Target size={14} className="flex-none mt-0.5 text-ink-3" />
          <p className="leading-relaxed">
            <span className="font-bold text-ink">灰色の数字は {fc.generatedAt.slice(0, 10)} 時点で事前登録した予想です（{fc.targetDate} 時点・{fc.horizonDays}日後）。</span>
            4年分のバックテストから {fc.horizonDays} 日のローリング窓をすべて取り、その分布の中央値と上下10%を使っています。
            後から動かせないよう `public/data/forecast.json` に固定してあります。
            結果が出たあとに「そう思っていた」と言えてしまうのを防ぐためです。
          </p>
        </div>
      )}

      <div className="mt-3 flex items-start gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-[11px] text-ink-2">
        <CircleHelp size={14} className="flex-none mt-0.5 text-ink-3" />
        <p className="leading-relaxed">
          <span className="font-bold text-ink">D と F は「負ける」予想で入れています。</span>
          予想どおり負ければ検証基盤が信用できるということ、逆に増えてしまったら基盤の方が間違っている、という判定に使います。
          E のガチホは全案の比較基準です。合計 {totalTrades} 件。
        </p>
      </div>
    </section>
  );
}
