// 本番で動く lib/strategy.mjs を「そのまま」バックテストに載せる。
// この結果が research/strategies/breakout-tuned.mjs と一致すれば、
// 本番コードと検証コードが同じ判断をしている証拠になる。
import { snapshot, evaluateEntry, evaluateExit, entryLevels, RISK } from "../../lib/strategy.mjs";
import { window } from "../lib/ind.mjs";

export default {
  name: "current (本番 lib/strategy.mjs)",
  warmup: 200,
  params: {},
  entry({ bars, i }) {
    const w = window(bars, i, 200);
    const s = snapshot(w);
    const d = evaluateEntry(s);
    if (d.action !== "buy") return { enter: false };
    const lv = entryLevels(s.price, s.atr);
    return {
      enter: true,
      score: d.score,
      reason: d.summary,
      sizeFrac: RISK.maxPositionPct,
      levels: {
        stopPct: (s.price - lv.stopPrice) / s.price,
        tpPct: (lv.tpPrice - s.price) / s.price,
        trailActivatePct: (s.atr * RISK.trailAtr) / s.price,
        trailGapPct: (s.atr * RISK.trailGapAtr) / s.price,
      },
    };
  },
  exitSignal({ pos, bars, i }) {
    // 値幅系（損切り/利確）はエンジンが高安で判定する。ここは時間切れだけ。
    if (i - pos.entryIndex >= RISK.maxHoldHours) return { type: "timeout" };
    return null;
  },
};
