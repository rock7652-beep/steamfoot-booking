// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import sharp from 'sharp';
const html=readFileSync('public/pricing/apply.html','utf8');
const doc=new DOMParser().parseFromString(html,'text/html');
function meta(name:string){return doc.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.getAttribute('content');}
describe('application social sharing metadata',()=>{
 it('provides brand identity and qualified referral copy without JavaScript or a referral ID',()=>{
  expect(meta('og:site_name')).toBe('蒸管家');expect(meta('og:title')).toBe('蒸管家｜朋友推薦與體驗申請');
  expect(meta('og:description')).toContain('推薦活動開放期間');expect(meta('og:description')).toContain('首次付費開通滿 30 天且未退款');expect(meta('og:description')).toContain('核對後');
  expect(meta('og:url')).toBe('https://www.steamfoot.com/apply');expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(meta('og:url'));
  expect(meta('og:image')).not.toContain('SB-');expect(meta('og:image')).not.toContain('vercel');
 });
 it('references an existing 1200x630 PNG over an absolute HTTPS URL',async()=>{
  const url=new URL(meta('og:image')!);expect(url.origin).toBe('https://www.steamfoot.com');
  const image=await sharp(readFileSync('public'+url.pathname)).metadata();expect(image.format).toBe('png');expect(image.width).toBe(1200);expect(image.height).toBe(630);
  expect(meta('og:image:width')).toBe(String(image.width));expect(meta('og:image:height')).toBe(String(image.height));expect(meta('og:image:type')).toBe('image/png');expect(meta('og:image:secure_url')).toBe(url.href);expect(meta('og:image:alt')).toContain('蒸管家');
  expect(meta('twitter:card')).toBe('summary_large_image');expect(meta('twitter:image')).toBe(url.href);
 });
});
