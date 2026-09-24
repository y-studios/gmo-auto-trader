// 対照実験: エントリーだけランダム、利確/損切りは現行戦略と同じ。
// これに勝てない＝RSI/MACD/BBのシグナルには情報が無い、ということ。
import { RISK } from "../../lib/strategy.mjs";

export default {
  name: "random entry (同じ+5%/-3%)",
  warmup: 200,
  params: { enterProb: 0.02 },
  entry({ params, rng }) {
    const enter = rng() < (params.enterProb ?? 0.02);
    return {
      enter,
      score: rng(),
      reason: "ランダムエントリー（対照群）",
      sizeFrac: Math.min(RISK.riskPerTradeMaxPct / RISK.stopLossPct, RISK.maxPositionPct),
      levels: {
        stopPct: RISK.stopLossPct,
        tpPct: RISK.takeProfitPct,
        trailActivatePct: RISK.trailingActivatePct,
        trailGapPct: RISK.trailingGapPct,
      },
    };
  },
};
