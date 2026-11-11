// Actual LIFF components + CSS; synthetic SDK/actions; all browser network blocked.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = process.cwd();
const output = path.resolve(process.env.QA_OUTPUT_DIR || 'artifacts/liff-plan-selection-20261111/steam');
mkdirSync(output, { recursive: true });
const mocks = {
  'next/navigation': `const router={replace:()=>{throw Error('Unexpected redirect')}};export const useRouter=()=>router;`,
  'next/link': `import React from 'react';export default function Link({children,prefetch,...props}){return <a {...props}>{children}</a>}`,
  '@/lib/liff/client': `export class LiffInitError extends Error{};export const initLiff=async()=>{};export const isInLineClient=()=>true;export const getIDToken=()=>'synthetic-token';`,
  '@/lib/liff/session-refresh': `export const refreshLiffSession=async()=>({status:'session_created'});`,
  '@/lib/liff/profile-loader': `export const loadProfileWithSessionRefresh=async()=>{throw Error('Unexpected profile load')};`,
  '@/server/actions/liff-my-wallets': `export const fetchLiffWallets=async()=>({status:'ok',active:window.qa.wallets??[{id:'wallet-single',planName:'暖暖蒸足方案',availableToBook:5,expiryDate:'2026-12-31'}],makeupCredits:Array.from({length:window.qa.credits},(_,i)=>({id:'synthetic-'+i,expiredAt:'2026-11-30'}))});`,
  '@/server/actions/liff-my-bookings': `export const fetchLiffBookings=async()=>({status:'ok',upcoming:[]});`,
  '@/server/actions/slots': `export const fetchMonthAvailability=async()=>({days:Object.fromEntries(['2026-11-03','2026-11-15'].map(d=>[d,{totalCapacity:10,totalBooked:0,slots:[{capacity:10,bookedPeople:0}]}]))});export const fetchDaySlots=async()=>({slots:[{startTime:'10:00',capacity:10,bookedCount:0,isPast:false,isEnabled:true}]});`,
  '@/server/actions/liff-member-booking': `export const submitLiffMemberBooking=async(input)=>{window.qa.calls.push(input);await new Promise(r=>setTimeout(r,100));if(window.qa.fail){window.qa.fail=false;return {status:'payment_pending'}}const n=window.qa.actualCredits??Math.min(window.qa.credits,input.people);return {status:'ok',bookingId:'synthetic',bookingDate:input.bookingDate,slotTime:input.slotTime,usedMakeup:n>0,usedMakeupCount:n,planSessionCount:input.people-n}};`,
};
await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{MemberBookingForm}from'./src/app/(liff)/liff/member-booking/member-booking-form';createRoot(document.getElementById('root')).render(<><aside className="bg-yellow-50 p-2 text-sm">隔離預覽：合成資料，不建立正式預約</aside><MemberBookingForm storeSlug="synthetic" storeName="暖暖蒸足（隔離預覽）" liffId="synthetic" contactUrl=""/></>);`,resolveDir:root,loader:'tsx'},bundle:true,jsx:'automatic',format:'iife',outfile:path.join(output,'fixture.js'),define:{'process.env.NODE_ENV':'"development"'},alias:{'@':path.join(root,'src')},plugins:[{name:'isolation',setup(b){b.onResolve({filter:/.*/},args=>{if(mocks[args.path])return{path:args.path,namespace:'mock'};if(args.path.startsWith('@/server/'))throw Error('Unmocked server import '+args.path)});b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'tsx',resolveDir:root}));}}]});
const css = await postcss([tailwind({base:root})]).process(readFileSync('src/app/globals.css','utf8'),{from:path.join(root,'src/app/globals.css')});
writeFileSync(path.join(output,'fixture.css'),css.css);
writeFileSync(path.join(output,'index.html'),`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LIFF 補課券隔離預覽</title><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script>window.qa={credits:1,calls:[],wallets:[{id:'wallet-a',planName:'暖暖蒸足 10 堂方案',availableToBook:3,expiryDate:'2026-11-10'},{id:'wallet-b',planName:'暖暖蒸足 10 堂方案',availableToBook:5,expiryDate:'2026-12-31'}]};const RealDate=Date;window.Date=class extends RealDate{constructor(...a){super(...(a.length?a:['2026-11-02T10:00:00+08:00']))}static now(){return new RealDate('2026-11-02T10:00:00+08:00').getTime()}};</script><script src="fixture.js"></script></body></html>`);
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];const errors=[];
const wallets=[
 {id:'wallet-a',planName:'暖暖蒸足 10 堂方案',availableToBook:3,expiryDate:'2026-11-10'},
 {id:'wallet-b',planName:'暖暖蒸足 10 堂方案',availableToBook:5,expiryDate:'2026-12-31'},
];
const scenarios=[
 {name:'three-plans-selected',credits:0,people:1,wallets:[{id:'wallet-single',planName:'單次',availableToBook:1,expiryDate:'2026-12-12'}, {id:'wallet-eight',planName:'10堂',availableToBook:8,expiryDate:'2026-12-12'}, {id:'wallet-four',planName:'10堂',availableToBook:4,expiryDate:'2027-03-05'}],choose:'wallet-four'},
 {name:'makeup',credits:1,people:1},
 {name:'mixed',credits:1,people:3},
 {name:'plan',credits:0,people:1},
 {name:'server-updated',credits:1,people:1,actualCredits:0},
 {name:'two-plans-auto',credits:0,people:1,wallets},
 {name:'two-plans-selected',credits:0,people:1,wallets,choose:'wallet-b'},
 {name:'two-plans-mixed',credits:1,people:3,wallets,choose:'wallet-b'},
 {name:'date-invalidates-selection',credits:0,people:1,wallets,choose:'wallet-a',changeDate:true},
 {name:'makeup-covers-after-selection',credits:1,people:1,initialPeople:2,wallets,choose:'wallet-b'},
 {name:'exhausted-wallet',credits:0,people:1,wallets:[wallets[0],{...wallets[1],availableToBook:0}]},
];
try {
 for(const width of (process.env.QA_WIDTH?[Number(process.env.QA_WIDTH)]:[360,390,768,1366])) {
  for(const scenario of scenarios.filter(s=>!process.env.QA_SCENARIO||s.name===process.env.QA_SCENARIO)) {
   const page=await browser.newPage({viewport:{width,height:844},timezoneId:'Asia/Taipei'});
   page.on('pageerror',e=>errors.push(e.message));
   await page.clock.install({time:new Date('2026-11-02T10:00:00+08:00')});
   await page.route('**/*',route=>route.request().url()==='http://localhost:3133/'?route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>'}):route.abort());
   await page.goto('http://localhost:3133/');
   await page.evaluate(s=>{window.qa={...s,calls:[]}},scenario);
   await page.addStyleTag({path:path.join(output,'fixture.css')});
   await page.addScriptTag({path:path.join(output,'fixture.js')});
   await page.getByText('1. 選擇日期',{exact:true}).waitFor();
   for(let i=1;i<(scenario.initialPeople??scenario.people);i++)await page.getByRole('button',{name:'+',exact:true}).click();
   await page.locator('button').filter({has:page.locator('span').filter({hasText:/^3$/})}).click();
   const selector=page.getByRole('combobox',{name:/選擇方案/});
   if(scenario.choose)await selector.selectOption(scenario.choose);
   if(scenario.initialPeople){
    await page.getByRole('button',{name:'−',exact:true}).click();
    assert.equal(await selector.count(),0,'All-makeup booking showed plan selection');
   }
   if(scenario.changeDate){
    await page.locator('button').filter({has:page.locator('span').filter({hasText:/^15$/})}).click();
    await page.getByRole('alert').filter({hasText:/所選方案在此預約日期無法使用/}).waitFor();
   }
   await page.getByRole('button',{name:/^10:00/}).click();
   const submit=page.getByRole('button',{name:scenario.credits?'確認補課優先預約':'使用堂數預約',exact:true});
   if(scenario.changeDate){
    assert.equal(await submit.isDisabled(),true,'Invalid date choice was allowed');
    assert.equal(await selector.locator('option[value="wallet-a"]').evaluate(e=>e.disabled),true,'Expired option was selectable');
    assert.equal(await selector.inputValue(),'wallet-a','Date change silently switched the chosen plan');
    await selector.selectOption('');
   }
   const shouldShowSelector=!!scenario.wallets&&scenario.name!=='exhausted-wallet'&&!scenario.initialPeople;
   assert.equal(await selector.count(),Number(shouldShowSelector));
   if(shouldShowSelector && scenario.name !== 'three-plans-selected'){
    assert.equal(await selector.locator('option[value="wallet-b"]').innerText(),'暖暖蒸足 10 堂方案 · 可用 5 堂 · 2026/12/31 到期');
    if(scenario.choose==='wallet-b')assert.match(await page.locator('#preferred-wallet-details').innerText(),/可用 5 堂.*2026\/12\/31/);
   }
   if(scenario.name === 'three-plans-selected'){
    assert.deepEqual(await selector.locator('option').allTextContents(),['自動選擇（最早到期優先）','單次 · 可用 1 堂 · 2026/12/12 到期','10堂 · 可用 8 堂 · 2026/12/12 到期','10堂 · 可用 4 堂 · 2027/03/05 到期']);
   }
   await submit.waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Horizontal overflow');
   await page.screenshot({path:path.join(output,`${scenario.name}-${width}-before.png`),fullPage:true});
   if(scenario.credits){
    const cancelled=page.waitForEvent('dialog');const click=submit.click();const d=await cancelled;assert.match(d.message(),/優先使用 1 張補課券/);if(scenario.people===3)assert.match(d.message(),/另使用 2 堂方案/);else assert.match(d.message(),/不扣方案堂數/);await d.dismiss();await click;
    assert.equal(await page.evaluate(()=>window.qa.calls.length),0,'Cancel submitted booking');
    const confirmed=page.waitForEvent('dialog');const click2=submit.click();await(await confirmed).accept();await click2;
   }else await submit.click();
   await page.getByText('預約已建立 ✓',{exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>window.qa.calls.length),1,'Duplicate booking');
   const bookingInput=await page.evaluate(()=>window.qa.calls[0]);
   const expectedWallet=scenario.initialPeople||scenario.changeDate?undefined:scenario.choose;
   assert.equal(bookingInput.customerPlanWalletId,expectedWallet,'Wrong preferred wallet submitted');
   const text=await page.locator('body').innerText();
   if((scenario.actualCredits??scenario.credits)>0){assert.match(text,/已使用 1 張補課券/);if(scenario.people===3){assert.match(text,/另保留 2 堂方案/);assert.doesNotMatch(text,/本次不扣方案堂數/)}else assert.match(text,/本次不扣方案堂數/)}else assert.doesNotMatch(text,/已使用.*補課券/);
   await page.screenshot({path:path.join(output,`${scenario.name}-${width}-success.png`),fullPage:true});
   results.push({width,...scenario,cancelDoesNotSubmit:!!scenario.credits,submitCount:1,noOverflow:true,submittedPreferredWallet:bookingInput.customerPlanWalletId??null});
   await page.close();
  }
 }
 assert.deepEqual(errors,[]);
 writeFileSync(path.join(output,process.env.QA_SCENARIO?`results-${process.env.QA_SCENARIO}.json`:'results.json'),JSON.stringify({synthetic:true,actualLINE:false,actualBackend:false,errors,results},null,2));
 console.log(JSON.stringify({output,checks:results.length,errors}));
}finally{await browser.close()}
