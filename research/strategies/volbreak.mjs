// ボラティリティ・ブレイクアウト: 当日の始値から前日レンジのk倍動いたら順張りで乗る。
// Larry Williams の型。短期・高回転になりやすい。
import { window, atr } from "../lib/ind.mjs";

export default {
  name: "volbreak (レンジ幅ブレイク)",
  warmup: 200,
  params: {
    rangeBars: 24,  // 前24本のレンジ
    k: 0.6,         // レンジ × k を超えたら買い
    slAtr: 1.5,
    tpAtr: 2.5,
    atrPeriod: 24,
    maxHoldBars: 24,
  },
  entry({ closes, bars, i, params }) {
    const p = params;
    const w = window(bars, i, p.rangeBars + 1);
    if (w.length < p.rangeBars + 1) return { enter: false };
    const prev = w.slice(0, -1);
    const range = Math.max(...prev.map((b) => b.h)) - Math.min(...prev.map((b) => b.l));
    const cur = w.at(-1);
    const trigger = cur.o + range * p.k;
    const price = closes.at(-1);
    if (price <= trigger) return { enter: false };

    const a = atr(window(bars, i, p.atrPeriod + 1));
    if (!a || !price) return { enter: false };
    const atrPct = a / price;
    return {
      enter: true,
      score: (price - trigger) / a,
      reason: `レンジ幅の${p.k}倍を上抜け`,
      sizeFrac: 0.5,
      levels: { stopPct: atrPct * p.slAtr, tpPct: atrPct * p.tpAtr },
      maxHoldBars: p.maxHoldBars,
    };
  },
  exitSignal({ pos, params, i }) {
    if (i - pos.entryIndex >= params.maxHoldBars) return { type: "timeout" };
    return null;
  },
};
