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
const root = process.cwd(), temp = mkdtempSync(path.join(tmpdir(), 'ai-member-ui-'));
const out = path.join(root, 'artifacts/ai-digital-butler/member-bookings'); mkdirSync(out, { recursive: true });
const plugins = [{ name: 'offline-availability', setup(b) {
    b.onResolve({ filter: /(?:^|\/)ai-availability-actions$/ }, () => ({ path: 'actions', namespace: 'fixture' }));
    b.onResolve({ filter: /^@\/components\/operations\/panel-read-cache$/ }, () => ({ path: 'reader', namespace: 'fixture' }));
    b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }));
    b.onResolve({ filter: /^@\/components\/dashboard-link$/ }, () => ({ path: 'link', namespace: 'fixture' }));
    b.onResolve({ filter: /(?:^|\/)settings-navigation$/ }, () => ({ path: 'settings', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ loader: 'js', resolveDir: root, contents:
      name === 'actions' ? `export const readAiButlerSteamAvailability=input=>window.memberRead(input);`
        : name === 'reader' ? `import{useMemo}from'react';export const usePanelReader=()=>useMemo(()=>({refresh:input=>window.memberRead(input),clear:()=>{}}),[]);`
        : name === 'navigation' ? `export const usePathname=()=>'/dashboard/settings/digital-butler';export const useSearchParams=()=>new URLSearchParams(window.queueCursor?'aiQueueAfter='+window.queueCursor:'');export const useRouter=()=>({refresh:()=>window.queueLoad(),replace:url=>{window.queueCursor=new URL(url,location.origin).searchParams.get('aiQueueAfter');window.queueLoad();}});`
          : name === 'settings' ? `import{createContext}from'react';export const SettingsNavigationContext=createContext(null);export const settingsWorkspaceHref=href=>href;export const useRememberSettingsLocation=()=>{};`
            : `import{createElement}from'react';export const DashboardLink=({children,...props})=>createElement('a',props,children);` }));
  } }];
