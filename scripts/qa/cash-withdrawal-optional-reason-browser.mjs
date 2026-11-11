// Actual cash entry forms; mock actions, all network blocked, no ledger writes.
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=process.cwd(),output=path.resolve('artifacts/withdrawal-optional-reason-20261111');mkdirSync(output,{recursive:true});
await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {WithdrawalForm,DepositForm,AdjustmentForm} from './src/app/(dashboard)/dashboard/cash-drawer/cash-entry-forms';window.qaCalls=[];const action=async(_previous,form)=>{window.qaCalls.push(Object.fromEntries(form));return {success:false,error:'隔離驗證已收到，未寫入正式帳務'}};createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-4xl space-y-6 p-4"><p>隔離預覽：合成資料，不寫入帳務</p>{[[WithdrawalForm,'提領'],[DepositForm,'補入'],[AdjustmentForm,'調整']].map(([Form,name])=><section key={name} aria-label={name} className="rounded-xl border bg-white"><h1 className="p-4 text-lg font-semibold">{name}</h1><Form action={action} returnPath="/synthetic"/></section>)}</main>);`,resolveDir:root,loader:'tsx'},bundle:true,jsx:'automatic',format:'iife',outfile:path.join(output,'fixture.js'),define:{'process.env.NODE_ENV':'"development"'},alias:{'@':path.join(root,'src')},plugins:[{name:'isolation',setup(b){
 const mocks={'next/navigation':`export const usePathname=()=>'/s/synthetic/admin/dashboard/cash-drawer';`,'next/link':`export const useLinkStatus=()=>({pending:false});import React from 'react';export default ({children,...props})=><a {...props}>{children}</a>;`,'@/lib/music-finance-sync':`export const publishMusicFinanceChange=()=>{throw Error('Unexpected success')};`,'@/lib/cash-drawer-form-client':`export const postCashDrawerForm=()=>{throw Error('Unexpected backend request')};`};
 b.onResolve({filter:/.*/},args=>{if(mocks[args.path])return {path:args.path,namespace:'mock'};if(args.path.startsWith('@/server/'))throw Error('Backend import forbidden')});b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'tsx',resolveDir:root}));
}}]});
const componentCss=readFileSync(path.join(output,'fixture.css'),'utf8');
const css=await postcss([tailwind({base:root})]).process(readFileSync('src/app/globals.css','utf8'),{from:path.join(root,'src/app/globals.css')});writeFileSync(path.join(output,'fixture.css'),css.css+'\n'+componentCss);
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||'/usr/bin/chromium',headless:true});const results=[],errors=[];
try{
 for(const [width,height] of [[360,900],[768,1024],[1024,768],[1366,900]]){
  const page=await browser.newPage({viewport:{width,height}});page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().isNavigationRequest()?route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div></body></html>'}):route.abort());
  await page.goto('https://synthetic.invalid/');await page.addStyleTag({path:path.join(output,'fixture.css')});await page.addScriptTag({path:path.join(output,'fixture.js')});
  const withdrawal=page.getByRole('region',{name:'提領',exact:true}),form=withdrawal.locator('form'),reason=form.locator('[name="reason"]'),amount=form.locator('[name="amount"]');
  await reason.waitFor();assert.equal(await reason.getAttribute('required'),null);assert.equal(await reason.getAttribute('minlength'),null);await withdrawal.getByText('原因（選填）',{exact:true}).waitFor();
  await amount.fill('1000');assert.equal(await form.evaluate(f=>f.checkValidity()),true);await page.screenshot({path:path.join(output,`withdrawal-${width}.png`),fullPage:true});
  let calls=0;
  for(const value of ['', '   ', '領現存銀行']){if(calls){await page.goto('https://synthetic.invalid/');await page.addStyleTag({path:path.join(output,'fixture.css')});await page.addScriptTag({path:path.join(output,'fixture.js')});}await amount.fill('1000');await reason.fill(value);assert.equal(await form.evaluate(f=>f.checkValidity()),true);await withdrawal.getByRole('button',{name:'送出提領',exact:true}).click();calls++;await page.waitForFunction(n=>window.qaCalls.length===n,1,{timeout:5000}).catch(async error=>{console.log(JSON.stringify({width,value,calls:await page.evaluate(()=>window.qaCalls),errors,body:await page.locator('body').innerText()}));throw error;});const input=await page.evaluate(()=>window.qaCalls.at(-1));assert.equal(input.reason,value);assert.equal(input.amount,'1000');}
  await amount.fill('0');assert.equal(await form.evaluate(f=>f.checkValidity()),false);
  for(const name of ['補入','調整']){const region=page.getByRole('region',{name,exact:true});assert.notEqual(await region.locator('[name="reason"]').getAttribute('required'),null);}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);results.push({width,height,emptyReasonAccepted:true,blankReasonAccepted:true,filledReasonAccepted:true,zeroAmountRejected:true,depositAdjustmentReasonStillRequired:true,realWrites:false});await page.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(path.join(output,'results.json'),JSON.stringify({synthetic:true,actualBackend:false,results,errors},null,2));console.log(JSON.stringify({output,cases:results.length,errors}));
}finally{await browser.close();}
