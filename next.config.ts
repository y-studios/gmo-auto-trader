import type { NextConfig } from "next";

/**
 * GitHub Pages 向け静的エクスポート設定。
 *
 * basePath は環境変数 NEXT_PUBLIC_BASE_PATH から受け取る。
 * - カスタムサブドメイン運用（public/CNAME）: ""（ルート配信）
 * - y-studios.github.io/gmo-auto-trader/ での暫定配信: "/gmo-auto-trader"
 * GitHub Actions 側では actions/configure-pages が返す base_path をそのまま渡しているので、
 * Pages 設定でカスタムドメインを有効にした瞬間に自動でルート配信へ切り替わる。
 */
const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const basePath = rawBasePath === "/" ? "" : rawBasePath.replace(/\/$/, "");

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
