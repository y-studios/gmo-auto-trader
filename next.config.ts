import type { NextConfig } from "next";

/**
 * Cloudflare Pages 向け静的エクスポート設定（gmo-auto-trader.pages.dev、Cloudflare Access で保護）。
 * ルート配信のため basePath は常に空。カスタムドメインを付ける場合も同じくルート配信でよい。
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
