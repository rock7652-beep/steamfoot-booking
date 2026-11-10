// Local synthetic UI flow only. All network and backend modules are blocked.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const root = process.cwd(), out = '/tmp/course-login-recovery-ui';
const { chromium } = createRequire(import.meta.url)('playwright');
mkdirSync(out, { recursive: true });
await build({ stdin: { contents: `
import React from 'react';import{createRoot}from'react-dom/client';
import{OnboardingForm}from'@/app/(liff)/liff/onboarding/onboarding-form';
import{StoreMemberConnectionPanel}from'@/components/admin/store-member-connection-panel';
const value={success:true,canConfirm:true,data:{membership:'已連結',login:'待店家核對登入身分',notification:'本店已確認，發送前再檢查通道',conflict:false,pending:[{id:'synthetic-request',kind:'login',verificationCode:'ABC123'}]}};
createRoot(document.getElementById('root')).render(<main style={{maxWidth:880,margin:'auto',padding:20}}><h1>課程會員登入核對（隔離測試）</h1><section style={{maxWidth:420,margin:'24px auto'}}><OnboardingForm storeSlug='synthetic-course' storeName='測試課程店' liffId='synthetic' contactUrl='https://example.invalid'/></section><StoreMemberConnectionPanel customerId='synthetic-member' initial={{customerId:'synthetic-member',value}}/></main>);
`, resolveDir: root, loader: 'tsx' }, bundle: true, jsx: 'automatic', format: 'iife', outfile: `${out}/fixture.js`,
define: { 'process.env.NODE_ENV': '"development"' }, alias: { '@': path.join(root,'src') },
plugins: [{ name:'isolate', setup(b) {
 b.onResolve({filter:/^next\/navigation$/},()=>({path:'router',namespace:'qa'}));
 b.onResolve({filter:/^@\/lib\/liff\/(client|session-refresh)$/},a=>({path:a.path.endsWith('client')?'client':'session',namespace:'qa'}));
 b.onResolve({filter:/^\.\/actions$/},()=>({path:'onboard',namespace:'qa'}));
 b.onResolve({filter:/^@\/server\//},()=>({path:'actions',namespace:'qa'}));
 b.onResolve({filter:/^@\/components\/admin\/settings-panel-context$/},()=>({path:'guard',namespace:'qa'}));
 b.onResolve({filter:/^@\/components\/operations\/panel-read-cache$/},()=>({path:'cache',namespace:'qa'}));
 b.onResolve({filter:/^@\/lib\/customer-support-read-client$/},()=>({path:'reader',namespace:'qa'}));
 b.onResolve({filter:/^@\/lib\/(db|course-db|auth)$/},()=>{throw Error('Backend import forbidden');});
 b.onLoad({filter:/.*/,namespace:'qa'},a=>({loader:'js',resolveDir:root,contents: {
 router:`const router={replace:()=>{window.qaNavigated=true}};export const useRouter=()=>router;`,
 client:`export class LiffInitError extends Error{};export const initLiff=async()=>({});export const isInLineClient=()=>true;export const getIDToken=()=> 'synthetic-token';export const getProfile=async()=>({displayName:'測試會員'});`,
 session:`export const refreshLiffSession=async()=>({status:window.qaCompleted?'session_created':'need_onboarding'});`,
 onboard:`export const submitOnboarding=async()=>{if(sessionStorage.approved){window.qaCompleted=true;return{status:'ok'}}return{status:'login_review_pending',verificationCode:'ABC123',referenceId:'00000000-0000-0000-0000-000000000001'}};`,
 actions:`export const loadMemberConnectionAction=()=>{throw Error('Unexpected load')};export const approveMemberConnectionAction=()=>{throw Error('Notification mutation forbidden')};export const approveLoginRecoveryAction=async(...args)=>{window.qaApproval=args;sessionStorage.approved='1';return{success:true}};`,
 guard:`export const useSettingsPanelGuard=()=>{};`,
 cache:`const reader={invalidate:()=>{},read:()=>{throw Error('Unexpected read')}};export const usePanelReader=()=>reader;`,
 reader:`export const readMemberConnection=()=>{throw Error('Network read forbidden')};`,
 }[a.path]}));
 }}] });
const css=await postcss([tailwind({base:root})]).process(readFileSync('src/app/globals.css','utf8'),{from:path.join(root,'src/app/globals.css')});
writeFileSync(`${out}/fixture.css`,css.css);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[],results=[];
try {
 for(const width of [1440,768,390,360]) {
  const page=await browser.newPage({viewport:{width,height:1100}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().isNavigationRequest()?r.fulfill({contentType:'text/html',body:'<html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div></html>'}):r.abort());
  await page.goto('https://synthetic.invalid/');
  async function mount(){await page.addStyleTag({path:`${out}/fixture.css`});await page.addScriptTag({path:`${out}/fixture.js`});await page.locator('input[name=phone]').waitFor();}
  await mount();await page.locator('input[name=phone]').fill('0999000123');await page.locator('form button[type=submit]').click();
  await page.getByText(/已送出會員登入確認申請/).waitFor();
  if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))throw Error(`Overflow at ${width}`);
  await page.screenshot({path:`${out}/pending-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'已核對本人與確認碼，允許重新登入'}).click();
  await page.getByText(/登入：已核對，登入前持續有效/).waitFor();
  const args=await page.evaluate(()=>window.qaApproval);
  if(JSON.stringify(args)!==JSON.stringify(['synthetic-request','synthetic-member','ABC123']))throw Error('Wrong approval scope');
  await page.reload();await mount();await page.locator('input[name=phone]').fill('0999000123');await page.locator('form button[type=submit]').click();
  await page.waitForFunction(()=>window.qaNavigated===true);
  results.push({width,passed:true});await page.close();
 }
 if(errors.length)throw Error(errors.join('\n'));
 writeFileSync(`${out}/results.json`,JSON.stringify({synthetic:true,results,errors},null,2));console.log(JSON.stringify({out,results,errors}));
}finally{await browser.close();}
