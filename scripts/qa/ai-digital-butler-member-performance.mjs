// Read-only hosted measurement. Credentials are supplied in a private file outside the repo.
// Does not create access grants, activate users, deploy, or call a model.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

const require = createRequire(import.meta.url);
const configPath = process.argv[2], outputPath = process.argv[3];
if (!configPath || !outputPath) throw new Error('Usage: node scripts/qa/ai-digital-butler-member-performance.mjs PRIVATE_CONFIG OUTPUT_JSON');
const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
if (!/^https:\/\/steamfoot-booking-[a-z0-9-]+-rock7652-2111s-projects\.vercel\.app$/.test(cfg.origin) ||
  cfg.store !== 'ai-preview-steamfoot' || cfg.email !== 'ai-member-a@example.invalid' ||
  !/^\d{4}-\d{2}-\d{2}$/.test(cfg.date) || !cfg.password || !cfg.bypass) throw new Error('Invalid isolated measurement configuration');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }

const ms = start => Math.round(performance.now() - start);
const samples = [], failures = [];
let stage = 'launch';
const mark = name => { stage = name; console.info(JSON.stringify({ stage })); };
const safeError = error => String(error?.message ?? error).split('\n')[0]
  .replaceAll(cfg.password, '[redacted]').replaceAll(cfg.bypass, '[redacted]').replace(/https?:\/\/\S+/g, '[url]');
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
async function navigationTiming(page) {
  return page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    return n ? { ttfbMs: Math.round(n.responseStart - n.startTime),
      requestToFirstByteMs: Math.round(n.responseStart - n.requestStart),
      documentTransferMs: Math.round(n.responseEnd - n.responseStart),
      domContentLoadedMs: Math.round(n.domContentLoadedEventEnd - n.startTime) } : null;
  });
}
async function memberRead(page) {
  mark('member-query');
  const start = performance.now();
  const panel = page.getByRole('region', { name: 'AI 本人預約唯讀測試' });
  const [response] = await Promise.all([
    page.waitForResponse(r => new URL(r.url()).pathname === '/api/ai/member-bookings' && r.request().method() === 'GET'),
    panel.getByRole('button', { name: '查詢本人預約', exact: true }).click(),
  ]);
  const body = await response.json();
  if (response.status() !== 200 || !body.success || body.snapshot.total !== 1 ||
    JSON.stringify(body.snapshot.bookings) !== JSON.stringify([{ date: cfg.date, time: '10:00', status: 'CONFIRMED', people: 1 }])) throw new Error('Member read rejected or returned unexpected data');
  await panel.getByText('查詢本人預約中…', { exact: true }).waitFor({ state: 'hidden' });
  await panel.getByRole('list', { name: '本人預約紀錄' }).waitFor();
  const rows = await panel.getByRole('list', { name: '本人預約紀錄' }).locator('li').allTextContents();
  if (rows.length !== 1 || !rows[0].includes('10:00') || !rows[0].includes('1 人')) throw new Error('Synthetic member result mismatch');
  return ms(start);
}
async function memberNavigation(page, kind, width) {
  mark('member-navigation');
  await page.setViewportSize({ width, height: 1024 });
  const start = performance.now();
  const response = await page.goto(`${cfg.origin}/s/${cfg.store}/my-bookings`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (response?.status() !== 200) throw new Error('Member navigation rejected');
  mark('member-heading');
  await page.getByRole('heading', { name: '預約與方案', exact: true }).waitFor();
  mark('original-booking-row');
  await page.getByRole('region', { name: '預約清單', exact: true }).locator('[data-customer-booking-row]').filter({ hasText: '10:00' }).waitFor();
  // A real click and expanded controls prove hydration, rather than counting only SSR text.
  mark('expand-member-panel');
  const date = page.getByRole('region', { name: 'AI 本人預約唯讀測試' }).getByLabel('預約日期', { exact: true });
  let expansionAttempts = 0;
  for (; expansionAttempts < 3; ) {
    expansionAttempts++;
    await page.getByRole('button', { name: '測試本人查詢', exact: true }).click();
    try { await date.waitFor({ timeout: 1500 }); break; }
    catch { if (expansionAttempts === 3) throw new Error('Member panel did not expand after three clicks'); }
  }
  const pageUsableMs = ms(start);
  await date.fill(cfg.date);
  const firstReadMs = await memberRead(page);
  const throughFirstResultMs = ms(start), repeatReadMs = await memberRead(page);
  return { kind, width, expansionAttempts, pageUsableMs, throughFirstResultMs, firstReadMs, repeatReadMs, navigation: await navigationTiming(page) };
}
try {
  for (let trial = 1; trial <= 3; trial++) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 1024 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    try {
      await context.route('**/*', route => new URL(route.request().url()).origin === cfg.origin ? route.continue() : route.abort());
      const journeyStart = performance.now(), loginPageStart = performance.now();
      mark('login-page');
      await page.goto(`${cfg.origin}/hq/login?store=${cfg.store}&_vercel_share=${encodeURIComponent(cfg.bypass)}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.locator('input[name="email"]').waitFor();
      const loginPageMs = ms(loginPageStart), fillStart = performance.now();
      await page.locator('input[name="email"]').fill(cfg.email);
      await page.locator('input[name="password"]').fill(cfg.password);
      const automatedFillMs = ms(fillStart), loginStart = performance.now();
      mark('login-and-redirect');
      await page.getByRole('button', { name: '登入', exact: true }).click();
      await page.waitForURL(url => !url.pathname.includes('/login'), { waitUntil: 'domcontentloaded', timeout: 60000 });
      const loginAndRedirectMs = ms(loginStart), tabStart = performance.now(), oldPage = page;
      const memberPage = await context.newPage();
      await oldPage.close();
      const automatedTabChangeMs = ms(tabStart);
      const journeyToMemberNavigationMs = ms(journeyStart);
      const first = await memberNavigation(memberPage, 'first-navigation-in-new-browser-context', 1366);
      const journeyThroughMemberUsableMs = journeyToMemberNavigationMs + first.pageUsableMs;
      const journeyThroughFirstResultMs = journeyToMemberNavigationMs + first.throughFirstResultMs;
      const warm = [];
      for (const width of [1366, 390]) warm.push(await memberNavigation(memberPage, 'repeat-navigation-same-context', width));
      samples.push({ trial, loginPageMs, automatedFillMs, loginAndRedirectMs, automatedTabChangeMs, journeyThroughMemberUsableMs, journeyThroughFirstResultMs, first, warm });
    } catch (error) { failures.push({ trial, stage, reason: safeError(error) }); }
    finally { await context.close(); }
  }
} finally { await browser.close(); }
const summarize = values => {
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
  return n ? { n, minMs: sorted[0], medianMs: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2, maxMs: sorted[n - 1] } : { n: 0 };
};
writeFileSync(outputPath, JSON.stringify({
  sourceSha: cfg.sourceSha, origin: cfg.origin,
  conditions: { browser: 'Chromium simulated viewport', freshBrowserContexts: 3, explicitPrefetch: false, networkIdleWait: false,
    expansionRetryWaitMs: 1500, maxExpansionAttempts: 3,
    serverColdStart: 'not forced or established', fixture: 'member A, one synthetic booking, 2026-11-27 at 10:00',
    journey: 'login page, automated fill, login and redirect, automated tab change, native member page and first result' },
  samples, failures,
  summary: { loginPage: summarize(samples.map(s => s.loginPageMs)), loginAndRedirect: summarize(samples.map(s => s.loginAndRedirectMs)),
    firstMemberPageUsable: summarize(samples.map(s => s.first.pageUsableMs)),
    repeatedMemberPageUsable: summarize(samples.flatMap(s => s.warm.map(w => w.pageUsableMs))) }
}, null, 2) + '\n', { mode: 0o600 });
if (failures.length) process.exitCode = 1;
