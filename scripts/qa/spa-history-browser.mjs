// Run with `npx tsx scripts/qa/spa-history-browser.mjs` from the repository root.
// The public document is the actual 410 response; HQ uses its real shared component
// in a synthetic sidebar layout, with no database, session, or business writes.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import retirement from '../../src/lib/retired-store-response.ts';
const { retiredStoreResponse } = retirement;
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.QA_PLAYWRIGHT_MODULE || 'playwright');
const root = process.cwd(), stub = '\0spa-history:';
const server = await createServer({ root, configFile: false, plugins: [react(), {
  name: 'spa-history-read-only-fixture',
  configureServer(server) { server.middlewares.use(async (req, res, next) => {
    if (req.url === '/retired') {
      const response = retiredStoreResponse(true);
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text());
    } else if (req.url === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end(await server.transformIndexHtml('/', '<!doctype html><html lang="zh-TW"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/qa/spa-history-fixture.tsx"></script></body></html>'));
    } else next();
  }); },
  resolveId(id) { if (id.startsWith(stub)) return id; },
  load(id) { if (id === stub + 'link') return 'export const DashboardLink="a";'; },
}], resolve: { alias: [{ find: '@/components/dashboard-link', replacement: stub + 'link' }, { find: '@', replacement: root + '/src' }] }, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_EXECUTABLE || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
const out = process.env.QA_OUTPUT || '/tmp/steamfoot-spa-history'; mkdirSync(out, { recursive: true });
const results = [];
try {
  for (const view of ['retired', 'hq']) for (const [width, height] of [[360,800],[390,844],[768,1024],[1024,768],[1366,900],[1920,1080]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/${view === 'retired' ? 'retired' : ''}`);
    await page.getByRole('heading', { name: '此模組已停用' }).waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    const controls = await page.locator('input,select,textarea,button,form').count();
    const links = await page.locator('a').evaluateAll(nodes => nodes.map(a => ({ href: a.getAttribute('href'), height: a.getBoundingClientRect().height })));
    await page.keyboard.press('Tab'); const keyboardReachable = await page.locator('a:focus').count() === 1;
    const historyLink = view !== 'hq' || links.some(link => link.href === '/hq/dashboard/operation-audits?module=SPA');
    const pass = response.status() === (view === 'retired' ? 410 : 200) && !overflow && controls === 0 && links.every(link => link.height >= 44) && historyLink && keyboardReachable && !errors.length;
    results.push({ view, width, height, status: response.status(), controls, overflow, links, keyboardReachable, errors, pass });
    await page.screenshot({ path: `${out}/${view}-${width}x${height}.png`, fullPage: true }); await page.close();
  }
  writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2)); console.log(JSON.stringify(results));
  if (results.some(result => !result.pass)) process.exitCode = 1;
} finally { await browser.close(); await server.close(); }
