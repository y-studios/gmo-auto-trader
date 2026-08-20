# GMOコイン自動売買AI（GMO Coin Auto Trader AI）

完全非公開・自分専用。GMOコインの公式API（手数料無料の現物・Public APIは鍵不要）を使い、元手10万円を
**RSI(14) / MACD(12,26,9) / ボリンジャーバンド(20,2σ) の1時間足 × 機械的リスク管理（-3%損切り・+5%利確・-20%で緊急停止）**
で3ヶ月間24時間自動運用し、資産推移・勝率・保有ポジション・AIの売買判断理由をスマホ/PCから監視するプライベートダッシュボード。

- 公開URL: https://gmo-auto-trader.pages.dev/（**Cloudflare Access で保護**。`20000227takumi@gmail.com` 以外はメールのワンタイムPINログインを求められ、通過できない）
- デザイン: Coincheck 風クリーンホワイト（#FFFFFF / #F7F9FA）× ミントグリーン（#00D09C 利益・買い）× コーラルレッド（#FF5A5F 損失・売り）

## アクセス制限（重要）

自動売買の資産・戦略が見える性質上、**Cloudflare Access で本人のメールアドレス1件のみ許可**している。
- Zero Trust Team: `shrill-hat-a1f5.cloudflareaccess.com`
- Access アプリ: `GMOコイン自動売買AI`（対象ドメイン `gmo-auto-trader.pages.dev`）、ポリシー「本人のみ許可」（email = `20000227takumi@gmail.com`）、認証はCloudflare組み込みのワンタイムPIN（メール）
- 旧 GitHub Pages（`y-studios.github.io/gmo-auto-trader/`）は誰でも閲覧できてしまうため 2026-08-20 に無効化済み（`gh api -X DELETE repos/y-studios/gmo-auto-trader/pages`）。以後は Cloudflare Pages のみが本番
- 50ユーザーまで無料（Cloudflare Access Free）。許可メールを増減する場合は Access アプリのポリシーを編集する

## 構成

```
app/                 Next.js 16 App Router（output: "export" の静的サイト。Cloudflare Pages で配信）
components/          ダッシュボード UI（Bento Grid: 資産 / 戦績 / 資産推移 / ポジション / AI判定 / 安全装置 / 取引ログ）
lib/indicators.mjs   RSI・EMA・MACD・ボリンジャーバンド（純関数）
lib/strategy.mjs     売買判定・ポジションサイズ・緊急停止ライン（ブラウザとボットで共用）
lib/gmo.mjs          GMOコイン Public / Private API クライアント（HMAC-SHA256 署名、fetch + WebCrypto）
lib/preset-data.ts   10万円運用シミュレーションの初期プリセット（自動生成・後述）
scripts/bot.mjs      ボットランナー（GitHub Actions cron / ローカル）。state.json を更新
scripts/gen-icons.mjs ファビコン / OGP 生成
.github/workflows/deploy.yml  main へ push → Cloudflare Pages デプロイ（wrangler-action）
.github/workflows/bot.yml     15分おきにボット実行（vars.BOT_ENABLED=true のときだけ）
```

### データの流れ

1. ダッシュボードは起動時に `public/data/state.json` を fetch し、`source: "bot"` なら実口座/ペーパー運用の状態を表示、
   無ければ `lib/preset-data.ts` のプリセットを表示する（ヘッダーに「デモ運用」バッジ）。
2. `scripts/bot.mjs` は 1時間足（直近170本）を Public API から取得 → 指標計算 → 既存ポジションの決済判定 →
   緊急停止ライン判定 → 新規エントリー判定（同じ足で二重判定しない）→ `state.json` を書き出す。
3. GitHub Actions の `bot.yml` がそれを main にコミットし、`deploy.yml` を叩いて Cloudflare Pages を更新する。

### 売買ルール（`lib/strategy.mjs` の RISK 定数がそのまま UI に表示される）

| 項目 | 値 |
|---|---|
| 対象 | BTC/JPY, ETH/JPY, SOL/JPY（現物・買いのみ） |
| エントリー | RSI 売られすぎ反転(+2) / MACD ゴールデンクロス(+2) / BB -2σ付近(+2) などのスコアが 3 以上。BBスクイーズ中は待機 |
| 損切り | 買値 -3% で成行（`stop_loss`）。-2σ割れ＋MACD悪化で -1.5% 以下なら早期カット |
| 利確 | +5% 到達、含み益 +2% からトレーリング（最高値 -1.2%）、RSI 75 超の過熱で決済 |
| 許容リスク | 1トレード最大 3%（損切り幅3%に対して建玉を制限）、1銘柄 60% まで、同時 2 銘柄、現物なのでレバなし |
| 再エントリー | 同一銘柄は決済から 4 時間のクールダウン |
| ボラ連動 | 24h 値幅が 7 日平均の 1.8 倍以上でロット半減 |
| 緊急停止 | 総資産が ¥80,000（-20%）に到達 → 全ポジション成行決済＆新規停止。ダッシュボードの 🚨 ボタン／`--emergency` でも手動停止 |

## 安全設計

- API キーは **資産参照・取引のみ**（出金権限なし）で作成する。
- ブラウザからは GMO の Private API を呼ばない（CORS ヘッダが無い上、鍵がページに露出するため）。
  ダッシュボードの「APIキー設定」は端末の LocalStorage（難読化）に保存し、GitHub Secrets 登録コマンドを表示するだけ。
- 実弾モードは `vars.LIVE_TRADING=true` のときだけ。既定はペーパー（実際の価格で仮想売買、発注なし）。

## ボットの有効化

```bash
gh secret set GMO_API_KEY --repo y-studios/gmo-auto-trader --body '<API_KEY>'
gh secret set GMO_API_SECRET --repo y-studios/gmo-auto-trader --body '<API_SECRET>'
gh variable set BOT_ENABLED --repo y-studios/gmo-auto-trader --body true
gh variable set LIVE_TRADING --repo y-studios/gmo-auto-trader --body false   # まずはペーパーで
gh workflow run bot.yml --repo y-studios/gmo-auto-trader -f mode=check       # 疎通確認
```

ローカル実行: `GMO_API_KEY=… GMO_API_SECRET=… npm run bot`（`npm run bot:check` / `npm run bot:emergency`）。

## 開発

```bash
npm ci
npm run dev                      # http://localhost:3000
npm run build                    # out/ に静的出力
npx wrangler pages deploy out --project-name=gmo-auto-trader --commit-dirty=true   # 手動デプロイ（要 CLOUDFLARE_API_TOKEN）
npm run icons                    # app/favicon.ico, app/icon.png, public/og.png を再生成
```

### プリセットデータについて

`lib/preset-data.ts` は GMOコイン Public API の **実際の1時間足（2026-07-26〜08-19）** を使って生成したシミュレーションで、
24 回の決済と保有 1 件のすべての約定価格が、その時刻の 1 時間足の高値〜安値の範囲内に収まるように検証済み
（同時保有 2 銘柄以内・現金の範囲内・4h クールダウン）。集計値は勝率 62.5%（15勝9敗）/ PF 1.84 / 総資産 ¥108,450 /
決済ベース最大 DD -4.2%。実口座の state.json が存在するときは表示されない。

## カスタムドメインを付ける場合

Cloudflare Pages のプロジェクト設定 → Custom domains でドメインを追加すると、Access のポリシーも
そのカスタムドメインに向けて追加登録すれば同様に保護できる（`gmo-auto-trader.pages.dev` 単体の設定は残しておいてよい）。
