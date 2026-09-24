// 「基本ガチホ、トレンドが崩れたら降りる」型。
// 4年の検証で最も強かったのはガチホ(+157%)だった。ならば勝負どころは
// 「いかに売買を当てるか」ではなく「暴落局面をどれだけ避けられるか」になる。
// 売買回数が極端に少ないので、手数料の影響もほぼ受けない。
import { mean } from "../lib/ind.mjs";

export default {
  name: "trendfollow (SMA上で保有・下で撤退)",
  warmup: 400,
  params: {
    smaPeriod: 200,   // 1時間足200本 ≒ 8日
    buffer: 0.0,      // SMAからこの割合だけ上回ったら買う（ダマシ除け）
    exitSmaPeriod: null, // 降りる判定に別のSMAを使う（nullなら同じ）
  },
  entry({ closes, params }) {
    const w = closes.slice(-params.smaPeriod);
    if (w.length < params.smaPeriod) return { enter: false };
    const m = mean(w);
    const price = closes.at(-1);
    if (price <= m * (1 + params.buffer)) return { enter: false };
    return {
      enter: true,
      score: (price - m) / m, // SMAからの乖離が大きい＝強い銘柄を優先
      reason: `SMA${params.smaPeriod} を上回りトレンド継続`,
      sizeFrac: 0.5,
      levels: {}, // 固定の利確・損切りは置かない
    };
  },
  exitSignal({ closes, params }) {
    const period = params.exitSmaPeriod ?? params.smaPeriod;
    const w = closes.slice(-period);
    if (w.length < period) return null;
    const price = closes.at(-1);
    if (price < mean(w) * (1 - params.buffer)) return { type: "signal_exit" };
    return null;
  },
};
