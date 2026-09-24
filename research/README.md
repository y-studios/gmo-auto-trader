# research — 戦略の検証基盤

「勝てる仕組み」を数字で確かめるための場所。本番の `lib/strategy.mjs` を**そのまま**バックテストに載せるので、
検証と本番で判断がズレない（`research/strategies/current.mjs` がその橋渡し）。

## 使い方

```bash
export PATH=/Users/user/.nvm/versions/node/v25.8.0/bin:$PATH

node research/fetch-history.mjs                      # 1時間足を全取得（レジューム対応）
node research/compare.mjs --halt off                 # 全戦略を横並び比較
node research/compare.mjs --from 2025-01-01          # 未見データだけで検証
node research/compare.mjs --maker true               # 指値(メイカー)で執行した場合
node research/sweep.mjs --strategy breakout          # train/test を分けたパラメータ探索
node research/monthly.mjs --capital 5000 --minNotional 1000  # 月次の着地分布
```

## 守っているルール

- **先読み禁止**: バーの終値で判断し、約定は次バーの始値。損切りと利確に同一バーで両方触れたら損切り側に倒す
- **コストを必ず引く**: テイカー0.05%／メイカー-0.01%＋スリッページ。`--nocost true` で optimal と比較できる
- **ランダム対照群を必ず置く**: `strategies/random.mjs` に勝てない戦略はシグナルに情報が無い
- **ガチホを必ず基準にする**: `strategies/hold.mjs`。エンジンの検算も兼ねる（手計算と一致することを確認済み）
- **train/test を分ける**: `sweep.mjs` は 2025-01-01 より前で選び、それ以降で答え合わせする

## これまでに分かったこと

- 往復コスト0.16%は、1時間足のテクニカル戦略のグロス優位性より大きい。**成行にした瞬間にほとんどの戦略が死ぬ**
- RSI/MACD/BBスコア型・平均回帰型は、コスト後では**ランダムエントリーにも負ける**
- 勝率60%を達成しても、RRが小さければ資産は減る（meanrev: 勝率60.2%で-78.6%）
- 生き残ったのは**高値ブレイク＋トレンドフィルタ＋ATR基準の損切り/利確**のみ
