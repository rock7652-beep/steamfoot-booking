// Real shared onboarding UI with synthetic LINE/actions. No network or DB writes.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = process.cwd(), output = '/tmp/beauty-first-registration-qa', origin = 'http://localhost:3133';
mkdirSync(output, { recursive: true });
await build({
  stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{OnboardingForm}from'./src/app/(liff)/liff/onboarding/onboarding-form';window.qaCalls=[];window.qaScenario=new URLSearchParams(location.search).get('scenario');createRoot(document.getElementById('root')).render(<OnboardingForm storeSlug="synthetic" storeName="舒生活Soulife肩頸按摩" liffId="902-synthetic" contactUrl="https://line.me/R/ti/p/@synthetic" firstRegistration/>);`, resolveDir: root, loader: 'tsx' },
  bundle: true, format: 'iife', jsx: 'automatic', outfile: path.join(output, 'fixture.js'),
  define: { 'process.env.NODE_ENV': '"development"' }, alias: { '@': path.join(root, 'src') },
  plugins: [{ name: 'isolated-onboarding', setup(b) {
    b.onResolve({ filter: /^@\/lib\/liff\/client$/ }, () => ({ path: 'sdk', namespace: 'qa' }));
    b.onResolve({ filter: /^@\/lib\/liff\/session-refresh$/ }, () => ({ path: 'session', namespace: 'qa' }));
    b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'router', namespace: 'qa' }));
    b.onResolve({ filter: /^\.\/actions$/ }, args => args.importer.endsWith('onboarding-form.tsx') ? { path: 'actions', namespace: 'qa' } : undefined);
    b.onLoad({ filter: /.*/, namespace: 'qa' }, args => ({ contents: {
      sdk: `export class LiffInitError extends Error{};export const initLiff=async()=>({isLoggedIn:()=>true});export const isInLineClient=()=>true;export const getIDToken=()=>"synthetic-only";export const getProfile=async()=>({displayName:"測試顧客",pictureUrl:null});`,
      router: `const router={replace:p=>{window.qaCalls.push('navigate');window.qaDestination=p;}};export const useRouter=()=>router;`,
      session: `export const refreshLiffSession=async()=>{window.qaCalls.push('verify-session');return{status:window.qaSubmitted?(window.qaScenario==='session-failure'?'service_unavailable':'session_created'):'need_onboarding'}};`,
      actions: `export const submitOnboarding=async input=>{if(input.storeSlug!=='synthetic')throw Error('Non-synthetic store forbidden');window.qaCalls.push('submit');window.qaSubmitted=true;return{status:window.qaScenario==='conflict'?'identity_review_required':'ok'}};`,
    }[args.path], loader: 'js', resolveDir: root }));
  } }],
});
const css = await postcss([tailwind({ base: root })]).process(readFileSync('src/app/globals.css', 'utf8'), { from: path.join(root, 'src/app/globals.css') });
writeFileSync(path.join(output, 'fixture.css'), css.css);
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const checks = [], errors = [], unexpectedRequests = [];
try {
  for (const [width, height] of [[390, 844], [768, 1024], [1366, 900]]) {
    for (const scenario of ['member', 'booking', 'conflict', 'session-failure']) {
      const page = await browser.newPage({ viewport: { width, height } });
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => {
        if (route.request().url().startsWith(origin + '/?') && route.request().method() === 'GET') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>' });
        unexpectedRequests.push(route.request().method() + ' ' + route.request().url()); return route.abort();
      });
      await page.goto(`${origin}/?scenario=${scenario}${scenario === 'booking' ? '&booking=1' : ''}`);
      await page.addStyleTag({ path: path.join(output, 'fixture.css') });
      await page.addScriptTag({ path: path.join(output, 'fixture.js') });
      await page.getByRole('heading', { name: '加入本店會員' }).waitFor();
      const phone = page.getByLabel('手機號碼'); await phone.waitFor();
      if (await page.getByRole('button', { name: '完成登記', exact: true }).isEnabled()) throw Error('Empty phone can submit');
      await phone.fill('0912345678');
      await page.waitForFunction(() => !document.querySelector('button[type="submit"]').disabled);
      await page.screenshot({ path: path.join(output, `form-${width}-${scenario}.png`), fullPage: true });
      await page.getByRole('button', { name: '完成登記', exact: true }).click();
      if (scenario === 'conflict') await page.getByText('您的會員資料需要店家協助確認', { exact: false }).waitFor();
      else if (scenario === 'session-failure') await page.getByRole('link', { name: '聯繫店家' }).waitFor();
      else await page.waitForFunction(() => Boolean(window.qaDestination));
      const result = await page.evaluate(() => ({ calls: window.qaCalls, destination: window.qaDestination ?? null, overflow: document.documentElement.scrollWidth > innerWidth + 1 }));
      const expected = scenario === 'booking' ? '/s/synthetic/liff/public-trial?bookingStore=synthetic' : '/s/synthetic/liff';
      if (result.overflow) throw Error('Horizontal overflow');
      if (['member', 'booking'].includes(scenario)) {
        if (result.destination !== expected || result.calls.join(',') !== 'verify-session,submit,verify-session,navigate') throw Error('Navigation before verified session or wrong store');
      } else if (result.destination) throw Error('Conflict or failed session granted navigation');
      await page.screenshot({ path: path.join(output, `result-${width}-${scenario}.png`), fullPage: true });
      checks.push({ width, scenario, ...result }); await page.close();
    }
  }
  if (errors.length || unexpectedRequests.length) throw Error(JSON.stringify({ errors, unexpectedRequests }));
  writeFileSync(path.join(output, 'results.json'), JSON.stringify({ synthetic: true, actualLINE: false, actualBackend: false, errors, unexpectedRequests, checks }, null, 2));
  console.log(JSON.stringify({ output, checks: checks.length, errors }));
} finally { await browser.close(); }
