// Actual UI; synthetic actions and blocked networking. No production data or credentials.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url);
const {chromium}=require('/opt/codex/cua_node/lib/node_modules/playwright-core');
const root=process.cwd(), out='/tmp/steam-transaction-replacement-preview';mkdirSync(out,{recursive:true});
await build({entryPoints:['scripts/qa/steam-transaction-replacement-fixture.tsx'],bundle:true,format:'iife',jsx:'automatic',outfile:path.join(out,'fixture.js'),define:{'process.env.NODE_ENV':'"development"','process.env.NEXT_PUBLIC_BUILD_ENV':'"synthetic"'},alias:{'@':path.join(root,'src')},plugins:[{name:'synthetic-only',setup(b){
 b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'qa'}));
 b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:`export const useRouter=()=>({refresh(){}});export const usePathname=()=>'/s/synthetic/admin/dashboard/revenue';export const useSearchParams=()=>new URLSearchParams();`,loader:'js'}));
 b.onResolve({filter:/^@\/server\//},a=>({path:path.join(root,'src',a.path.slice(2)+'.ts'),namespace:'synthetic-action'}));
 b.onLoad({filter:/.*/,namespace:'synthetic-action'},a=>{
  const names=[...readFileSync(a.path,'utf8').matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map(m=>m[1]);
  return {loader:'js',contents:names.map(name=>`export const ${name}=(...args)=>window.qaAction(${JSON.stringify(name)},...args);`).join('\n')};
 });
}}]});
const css=await postcss([tailwind({base:root})]).process(readFileSync('src/app/globals.css','utf8')+'\n'+readFileSync(path.join(out,'fixture.css'),'utf8'),{from:path.join(root,'src/app/globals.css')});writeFileSync(path.join(out,'fixture.css'),css.css);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];try{
 for(const [width,height] of [[1366,900],[1024,768],[768,1024],[390,844],[590,1000]]){
  const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url()==='https://synthetic.invalid/'?route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'}):route.abort());
  await page.goto('https://synthetic.invalid/');
  await page.evaluate(()=>{
   window.qaCalls=[];window.qaVoided=false;window.qaReplaced=false;
   const detail=()=>({success:true,data:{id:'synthetic-original',storeId:'synthetic-store',customerId:'synthetic-customer',customerName:'合成測試顧客',status:window.qaVoided?'VOIDED':'SUCCESS',transactionType:'PACKAGE_PURCHASE',paymentMethod:'CASH',paymentSplits:[],paymentStatus:'SUCCESS',amount:5990,originalAmount:null,note:'',revenueStaffId:'synthetic-staff',revenueStaffName:'合成店長',serviceStaffName:null,createdAt:'2026-11-14T04:00:00Z',transactionDate:'2026-11-14T04:00:00Z',voidedAt:window.qaVoided?'2026-11-15T04:00:00Z':null,voidedByName:null,voidReason:null,booking:null,customerPlanWallet:{id:'synthetic-wallet',planName:'十堂方案',totalSessions:10,remainingSessions:window.qaVoided?0:10,walletStatus:window.qaVoided?'CANCELLED':'ACTIVE',sessionsBreakdown:{available:window.qaVoided?0:10,reserved:0,completed:0,voided:window.qaVoided?10:0}},auditLogs:window.qaReplaced?[{id:'audit',action:'UPDATE_NOTE',actorName:'合成店長',reason:'取消原交易後補登正確收費',createdAt:'2026-11-15T04:00:00Z',afterJson:{kind:'PURCHASE_REPLACEMENT'}}]:[]}});
   window.qaAction=async(name,...args)=>{
    if(name==='fetchTransactionDetailDTO')return detail();
    if(name==='voidTransaction'){window.qaVoided=true;return {success:true,data:{transactionId:'synthetic-original'}};}
    if(name==='fetchTransactionReplacementContext')return {success:true,data:{customerId:'synthetic-customer',businessDate:'2026-11-14',paymentMethod:'CASH',canDiscount:false,plans:[{id:'twenty',name:'二十堂方案',category:'PACKAGE',price:11980,sessionCount:20,validityDays:90}]}};
    if(name==='assignPlanToCustomer'){if(window.qaFailNext){window.qaFailNext=false;throw Error('Synthetic transport interruption');}window.qaCalls.push(args[0]);await new Promise(r=>setTimeout(r,300));window.qaReplaced=true;return {success:true,data:{walletId:'new-wallet',transactionId:'replacement'}};}
    throw Error('Unexpected synthetic action: '+name);
   };
  });
  await page.addStyleTag({path:path.join(out,'fixture.css')});await page.addScriptTag({path:path.join(out,'fixture.js')});
  await page.getByRole('button',{name:'取消交易',exact:true}).waitFor({timeout:5000}).catch(async e=>{console.log(JSON.stringify({errors,body:await page.locator('body').innerText()}));throw e;});await page.getByRole('button',{name:'取消交易',exact:true}).click();await page.getByPlaceholder('取消原因（必填）').fill('方案調整後補登正確收費');await page.getByRole('button',{name:'確認取消交易',exact:true}).click();
  await page.getByRole('heading',{name:'補登正確收費',exact:true}).waitFor();
  if(!await page.getByText('沿用原交易日期 2026-11-14',{exact:false}).isVisible())throw Error('Missing original-date context');
  await page.locator('select[name="planId"]').selectOption('twenty');
  await page.screenshot({path:path.join(out,`replacement-${width}.png`)});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw Error('Page overflow '+width);
  const button=page.getByRole('button',{name:'確認補登',exact:true});
  if(width===1366){await page.evaluate(()=>{window.qaFailNext=true;});await button.click();await page.getByText('送出結果尚未確認，請保留原內容重試',{exact:true}).first().waitFor();if(await page.locator('select[name="planId"]').inputValue()!=='twenty')throw Error('Draft lost after failed request');}
  await button.click();
  await page.getByText('已補登正確收費',{exact:true}).waitFor();
  const calls=await page.evaluate(()=>window.qaCalls);if(calls.length!==1||calls[0].replacementOfTransactionId!=='synthetic-original'||calls[0].planId!=='twenty')throw Error('Wrong or duplicate replacement');
  await page.screenshot({path:path.join(out,`completed-${width}.png`)});
  if(errors.length)throw Error(errors.join('\n'));results.push({width,height,cancelThenReplace:true,originalDateVisible:true,noPageOverflow:true,submittedExactlyOnce:true,...(width===1366?{failedRequestRetainsDraft:true}:{})});await page.close();
 }
 writeFileSync(path.join(out,'results.json'),JSON.stringify({scope:'synthetic browser UI only; business logic tested separately in disposable PostgreSQL',results},null,2));console.log(JSON.stringify({output:out,results}));
}finally{await browser.close();}
