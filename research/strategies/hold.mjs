// エンジン検証用: 最初に買って一切売らない。
// 結果が「等分ガチホ」の数字とおおむね一致すれば、約定・評価・コストの配管は正しい。
export default {
  name: "hold (エンジン検証用・買ったら放置)",
  warmup: 200,
  params: {},
  entry() {
    return { enter: true, score: 1, reason: "初回エントリーのみ", sizeFrac: 0.5, levels: {} };
  },
};
