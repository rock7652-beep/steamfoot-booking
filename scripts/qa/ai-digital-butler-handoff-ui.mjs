// Local component rehearsal, mocked actions/route refresh; never reads hosted credentials.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const root = process.cwd(), temp = mkdtempSync(path.join(tmpdir(), 'ai-handoff-ui-'));
const out = path.join(root, 'artifacts/ai-digital-butler/handoff'); mkdirSync(out, { recursive: true });
const plugins = [{ name: 'offline-handoff', setup(b) {
    b.onResolve({ filter: /(?:^|\/)ai-actions$/ }, () => ({ path: 'actions', namespace: 'fixture' }));
    b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }));
    b.onResolve({ filter: /^@\/components\/dashboard-link$/ }, () => ({ path: 'link', namespace: 'fixture' }));
    b.onResolve({ filter: /(?:^|\/)settings-navigation$/ }, () => ({ path: 'settings', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ loader: 'js', resolveDir: root, contents:
      name === 'actions' ? `export const resumeAiButlerConversation=input=>window.queueAction(input);`
        : name === 'navigation' ? `export const usePathname=()=>'/dashboard/settings/digital-butler';export const useSearchParams=()=>new URLSearchParams(window.queueCursor?'aiQueueAfter='+window.queueCursor:'');export const useRouter=()=>({refresh:()=>window.queueLoad(),replace:url=>{window.queueCursor=new URL(url,location.origin).searchParams.get('aiQueueAfter');window.queueLoad();}});`
          : name === 'settings' ? `import{createContext}from'react';export const SettingsNavigationContext=createContext(null);export const settingsWorkspaceHref=href=>href;export const useRememberSettingsLocation=()=>{};`
            : `import{createElement}from'react';export const DashboardLink=({children,...props})=>createElement('a',props,children);` }));
  } }];
