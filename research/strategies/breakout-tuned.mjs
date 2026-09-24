// breakout のパラメータ調整版。
// train(〜2024-12)でPF上位、かつ test(2025-01〜、未見)でも崩れなかった設定。
// 週足相当の高値(168本=7日)を上抜けたら乗り、ATR×3で損切り、ATR×4で利確。
import base from "./breakout.mjs";

export default {
  ...base,
  name: "breakout-tuned (168本高値抜け/SL 3ATR/TP 4ATR)",
  params: { ...base.params, lookback: 168, slAtr: 3, tpAtr: 4, smaPeriod: 168, trailAtr: 3, maxHoldBars: 240 },
};
