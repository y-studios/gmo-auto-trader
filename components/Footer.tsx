export function Footer() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-5 text-[11px] text-ink-3 leading-relaxed">
        <p>
          <span className="font-bold text-ink-2">GMOコイン自動売買AI</span> — 完全非公開・自分専用の暗号資産自動運用ダッシュボード。対象: BTC/JPY・ETH/JPY・SOL/JPY（GMOコイン取引所・現物）。
          取引判断は RSI(14) / MACD(12,26,9) / ボリンジャーバンド(20,2σ) の1時間足と、-3%損切り・+5%利確・-20%ドローダウン停止の機械的ルールで行います。
        </p>
        <p className="mt-1.5">
          価格データは GMOコイン公式 Public API（無料）から取得。暗号資産の取引は元本割れのリスクがあります。本ダッシュボードは投資助言ではなく、運用者本人の資産管理用です。
          ホスティング: GitHub Pages ／ 鍵の保管: 端末内 LocalStorage と GitHub Secrets のみ。
        </p>
      </div>
    </footer>
  );
}
