// クロスセクショナル・モメンタム: 銘柄間で相対的に強いものを持つ。
// 「どの銘柄か」を選ぶ戦略。個別の売買タイミングより銘柄選択に賭ける。
import { roc, window, atr } from "../lib/ind.mjs";

export default {
  name: "xmom (相対モメンタム上位)",
  warmup: 200,
  params: {
    lookback: 72,   // 3日騰落率で順位づけ
    minRoc: 0.02,   // 最低これだけ上げていること
    slAtr: 2.5,
    tpAtr: 5.0,
    atrPeriod: 24,
    maxHoldBars: 168,
  },
  entry({ closes, bars, i, params }) {
    const p = params;
    const m = roc(closes, p.lookback);
    if (m == null || m < p.minRoc) return { enter: false };
    const price = closes.at(-1);
    const a = atr(window(bars, i, p.atrPeriod + 1));
    if (!a || !price) return { enter: false };
    const atrPct = a / price;
    return {
      // スコア = モメンタムの強さ。エンジンがスコア順に空きスロットへ入れるので
      // これで「相対的に最も強い銘柄」が選ばれる
      enter: true,
      score: m,
      reason: `${p.lookback}時間で ${(m * 100).toFixed(1)}% 上昇（相対上位）`,
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
