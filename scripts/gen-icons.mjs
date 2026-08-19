// GMOコイン自動売買AI のファビコン・OGP生成。
// モチーフ: Coincheck風ミントグリーン ＋ コイン型ロボット（アンテナ＋目）＋ 右肩上がりのトレンドライン
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "fs";

mkdirSync("app", { recursive: true });
mkdirSync("public", { recursive: true });

const MINT = "#00d09c";
const MINT_DEEP = "#00b386";
const MINT_DARK = "#00906b";
const INK = "#1f2933";
const CORAL = "#ff5a5f";

// 512px アイコン
const svg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1ee0ad"/>
      <stop offset="0.6" stop-color="${MINT}"/>
      <stop offset="1" stop-color="${MINT_DEEP}"/>
    </linearGradient>
    <linearGradient id="coin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#eefcf7"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <!-- antenna -->
  <line x1="256" y1="92" x2="256" y2="128" stroke="#ffffff" stroke-width="22" stroke-linecap="round"/>
  <circle cx="256" cy="82" r="22" fill="#ffffff"/>
  <!-- coin body -->
  <circle cx="256" cy="292" r="168" fill="url(#coin)"/>
  <circle cx="256" cy="292" r="140" fill="none" stroke="${MINT_DEEP}" stroke-opacity="0.18" stroke-width="10"/>
  <!-- eyes -->
  <rect x="186" y="214" width="40" height="58" rx="20" fill="${MINT_DEEP}"/>
  <rect x="286" y="214" width="40" height="58" rx="20" fill="${MINT_DEEP}"/>
  <!-- trend line mouth -->
  <polyline points="168,392 222,352 260,372 334,318" fill="none" stroke="${MINT_DARK}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
  <polyline points="298,318 336,316 338,356" fill="none" stroke="${MINT_DARK}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function areaPath(points, w, h, x0, y0) {
  const n = points.length;
  const step = w / (n - 1);
  const max = Math.max(...points), min = Math.min(...points);
  const y = (v) => y0 + h - ((v - min) / (max - min || 1)) * h;
  let d = `M${x0} ${y(points[0])}`;
  for (let i = 1; i < n; i++) d += ` L${x0 + i * step} ${y(points[i])}`;
  const line = d;
  const area = `${d} L${x0 + w} ${y0 + h} L${x0} ${y0 + h} Z`;
  return { line, area };
}

const eq = [100000, 100061, 100380, 101100, 98753, 98306, 98190, 98280, 99189, 99530, 100556, 101460, 103715, 104060, 103704, 102653, 103661, 103281, 103299, 104449, 104449, 106474, 107561, 108450];
const { line, area } = areaPath(eq, 400, 150, 720, 300);

const ogSvg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${MINT}"/>
      <stop offset="1" stop-color="${MINT_DEEP}"/>
    </linearGradient>
    <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${MINT}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${MINT}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#f7f9fa"/>
  <rect width="1200" height="14" fill="url(#bar)"/>
  <rect x="680" y="250" width="480" height="260" rx="28" fill="#ffffff" stroke="#e5e9ee"/>
  <path d="${area}" fill="url(#fill)"/>
  <path d="${line}" fill="none" stroke="${MINT}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="720" y1="${300 + 150 - ((100000 - 98190) / (108450 - 98190)) * 150}" x2="1120" y2="${300 + 150 - ((100000 - 98190) / (108450 - 98190)) * 150}" stroke="#8a96a3" stroke-width="2" stroke-dasharray="6 6"/>
  <g font-family="Hiragino Kaku Gothic ProN, Hiragino Sans, Noto Sans JP, sans-serif">
    <text x="80" y="140" font-size="28" font-weight="700" fill="${MINT_DEEP}" letter-spacing="4">GMO COIN AUTO TRADER AI</text>
    <text x="80" y="230" font-size="70" font-weight="900" fill="${INK}" letter-spacing="-1">GMOコイン自動売買AI</text>
    <text x="80" y="300" font-size="32" font-weight="700" fill="${INK}">元手10万円・自分専用・24時間自動運用</text>
    <text x="80" y="364" font-size="24" fill="#52606d">RSI / MACD / ボリンジャーバンド × 3%損切り・5%利確</text>
    <text x="80" y="404" font-size="24" fill="#52606d">BTC / ETH / SOL（GMOコイン現物）・ドローダウン-20%で緊急停止</text>
    <text x="720" y="290" font-size="20" font-weight="700" fill="#52606d">総資産</text>
    <text x="1120" y="292" font-size="32" font-weight="800" fill="${INK}" text-anchor="end">¥108,450</text>
    <rect x="80" y="470" width="250" height="56" rx="28" fill="#e6faf5"/>
    <text x="205" y="507" font-size="26" font-weight="800" fill="${MINT_DEEP}" text-anchor="middle">+¥8,450 (+8.45%)</text>
    <rect x="350" y="470" width="250" height="56" rx="28" fill="#ffeced"/>
    <text x="475" y="507" font-size="26" font-weight="800" fill="${CORAL}" text-anchor="middle">損切り -3% 自動</text>
  </g>
</svg>`;

async function main() {
  writeFileSync("app/icon.svg", svg);
  const base = () => sharp(Buffer.from(svg));
  await base().resize(32, 32).png().toFile("app/favicon.ico");
  await base().resize(512, 512).png().toFile("app/icon.png");
  await base().resize(180, 180).png().toFile("app/apple-icon.png");
  await base().resize(512, 512).png().toFile("public/icon-512.png");
  const mark = await base().resize(150, 150).png().toBuffer();
  await sharp(Buffer.from(ogSvg))
    .composite([{ input: mark, left: 990, top: 60 }])
    .png()
    .toFile("public/og.png");
  console.log("icons generated");
}

main();
