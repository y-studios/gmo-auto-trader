import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_JP } from "next/font/google";
import "./globals.css";

const display = Inter({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const body = Noto_Sans_JP({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  display: "swap",
  preload: false,
});

const SITE_NAME = "GMOコイン自動売買AI";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://gmotrader.shindan.biz").replace(/\/$/, "");
const DESCRIPTION =
  "完全非公開・自分専用。GMOコインの公式APIを連携し、元手10万円をRSI / MACD / ボリンジャーバンド × 3%損切り・5%利確で3ヶ月間24時間自動運用。資産推移・勝率・保有ポジション・AIの売買判断理由をリアルタイム監視するプライベートダッシュボード。";

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME}｜10万円実弾・自分専用自動運用ダッシュボード`,
    template: `%s｜${SITE_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: `${SITE_URL}${BASE_PATH}/` },
  robots: { index: false, follow: false },
  keywords: ["GMOコイン", "自動売買", "暗号資産", "BTC", "ETH", "SOL", "RSI", "MACD", "ボリンジャーバンド"],
  openGraph: {
    title: `${SITE_NAME}（GMO Coin Auto Trader AI）`,
    description: DESCRIPTION,
    type: "website",
    locale: "ja_JP",
    siteName: SITE_NAME,
    url: `${SITE_URL}${BASE_PATH}/`,
    images: [{ url: `${BASE_PATH}/og.png`, width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    images: [`${BASE_PATH}/og.png`],
    title: `${SITE_NAME}（GMO Coin Auto Trader AI）`,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#00d09c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
