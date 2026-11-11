// Actual onboarding component/CSS with synthetic verified SDK and actions.
// Every network request is blocked; this is not a real LINE-token acceptance.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require = createRequire(import.meta.url), { chromium } = require('playwright');
const root = process.cwd(), output = '/tmp/course-single-first-login-ui';
mkdirSync(output, { recursive: true });
const stubs = {
  'next/navigation': 'const router={replace:path=>window.qa.redirects.push(path)};export const useRouter=()=>router;',
  '@/lib/liff/client': `export class LiffInitError extends Error{};export const initLiff=async()=>({isLoggedIn:()=>true});export const isInLineClient=()=>true;export const getIDToken=()=>'synthetic-token';export const getProfile=async()=>({displayName:'LINE聯絡人暱稱',pictureUrl:null});`,
  '@/lib/liff/session-refresh': `export const refreshLiffSession=async()=>({status:window.qa.refreshes++===0?'need_onboarding':'session_created'});`,
  './actions': `export const submitOnboarding=async data=>{window.qa.calls.push(data);return window.qa.multiple?{status:'login_review_pending',referenceId:'synthetic',verificationCode:'ABC123'}:data.name?{status:'ok'}:{status:'needs_name'};};`,
};
await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{OnboardingForm}from'./src/app/(liff)/liff/onboarding/onboarding-form';createRoot(document.getElementById('root')).render(<OnboardingForm storeSlug="synthetic" storeName="合成課程店" liffId="synthetic" contactUrl="" coursePhoneBinding/>);`, loader: 'tsx', resolveDir: root }, outfile: path.join(output, 'fixture.js'), bundle: true, platform: 'browser', jsx: 'automatic', alias: { '@': path.join(root, 'src') }, plugins: [{ name: 'synthetic-boundaries', setup(b) {
  b.onResolve({ filter: /^(next\/navigation|@\/lib\/liff\/(client|session-refresh)|\.\/actions)$/ }, a => ({ path: a.path, namespace: 'fixture-stub' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture-stub' }, a => ({ contents: stubs[a.path], loader: 'js', resolveDir: root }));
} }] });
const css = await postcss([tailwind({ base: root })]).process(readFileSync('src/app/globals.css', 'utf8') + '\n@source "' + path.join(root, 'src/app/(liff)/liff/onboarding/onboarding-form.tsx') + '";', { from: path.join(root, 'src/app/globals.css') });
writeFileSync(path.join(output, 'fixture.css'), css.css);
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errors = [], results = [];
try {
  for (const width of [390, 440, 768]) for (const multiple of [false, true]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', r => r.request().url() === 'http://localhost:3136/' ? r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>' }) : r.abort());
    await page.goto('http://localhost:3136/');
    await page.evaluate(m => { window.qa = { multiple: m, refreshes: 0, calls: [], redirects: [] }; }, multiple);
    await page.addStyleTag({ path: path.join(output, 'fixture.css') });
    await page.addScriptTag({ path: path.join(output, 'fixture.js') });
    try { await page.locator('input[name=phone]').waitFor(); } catch (error) { await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}); writeFileSync(path.join(output,'failure.txt'),await page.locator('body').innerText()); console.error(JSON.stringify({errors}));throw error; }
    assert.equal(await page.locator('input[name=name]').count(), 0);
    await page.locator('input[name=phone]').fill('0990000301');
    await page.getByRole('button', { name: '確認會員資料', exact: true }).click();
    if (multiple) {
      await page.getByText(/請向店家出示確認碼 ABC123/).waitFor();
      assert.equal(await page.evaluate(() => window.qa.calls.length), 1);
    } else {
      const name = page.locator('input[name=name]');
      await name.waitFor(); assert.equal(await name.inputValue(), '');
      await name.fill('原學員');
      assert.equal(await page.getByText(/已送出電話綁定申請/).count(), 0);
      await page.screenshot({ path: path.join(output, `single-name-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: '確認會員資料', exact: true }).click();
      await page.waitForFunction(() => window.qa.redirects.length === 1);
      const calls = await page.evaluate(() => window.qa.calls);
      assert.deepEqual(calls.map(c => c.name), ['', '原學員']);
      assert.equal(calls[1].phone, '0990000301');
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: path.join(output, `${multiple ? 'group-review' : 'single-complete'}-${width}.png`), fullPage: true });
    results.push({ width, multiple, passed: true }); await page.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(path.join(output, 'results.json'), JSON.stringify({ syntheticSDK: true, actualLINE: false, actualServerActions: false, errors, results }, null, 2));
  console.log(JSON.stringify({ output, checks: results.length, errors }));
} finally { await browser.close(); }