const shared = { bundle: true, jsx: 'automatic', alias: { '@': path.join(root, 'src') }, define: { 'process.env.NODE_ENV': '"development"' }, plugins };
await build({ ...shared, stdin: { contents: `import{createElement as h}from'react';import{hydrateRoot}from'react-dom/client';import{AiHandoffPanel}from'./src/app/(dashboard)/dashboard/settings/digital-butler/ai-handoff-panel';let root;window.drawQueue=props=>{const element=h(AiHandoffPanel,{key:props.viewKey,...props});if(root)root.render(element);else root=hydrateRoot(document.getElementById('root'),element,{onRecoverableError:e=>window.queueHydrationErrors.push(e.message)});};window.queueLoad();`, resolveDir: root, loader: 'tsx' }, format: 'iife', outfile: path.join(temp, 'fixture.js') });
await build({ ...shared, stdin: { contents: `import{createElement as h}from'react';import{renderToString}from'react-dom/server';import{AiHandoffPanel}from'./src/app/(dashboard)/dashboard/settings/digital-butler/ai-handoff-panel';export{formatTWTime as label}from'./src/lib/date-utils';export const render=props=>renderToString(h(AiHandoffPanel,{key:props.viewKey,...props}));`, resolveDir: root, loader: 'tsx' }, platform: 'node', format: 'cjs', outfile: path.join(temp, 'ssr.cjs') });
const ssr = require(path.join(temp, 'ssr.cjs'));
const fixtureRows = Array.from({ length: 51 }, (_, i) => ({ scopeKey: (i + 1).toString(16).padStart(64, '0'), revision: 1, needsReview: i === 1, lastEventAt: '2026-11-26T04:00:00Z', lastEventLabel: ssr.label('2026-11-26T04:00:00Z') }));
globalThis.window = { queueCursor: null };
const ssrHtml = ssr.render({ viewKey: 'a'.repeat(64), page: { rows: fixtureRows.slice(0, 25), total: 51, nextCursor: fixtureRows[24].scopeKey }, readOnly: false });
delete globalThis.window;
const css = await postcss([tailwind({ base: root })]).process(readFileSync('src/app/globals.css', 'utf8'), { from: path.join(root, 'src/app/globals.css') });
writeFileSync(path.join(temp, 'fixture.css'), css.css);
const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } }), errors = [], sizes = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url() === 'https://synthetic.invalid/' ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root" style="max-width:1100px;margin:auto;padding:16px">${ssrHtml}</div></html>` }) : route.abort());
  await page.goto('https://synthetic.invalid/');
  await page.evaluate(rows => {
    window.queueRows = rows; window.queueHydrationErrors = [];
    window.queueCalls = []; window.queueCursor = null; window.queueView = 'a'.repeat(64); window.queueReadOnly = false;
    window.queueLoad = () => {
      const rows = window.queueRows.filter(row => !window.queueCursor || row.scopeKey > window.queueCursor);
      window.drawQueue({ viewKey: window.queueView, cursor: window.queueCursor || undefined, readOnly: window.queueReadOnly,
        page: window.queueError ? null : { rows: rows.slice(0, 25), total: window.queueRows.length, nextCursor: rows.length > 25 ? rows[24].scopeKey : null } });
    };
    window.queueAction = async input => {
      window.queueCalls.push(input);
      if (window.queueFail) { window.queueFail = false; throw Error('Synthetic interruption'); }
      if (window.queueConflict) return { success: false, uncertain: false, error: '對話狀態已變更，請重新整理清單後核對。' };
      window.queueRows = window.queueRows.filter(row => row.scopeKey !== input.scopeKey); return { success: true, duplicate: false };
    };
  }, fixtureRows);
  await page.addStyleTag({ path: path.join(temp, 'fixture.css') }); await page.addScriptTag({ path: path.join(temp, 'fixture.js') });
  const panel = page.getByRole('region', { name: 'AI 待人工處理' });
  await panel.getByRole('button', { name: '查看待處理', exact: true }).click();
  const rows = () => panel.locator('li[data-scope-code]');
  if (await rows().count() !== 25) throw Error('first page size');
  await panel.getByRole('button', { name: '下一頁待處理' }).click();
  await page.waitForFunction(() => !!window.queueCursor); if (await rows().count() !== 25) throw Error('second page size');
  await panel.getByRole('button', { name: '下一頁待處理' }).click(); await page.waitForFunction(() => document.querySelectorAll('li[data-scope-code]').length === 1);
  await panel.getByRole('button', { name: '回到第一頁' }).click(); await page.waitForFunction(() => document.querySelectorAll('li[data-scope-code]').length === 25);
  if (!await rows().nth(1).getByRole('button', { name: '準備恢復' }).isDisabled()) throw Error('unreconciled event enabled');
  await rows().first().getByRole('button', { name: '準備恢復' }).click(); await panel.getByRole('button', { name: '取消恢復' }).click();
  if (await page.evaluate(() => window.queueCalls.length)) throw Error('cancel wrote');
  await rows().first().getByRole('button', { name: '準備恢復' }).click();
  for (const [width, height] of [[1920, 1080], [1366, 900], [1024, 768], [768, 1024], [390, 844], [360, 800]]) {
    await page.setViewportSize({ width, height });
    const state = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      touch: [...document.querySelectorAll('button')].filter(el => el.getBoundingClientRect().height > 0).every(el => el.getBoundingClientRect().height >= 44) }));
    if (state.scrollWidth > state.width || !state.touch || !await panel.getByRole('button', { name: '確認恢復此對話' }).isVisible()) throw Error('RWD or confirmation lost');
    sizes.push(state); await page.screenshot({ path: path.join(out, `local-${width}.png`), fullPage: false });
  }
  await page.evaluate(() => { window.queueFail = true; }); await panel.getByRole('button', { name: '確認恢復此對話' }).click();
  await panel.getByRole('button', { name: '重試原恢復操作' }).waitFor(); await panel.getByRole('button', { name: '重試原恢復操作' }).click();
  await panel.getByText('已記錄恢復；AI 總停止與店家開關仍有效。', { exact: true }).waitFor();
  const same = await page.evaluate(() => window.queueCalls.length === 2 && window.queueCalls[0].commandId === window.queueCalls[1].commandId);
  if (!same) throw Error('uncertain command changed');
  await page.evaluate(() => { window.queueConflict = true; }); await rows().nth(1).getByRole('button', { name: '準備恢復' }).click();
  await panel.getByRole('button', { name: '確認恢復此對話' }).click(); await panel.getByRole('alert').filter({ hasText: '狀態已變更' }).waitFor();
  await page.evaluate(() => { window.queueView = 'b'.repeat(64); window.queueReadOnly = true; window.queueLoad(); });
  await panel.getByRole('button', { name: '查看待處理', exact: true }).click();
  if (await panel.getByRole('button', { name: '確認恢復此對話' }).count()) throw Error('old scope confirmation leaked');
  if (!await rows().first().getByRole('button', { name: '準備恢復' }).isDisabled()) throw Error('readonly mutation');
  await page.evaluate(() => { window.queueError = true; window.queueLoad(); }); await panel.getByRole('alert').filter({ hasText: '尚未讀取成功' }).waitFor();
  if (errors.length) throw Error(errors.join('\n'));
  const hydrationErrors = await page.evaluate(() => window.queueHydrationErrors);
  if (hydrationErrors.length) throw Error('SSR hydration mismatch: ' + hydrationErrors[0]);
  writeFileSync(path.join(out, 'local-ui.json'), JSON.stringify({ kind: 'Local Chromium, mocked server actions and route refresh; not hosted/real-device evidence', syntheticRows: 51,
    sizes, cases: ['ssr-hydration-matches-browser', 'pagination-25-25-1', 'blocked-pending', 'cancel-no-write', 'resize-keeps-confirmation', 'uncertain-retry-same-command', 'version-conflict', 'actor-scope-reset', 'readonly', 'read-error-not-empty'], errors, hydrationErrors }, null, 2) + '\n');
  console.log(JSON.stringify({ cases: 10, sizes: sizes.length, errors, hydrationErrors }));
} finally { await browser.close(); rmSync(temp, { recursive: true, force: true }); }
