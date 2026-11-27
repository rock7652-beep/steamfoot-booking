// Local Chromium simulation only. No database, external network, secrets or model calls.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = process.cwd(), output = path.join(root, 'artifacts/ai-digital-butler');
mkdirSync(output, { recursive: true });
await build({ entryPoints: ['scripts/qa/ai-digital-butler-ui-fixture.tsx'], bundle: true, jsx: 'automatic', format: 'iife', outfile: path.join(output, 'fixture.js'), metafile: true,
  alias: { '@': path.join(root, 'src') }, define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'synthetic-ai', setup(b) {
    b.onResolve({ filter: /(?:^|\/)ai-actions$/ }, () => ({ path: 'actions', namespace: 'fixture' }));
    b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }));
    b.onResolve({ filter: /^@\/components\/dashboard-link$/ }, () => ({ path: 'link', namespace: 'fixture' }));
    b.onResolve({ filter: /(?:^|\/)settings-navigation$/ }, () => ({ path: 'settings', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => {
      const contents = name === 'actions' ? `export const saveAiButlerSetting = input=>window.aiAction('save',input);export const testAiButler=input=>window.aiAction('test',input);export const setAiButlerTestHandoff=input=>window.aiAction('handoff',input);`
      : name === 'navigation' ? `export const usePathname=()=>'/dashboard/settings/digital-butler';export const useSearchParams=()=>new URLSearchParams();`
      : name === 'settings' ? `import{createContext}from'react';export const SettingsNavigationContext=createContext(null);export const settingsWorkspaceHref=(href)=>href;export const useRememberSettingsLocation=()=>{};`
      : `import{createElement}from'react';export const DashboardLink=({children,...props})=>createElement('a',props,children);`;
      return { contents, loader: 'js', resolveDir: root };
    });
  } }] });
const css = await postcss([tailwind({ base: root })]).process(readFileSync('src/app/globals.css', 'utf8'), { from: path.join(root, 'src/app/globals.css') });
writeFileSync(path.join(output, 'fixture.css'), css.css);
const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });
const results = [], errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith('https://synthetic.invalid/') ? route.fulfill({ contentType: 'text/html', body: '<html lang="zh-Hant"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>' }) : route.abort());
  await page.goto('https://synthetic.invalid/');
  await page.evaluate(() => {
    window.aiCalls = []; window.aiFail = false; window.aiNetworkFail = false; window.aiHandoff = false; window.aiRevision = 0;
    window.aiAction = async (name, input) => {
      window.aiCalls.push({ name, input });
      if (window.aiNetworkFail) { window.aiNetworkFail = false; throw Error('Synthetic network interruption'); }
      if (window.aiFail) return { success: false, error: '合成錯誤：設定尚未儲存，請重試。' };
      if (name === 'save') return { success: true, setting: input.setting, revision: ++window.aiRevision };
      if (name === 'handoff') { window.aiHandoff = input; return { success: true }; }
      const handoff = input.scenario !== 'hours';
      return { success: true, result: { outcome: window.aiHandoff ? 'STOPPED' : handoff ? 'HANDOFF' : 'ANSWER', text: window.aiHandoff ? '真人已接手' : handoff ? '請聯繫真人客服協助。' : '合成測試店週一至週五 10:00–18:00。', sourceIds: [] }, usage: { requests: '1', reservedMicros: '0', budgetMicros: 1000000, alerts: [] } };
    };
  });
  await page.addStyleTag({ path: path.join(output, 'fixture.css') });
  await page.addScriptTag({ path: path.join(output, 'fixture.js') });
  await page.getByRole('button', { name: '測試', exact: true }).click();
  await page.getByRole('button', { name: '開啟測試', exact: true }).click();
  await page.getByRole('button', { name: '關閉測試', exact: true }).waitFor();
  await page.getByLabel('產業', { exact: true }).selectOption('MUSIC');
  for (const [width, height] of [[1920, 1080], [1366, 900], [1024, 768], [768, 1024], [390, 844], [360, 800]]) {
    await page.setViewportSize({ width, height });
    await page.getByRole('button', { name: '測試回覆', exact: true }).click();
    await page.getByText('合成測試店週一至週五 10:00–18:00。', { exact: true }).waitFor();
    const state = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, selectedModule: document.querySelector('select').value,
      touch: [...document.querySelectorAll('button,select')].filter(el => el.getBoundingClientRect().height > 0).every(el => el.getBoundingClientRect().height >= 44) }));
    if (state.overflow || state.selectedModule !== 'MUSIC' || !state.touch) throw Error('RWD/state/target failure ' + width);
    await page.screenshot({ path: path.join(output, `ai-panel-${width}.png`), fullPage: true });
    results.push({ width, height, ...state });
  }
  await page.getByRole('button', { name: '模擬真人接手', exact: true }).click();
  await page.getByRole('button', { name: '恢復 AI 測試', exact: true }).waitFor();
  await page.getByRole('button', { name: '測試回覆', exact: true }).click();
  await page.getByText('真人已接手', { exact: true }).waitFor();
  await page.getByRole('button', { name: '恢復 AI 測試', exact: true }).click();
  await page.evaluate(() => { window.aiFail = true; });
  await page.getByRole('button', { name: '關閉測試', exact: true }).click();
  await page.getByRole('alert').waitFor();
  if (!await page.getByRole('button', { name: '關閉測試', exact: true }).count()) throw Error('Failed save changed state');
  await page.evaluate(() => { window.aiFail = false; window.aiNetworkFail = true; });
  await page.getByRole('button', { name: '測試回覆', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '重試將沿用' }).waitFor();
  await page.getByRole('button', { name: '測試回覆', exact: true }).click();
  await page.getByText('合成測試店週一至週五 10:00–18:00。', { exact: true }).waitFor();
  const eventIds = await page.evaluate(() => window.aiCalls.filter(c => c.name === 'test').slice(-2).map(c => c.input.eventId));
  if (eventIds[0] !== eventIds[1]) throw Error('Unknown result retried with new event ID');
  if (errors.length) throw Error(errors.join('\n'));
  writeFileSync(path.join(output, 'ui-results.json'), JSON.stringify({ kind: 'local Chromium synthetic UI, mocked actions; not authenticated business QA or physical devices', results, cases: ['expand', 'toggle-confirmed-save', 'resize-preserves-selection', 'test-reply', 'human-handoff-and-resume', 'failed-save-preserves-status', 'network-retry-retains-event-id'], consoleErrors: errors }, null, 2) + '\n');
  console.log(JSON.stringify({ sizes: results.length, cases: 7, consoleErrors: errors.length, output }));
} finally { await browser.close(); }
