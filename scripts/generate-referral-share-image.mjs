// Reproducible web social-card layout; original brand logo is embedded unchanged.
// Requires the Noto Sans CJK TC font when regenerating. Output is a committed static asset.
import {readFileSync} from 'node:fs';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
const logo=readFileSync(new URL('../public/pricing/brand/steam-butler-logo.png',import.meta.url)).toString('base64');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#F7F4EF"/><rect x="24" y="24" width="1152" height="582" rx="28" fill="white"/>
<rect x="72" y="196" width="64" height="5" rx="2" fill="#B48A42"/>
<image x="48" y="30" width="365" height="156" xlink:href="data:image/png;base64,${logo}"/>
<rect x="900" y="70" width="224" height="48" rx="24" fill="#EEF4EF"/>
<g font-family="Noto Sans CJK TC, sans-serif"><text x="1012" y="102" text-anchor="middle" font-size="23" fill="#123E32">店家需求・體驗申請</text>
<text x="72" y="255" font-size="36" font-weight="500" fill="#123E32">好用，值得分享。</text>
<text x="70" y="370" font-size="62" font-weight="700" fill="#123E32">朋友推薦，雙方各享</text>
<text x="70" y="475" font-size="90" font-weight="700" fill="#A77C2D">額外 30 天</text>
<text x="1124" y="469" text-anchor="end" font-size="24" fill="#123E32">主方案免費使用期</text>
<path d="M72 510H1128" stroke="#DED8CF" stroke-width="1"/>
<text x="72" y="550" font-size="23" fill="#4C6259">預約、收款、顧客管理，讓開店更輕鬆。</text>
<text x="72" y="582" font-size="18" fill="#596B61">推薦活動開放期間適用。首次付費開通滿 30 天且未退款，核對後發放。</text></g></svg>`;
await sharp(Buffer.from(svg)).png({compressionLevel:9}).toFile(fileURLToPath(new URL('../public/pricing/images/referral-share-v1.png',import.meta.url)));