const shared = { bundle: true, jsx: 'automatic', alias: { '@': path.join(root, 'src') }, define: { 'process.env.NODE_ENV': '"development"' }, plugins };
const component = './src/app/(customer)/my-bookings/ai-member-bookings-panel';
await build({ ...shared, stdin: { contents: `import{createElement as h}from'react';import{hydrateRoot}from'react-dom/client';import{AiMemberBookingsPanel}from'${component}';let root;window.drawMember=props=>{const el=h(AiMemberBookingsPanel,{key:props.viewKey,...props});if(root)root.render(el);else root=hydrateRoot(document.getElementById('root'),el,{onRecoverableError:e=>window.hydrationErrors.push(e.message)});};`, resolveDir: root, loader: 'tsx' }, format: 'iife', outfile: path.join(temp, 'fixture.js') });
await build({ ...shared, stdin: { contents: `import{createElement as h}from'react';import{renderToString}from'react-dom/server';import{AiMemberBookingsPanel}from'${component}';export const render=props=>renderToString(h(AiMemberBookingsPanel,props));`, resolveDir: root, loader: 'tsx' }, platform: 'node', format: 'cjs', outfile: path.join(temp, 'ssr.cjs') });
const props = { viewKey: 'a'.repeat(64), initialDate: '2026-11-27' }, html = require(path.join(temp, 'ssr.cjs')).render(props);
const css = await postcss([tailwind({ base: root })]).process(readFileSync('src/app/globals.css', 'utf8'), { from: path.join(root, 'src/app/globals.css') });
const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 1024 } }), errors = [], sizes = [], cases = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => r.request().url() === 'https://synthetic.invalid/' ? r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root" style="max-width:1100px;margin:auto;padding:16px">${html}</div></html>` }) : r.abort());
  await page.goto('https://synthetic.invalid/'); await page.addStyleTag({ content: css.css });
  await page.evaluate(() => {
    window.hydrationErrors = []; window.calls = []; window.mode = 'success';
    window.memberRead = async input => {
      window.calls.push(input);
      const total = window.mode === 'empty' ? 0 : 51, start = (input.page - 1) * 25;
      const bookings = Array.from({ length: Math.min(25, Math.max(0, total - start)) }, () => ({ date: input.date, time: '10:00', status: 'CONFIRMED', people: 1 }));
      const snapshot = { ...input, total, pageSize: 25, bookings, checkedAtLabel: '2026/11/26 下午12:00' };
      if (window.mode === 'hold') return new Promise(resolve => { window.release = () => resolve({ success: true, snapshot }); });
      if (window.mode === 'throw') throw Error('Synthetic interruption');
      if (window.mode === 'error') return { success: false, error: '無法確認本人會員或查詢權限' };
      if (window.mode === 'wrong-proof') snapshot.viewKey = 'c'.repeat(64);
      return { success: true, snapshot };
    };
  });
  await page.addScriptTag({ path: path.join(temp, 'fixture.js') }); await page.evaluate(p => window.drawMember(p), props);
  await page.getByRole('button', { name: '測試本人查詢', exact: true }).click();
  if ((await page.evaluate(() => window.hydrationErrors)).length) throw Error('SSR mismatch'); cases.push('ssr-hydration');
  const query = () => page.getByRole('button', { name: '查詢本人預約', exact: true }).click();
  await query(); await page.getByText('2026-11-27・共 51 筆・第 1 頁', { exact: true }).waitFor();
  if (await page.getByRole('list', { name: '本人預約紀錄' }).locator('li').count() !== 25) throw Error('first page incomplete');
  for (const width of [1920, 1366, 1024, 768, 390, 360]) {
    await page.setViewportSize({ width, height: 1024 });
    const state = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, controls: [...document.querySelectorAll('button,input')].filter(el => el.getBoundingClientRect().height).every(el => el.getBoundingClientRect().height >= 44) }));
    if (state.scrollWidth > width || !state.controls) throw Error('RWD/touch'); sizes.push(state);
    await page.screenshot({ path: path.join(out, `local-${width}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: '下一頁預約', exact: true }).click(); await page.getByText('2026-11-27・共 51 筆・第 2 頁', { exact: true }).waitFor();
  if (await page.getByRole('list', { name: '本人預約紀錄' }).locator('li').count() !== 25) throw Error('second page incomplete');
  await page.getByRole('button', { name: '下一頁預約', exact: true }).click(); await page.getByText('2026-11-27・共 51 筆・第 3 頁', { exact: true }).waitFor();
  if (await page.getByRole('list', { name: '本人預約紀錄' }).locator('li').count() !== 1) throw Error('last page incomplete'); cases.push('pagination-25-25-1');
  await page.getByRole('button', { name: '收合本人查詢', exact: true }).click(); await page.getByRole('button', { name: '測試本人查詢', exact: true }).click();
  await page.getByText('2026-11-27・共 51 筆・第 3 頁', { exact: true }).waitFor(); cases.push('collapse-keeps-page');
  await page.evaluate(() => { window.mode = 'error'; }); await query(); await page.getByRole('alert').waitFor();
  if (await page.getByText('這一天沒有預約紀錄。', { exact: true }).count()) throw Error('error looked empty'); cases.push('identity-error-not-empty');
  await page.evaluate(() => { window.mode = 'success'; }); await query(); await page.getByText('2026-11-27・共 51 筆・第 3 頁', { exact: true }).waitFor(); cases.push('retry-keeps-page');
  await page.getByLabel('預約日期', { exact: true }).fill('2026-11-28'); if (await page.getByRole('list', { name: '本人預約紀錄' }).count()) throw Error('old date visible'); cases.push('date-change-clears-result');
  await page.evaluate(() => { window.mode = 'empty'; }); await query(); await page.getByText('這一天沒有預約紀錄。', { exact: true }).waitFor(); cases.push('confirmed-empty');
  await page.evaluate(() => { window.mode = 'throw'; }); await query(); await page.getByRole('alert').filter({ hasText: '讀取中斷' }).waitFor(); cases.push('network-error');
  await page.evaluate(() => { window.mode = 'wrong-proof'; }); await query(); await page.getByRole('alert').filter({ hasText: '範圍已變更' }).waitFor(); cases.push('wrong-proof-not-displayed');
  await page.evaluate(() => { window.mode = 'hold'; }); await query(); await page.getByText('查詢本人預約中…', { exact: true }).waitFor();
  await page.getByLabel('預約日期', { exact: true }).fill('2026-11-29'); await page.evaluate(() => window.release());
  if (await page.getByRole('list', { name: '本人預約紀錄' }).count()) throw Error('late date result'); cases.push('late-date-discarded');
  await query(); await page.getByText('查詢本人預約中…', { exact: true }).waitFor(); await page.evaluate(p => window.drawMember({ ...p, viewKey: 'b'.repeat(64) }), props);
  await page.getByRole('button', { name: '測試本人查詢', exact: true }).waitFor(); await page.evaluate(() => window.release());
  await page.getByRole('button', { name: '測試本人查詢', exact: true }).click(); if (await page.getByRole('list', { name: '本人預約紀錄' }).count()) throw Error('late actor result'); cases.push('late-actor-discarded');
  const hydrationErrors = await page.evaluate(() => window.hydrationErrors); if (errors.length || hydrationErrors.length) throw Error(JSON.stringify({ errors, hydrationErrors }));
  writeFileSync(path.join(out, 'local-ui.json'), JSON.stringify({ kind: 'Local Chromium SSR and mocked reader, not hosted or physical-device evidence', cases, sizes, errors, hydrationErrors }, null, 2) + '\n');
  console.log(JSON.stringify({ cases: cases.length, sizes: sizes.length, errors, hydrationErrors }));
} finally { await browser.close(); rmSync(temp, { recursive: true, force: true }); }
