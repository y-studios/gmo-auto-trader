// トレンドフォロー: 直近n本の高値を上抜けたら乗る。
// 勝率は低いが RR が大きい型。暗号資産で歴史的に機能してきた。
import { window, donchian, atr } from "../lib/ind.mjs";
import { mean } from "../lib/ind.mjs";

export default {
  name: "breakout (ドンチャン上抜け)",
  warmup: 200,
  params: {
    lookback: 48,     // 直近48本(2日)の高値を抜けたら買い
    slAtr: 2.0,
    tpAtr: 6.0,
    trailAtr: 3.0,
    atrPeriod: 24,
    smaPeriod: 168,   // 週足相当のトレンドフィルタ
    maxHoldBars: 240,
  },
  entry({ closes, bars, i, params }) {
    const p = params;
    const w = window(bars, i, p.lookback + 1);
    if (w.length < p.lookback + 1) return { enter: false };
    const dc = donchian(w);
    const price = closes.at(-1);
    if (!dc || price <= dc.high) return { enter: false };

    const smaWin = closes.slice(-p.smaPeriod);
    if (smaWin.length < p.smaPeriod || price < mean(smaWin)) return { enter: false };

    const a = atr(window(bars, i, p.atrPeriod + 1));
    if (!a) return { enter: false };
    const atrPct = a / price;
    return {
      enter: true,
      score: (price - dc.high) / a,
      reason: `直近${p.lookback}本の高値 ${Math.round(dc.high)} を上抜け`,
      sizeFrac: 0.5,
      levels: {
        stopPct: atrPct * p.slAtr,
        tpPct: atrPct * p.tpAtr,
        trailActivatePct: atrPct * p.trailAtr,
        trailGapPct: atrPct * p.trailAtr * 0.6,
      },
      maxHoldBars: p.maxHoldBars,
    };
  },
  exitSignal({ pos, params, i }) {
    if (i - pos.entryIndex >= params.maxHoldBars) return { type: "timeout" };
    return null;
  },
};
