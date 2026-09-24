// 平均回帰: 短期に売られすぎたところを拾い、平均に戻ったら即降りる。
// 勝率が高く RR が小さくなる型。「勝率60%」の目標と相性が良い。
import { rsi, last, window, atr } from "../lib/ind.mjs";
import { mean, stdev } from "../lib/ind.mjs";

export default {
  name: "meanrev (短期売られすぎ拾い)",
  warmup: 120,
  params: {
    rsiPeriod: 2,      // Connors RSI(2) 系。短いほど反発を捉える
    rsiEntry: 10,      // これ以下で買い
    smaPeriod: 100,    // 長期トレンドフィルタ（上昇局面だけ買う）
    tpAtr: 1.0,        // 利確 = ATR × この倍率
    slAtr: 2.0,        // 損切り = ATR × この倍率
    atrPeriod: 24,
    maxHoldBars: 48,
  },
  entry({ closes, bars, i, params }) {
    const p = params;
    const r = last(rsi(closes, p.rsiPeriod));
    if (r == null || r > p.rsiEntry) return { enter: false };
    // 長期トレンドが上向きのときだけ拾う（落ちるナイフを避ける）
    const smaWin = closes.slice(-p.smaPeriod);
    if (smaWin.length < p.smaPeriod) return { enter: false };
    const smaVal = mean(smaWin);
    const price = closes.at(-1);
    if (price < smaVal) return { enter: false };

    const w = window(bars, i, p.atrPeriod + 1);
    const a = atr(w);
    if (!a || !price) return { enter: false };
    const atrPct = a / price;
    return {
      enter: true,
      score: p.rsiEntry - r,
      reason: `RSI(${p.rsiPeriod}) ${r.toFixed(1)} で売られすぎ・長期SMA上`,
      sizeFrac: 0.5,
      levels: {
        stopPct: atrPct * p.slAtr,
        tpPct: atrPct * p.tpAtr,
      },
      maxHoldBars: p.maxHoldBars,
    };
  },
  exitSignal({ pos, closes, params, i }) {
    // 一定時間で撤退（塩漬け防止）
    if (i - pos.entryIndex >= params.maxHoldBars) return { type: "timeout" };
    // RSIが十分戻ったら利確
    const r = last(rsi(closes, params.rsiPeriod));
    if (r != null && r >= 70) return { type: "signal_exit" };
    return null;
  },
};
