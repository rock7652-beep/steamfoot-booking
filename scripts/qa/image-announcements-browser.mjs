// Local fixture only. Actual application authentication/database are tested separately.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.QA_PLAYWRIGHT_MODULE || '/opt/codex/cua_node/lib/node_modules/playwright');
const root = process.cwd(), out = process.env.QA_OUTPUT || '/tmp/image-announcements-preview'; mkdirSync(out, { recursive: true });
const colors = ['#a8c9b0', '#c6b6dc', '#e7cbaa'];
const images = await Promise.all(colors.map((color, i) => sharp(Buffer.from(`<svg width="840" height="${i === 1 ? 420 : 1188}" xmlns="http://www.w3.org/2000/svg"><rect width="840" height="${i === 1 ? 420 : 1188}" fill="${color}"/><text x="60" y="140" font-size="64">Schedule ${i+1}</text><path d="M60 240H780M60 440H780M60 640H780M60 840H780" stroke="white" stroke-width="4"/></svg>`)).jpeg().toBuffer()));
let failed = false, saved;
const server = await createServer({ root, configFile: false, cacheDir: '/tmp/image-announcements-vite', optimizeDeps: { include: ['react', 'react-dom/client', 'zod'] }, plugins: [react(), {
  name: 'announcement-fixture', configureServer(s) { s.middlewares.use((req, res, next) => {
    if (req.url === '/fixture-fail') { failed = !failed; res.end('ok'); return; }
    if (req.url === '/fixture-saved') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(saved)); return; }
    if (req.url?.startsWith('/api/image-announcements/') && req.method === 'GET') { const id = req.url.split('?')[0].split('/').at(-1); res.setHeader('Content-Type', 'image/jpeg'); res.end(images[(Number(id.at(-1)) - 1) % 3] || images[0]); return; }
    if (req.url === '/api/image-announcements' && req.method === 'POST') {
      const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', async () => {
        const body = await new Request('http://fixture.test', { method: 'POST', headers: { 'content-type': req.headers['content-type'] }, body: Buffer.concat(chunks) }).formData();
        const items = JSON.parse(body.get('items'));
        res.setHeader('Content-Type', 'application/json');
        if (failed) { res.statusCode = 400; res.end(JSON.stringify({ error: '測試儲存失敗，請重試' })); }
        else { saved = { revision: Number(body.get('revision')) + 1, items }; res.end(JSON.stringify(saved)); }
      }); return;
    }
    if (req.url === '/' || req.url?.startsWith('/?')) {
      res.setHeader('Content-Type', 'text/html'); s.transformIndexHtml(req.url, '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/qa/image-announcements-fixture.tsx"></script></body></html>').then(v => res.end(v)); return;
    }
    next();
  }); }
}], resolve: { alias: { '@': path.join(root, 'src') } }, css: { postcss: { plugins: [tailwind()] } }, server: { host: '127.0.0.1', port: 0 } });
await server.listen(); const base = `http://127.0.0.1:${server.httpServer.address().port}`;
let browser; const results = [];
try {
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  for (const [width, height] of [[1366,900],[1920,1080],[1024,768],[768,1024],[560,800],[390,844],[360,800]]) {
    const page = await browser.newPage({ viewport: { width, height } }), errors = []; page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(base); await page.getByRole('button', { name: '編輯', exact: true }).first().click();
    await page.getByLabel('第 1 張上架日期').fill('2026-11-01'); await page.getByLabel('第 1 張下架日期').fill('2026-11-30');
    await page.getByRole('button', { name: '下移第 1 張圖片' }).click();
    await page.getByRole('button', { name: '儲存', exact: true }).click(); await page.getByRole('status').filter({ hasText: '已儲存' }).waitFor();
    if (saved.items[1].startsOn !== '2026-11-01') throw Error('Ordering or dates not saved');
    await page.getByRole('button', { name: '編輯', exact: true }).first().click();
    await page.getByLabel('第 1 張下架日期').fill('2026-12-31');
    await page.request.get(base + '/fixture-fail'); await page.getByRole('button', { name: '儲存', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '測試儲存失敗' }).waitFor();
    if (await page.getByLabel('第 1 張下架日期').inputValue() !== '2026-12-31') throw Error('Draft lost on error');
    await page.request.get(base + '/fixture-fail');
    await page.getByRole('button', { name: '儲存', exact: true }).click(); await page.getByRole('status').filter({ hasText: '已儲存' }).waitFor();
    await page.getByRole('button', { name: '編輯', exact: true }).first().click();
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error(`Admin overflow ${width}`);
    await page.screenshot({ path: path.join(out, `admin-${width}.png`), fullPage: true });
    await page.goto(base + '/?front');
    const carousel = page.locator('[data-image-announcements]');
    await carousel.locator('img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
    const originalFrame = await carousel.boundingBox();
    const imageSize = await page.getByRole('button', { name: '放大公告圖片' }).locator('img').boundingBox();
    if (Math.abs(imageSize.width - originalFrame.width) > 2 || imageSize.height < imageSize.width * 1.4) throw Error('A4 image is not full width at its natural aspect ratio');
    const nav = page.getByRole('navigation', { name: '底部功能' });
    const navBox = await nav.boundingBox();
    if (Math.abs(navBox.y + navBox.height - height) > 1) throw Error('Bottom navigation is not fixed to viewport');
    await nav.getByRole('button', { name: '預約', exact: true }).click();
    await page.getByRole('heading', { name: '預約功能', exact: true }).waitFor();
    await nav.getByRole('button', { name: '首頁', exact: true }).click();
    await page.getByRole('heading', { name: '已預約清單', exact: true }).waitFor();
    await page.getByRole('button', { name: '第 2 張圖片' }).click();
    if (await page.getByRole('button', { name: '第 2 張圖片' }).getAttribute('aria-current') !== 'true') throw Error('Manual navigation failed');
    if (Math.abs((await carousel.boundingBox()).height - originalFrame.height) > 1) throw Error('Mixed image proportions shift page during rotation');
    await page.evaluate(() => scrollTo(0, 150));
    const triggerBox = await page.getByRole('button', { name: '放大公告圖片' }).boundingBox();
    const before = await page.evaluate(() => scrollY);
    // Click a visible point, avoiding Playwright auto-scrolling a tall A4 button.
    await page.mouse.click(triggerBox.x + 20, Math.max(0, triggerBox.y) + 20);
    const dialog = page.getByRole('dialog'); await dialog.waitFor();
    await page.getByRole('button', { name: '放大圖片', exact: true }).click(); await page.getByRole('button', { name: '縮小圖片' }).waitFor();
    await page.getByRole('button', { name: '縮小圖片' }).click(); await page.getByRole('button', { name: '下一張圖片' }).click();
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error(`Front overflow ${width}`);
    await page.screenshot({ path: path.join(out, `front-open-${width}.png`) });
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' });
    if (await page.evaluate(() => scrollY) !== before) throw Error('Scroll position not restored');
    if (await page.getByLabel('原本輸入').inputValue() !== '保留內容') throw Error('Underlying input lost');
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(out, `front-${width}.png`) });
    if (errors.length) throw Error(errors.join(';'));
    results.push({ width, height, admin: true, scheduleAndSortSaved: true, errorDraftPreserved: true, front: true, fullWidthNaturalRatio: true, mixedRatioStableHeight: true, bottomNavigation: true, modalZoom: true, scrollRestored: true, overflow: false }); await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); page.on('dialog', d => d.accept());
  await page.goto(base); await page.locator('input[type=file]').setInputFiles([{ name: 'schedule.png', mimeType: 'image/png', buffer: await sharp(images[0]).png().toBuffer() }, { name: 'wide.jpg', mimeType: 'image/jpeg', buffer: await sharp(images[1]).resize(600, 300).jpeg().toBuffer() }]);
  await page.getByRole('status').filter({ hasText: '未儲存' }).waitFor();
  await page.getByRole('button', { name: '儲存', exact: true }).click(); await page.getByRole('status').filter({ hasText: '已儲存' }).waitFor();
  if (saved.items.length !== 5) throw Error('Upload failed');
  if (!await page.getByRole('button', { name: '＋上傳圖片' }).isDisabled()) throw Error('Five-image cap missing');
  await page.getByRole('button', { name: '編輯', exact: true }).first().click();
  await page.getByLabel('第 1 張下架日期').fill('2026-12-31');
  await page.setViewportSize({ width: 768, height: 1024 });
  if (await page.getByLabel('第 1 張下架日期').inputValue() !== '2026-12-31') throw Error('Draft lost on resize');
  await page.goto(base + '/?readonly'); if (await page.getByRole('button', { name: '編輯', exact: true }).count()) throw Error('Read-only editor exposed');
  await page.goto(base + '/?front'); await page.waitForTimeout(6500);
  if (await page.getByRole('button', { name: '第 2 張圖片' }).getAttribute('aria-current') !== 'true') throw Error('Autoplay failed');
  await page.getByRole('button', { name: '第 3 張圖片' }).click(); await page.waitForTimeout(6500);
  if (await page.getByRole('button', { name: '第 3 張圖片' }).getAttribute('aria-current') !== 'true') throw Error('Manual interaction did not pause autoplay');
  await page.goto(base + '/?front');
  const touchTarget = page.getByRole('button', { name: '放大公告圖片' });
  await touchTarget.dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: 100, clientY: 120 }] });
  await touchTarget.dispatchEvent('touchend', { changedTouches: [{ identifier: 1, clientX: 100, clientY: 240 }] });
  await page.waitForTimeout(6500);
  if (await page.getByRole('button', { name: '第 1 張圖片' }).getAttribute('aria-current') !== 'true') throw Error('Touch scrolling did not pause autoplay');
  await touchTarget.dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: 240, clientY: 120 }] });
  await touchTarget.dispatchEvent('touchend', { changedTouches: [{ identifier: 1, clientX: 100, clientY: 120 }] });
  if (await page.getByRole('button', { name: '第 2 張圖片' }).getAttribute('aria-current') !== 'true') throw Error('Swipe failed');
  if (await page.getByRole('dialog').count()) throw Error('Swipe unexpectedly opened image');
  await touchTarget.dispatchEvent('click');
  if (await page.getByRole('dialog').count()) throw Error('Swipe ghost click unexpectedly opened image');
  await touchTarget.click(); await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: '關閉圖片' }).click();
  writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, upload: true, readonly: true, autoplay: true, manualPause: true, touchPause: true, swipe: true, limitation: 'Synthetic Chromium fixture; not authenticated application or real iPad/LIFF/Safari acceptance.' }, null, 2));
  console.log(JSON.stringify({ results, upload: true, readonly: true, autoplay: true, manualPause: true, touchPause: true, swipe: true }));
} finally { await browser?.close(); await server.close(); }
