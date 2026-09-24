// breakout の別リスクプロファイル: 損切りを浅く・利確を遠くする（薄く何度も負けて、たまに大きく勝つ）
import base from "./breakout.mjs";
export default {
  ...base,
  name: "breakout-wide (SL 2ATR / TP 10ATR)",
  params: { ...base.params, lookback: 168, slAtr: 2, tpAtr: 10, smaPeriod: 168, trailAtr: 4, maxHoldBars: 400 },
};
