// Local synthetic preview; no production requests or writes.
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=process.cwd(),output=process.env.QA_OUTPUT_DIR||'/tmp/beauty-public-steps-ui';
mkdirSync(output,{recursive:true});
await build({entryPoints:['scripts/qa/beauty-public-steps-fixture.tsx'],bundle:true,jsx:'automatic',format:'iife',outfile:path.join(output,'fixture.js'),alias:{'@':path.join(root,'src')},define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},plugins:[{name:'isolated-ports',setup(builder){
 builder.onResolve({filter:/^@\/server\//},args=>({path:path.join(root,'src',args.path.slice(2)+'.ts'),namespace:'server-stub'}));
 builder.onLoad({filter:/.*/,namespace:'server-stub'},args=>({contents:[...readFileSync(args.path,'utf8').matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map(match=>['voidBeautyNativeTransaction','assignBeautyNativeCard','prepareBeautyPlanPurchaseIntentAtomic','readBeautyPlanPurchaseIntent','acknowledgeBeautyPlanPurchaseIntent'].includes(match[1])?`export const ${match[1]}=(input)=> '${match[1]}'==='voidBeautyNativeTransaction'?window.qaVoid(input):window.qaPlanAction('${match[1]}',input);`:match[1]==='saveBeautyDisplayOrder'?`export const saveBeautyDisplayOrder=async(input)=>{window.qaOrderSaved=input;return {success:true,revision:input.revision+1};}`:match[1]==='saveBeautyTechnicianService'?`export const saveBeautyTechnicianService=async(input)=>{window.qaTechnicianSaved=input;return {success:true,data:{...input,revision:input.revision+1}};}`:match[1]==='getCourseRental'?`export const getCourseRental=async()=>({id:'rental-fit',roomId:'bed',customerId:null,customerName:'租借測試顧客',customerPhone:'0900000001',startsAt:'2026-11-03T07:30:00Z',endsAt:'2026-11-03T08:30:00Z',amount:0,note:'',revision:1,cancelledAt:null,hourlyRateSnapshot:0,payment:null});`:match[1]==='saveCourseRental'?`export const saveCourseRental=(...args)=>window.qaRentalSave(...args);`:`export const ${match[1]}=(...args)=>{if('${match[1]}'==='collectBeautyPayment'){window.collectionSaved=args;return Promise.resolve({success:true});}throw Error("Unexpected server action in synthetic UI")};`).join('\n'),loader:'js'}));
 builder.onResolve({filter:/^next\/dynamic$/},()=>({path:'dynamic',namespace:'qa-dynamic'}));
 builder.onLoad({filter:/.*/,namespace:'qa-dynamic'},()=>({contents:'export default ()=>()=>null;',loader:'js'}));
 builder.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'qa'}));
 builder.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'qa'}));
 builder.onLoad({filter:/.*/,namespace:'qa'},args=>({contents:args.path==='navigation'?`const router={push:()=>{},replace:()=>{},refresh:()=>{},prefetch:()=>{}};const params=new URLSearchParams();export const useRouter=()=>router;export const usePathname=()=>'/hq/dashboard/beauty';export const useSearchParams=()=>params;export const unstable_rethrow=error=>{throw error};`:`import {createElement} from 'react';export default ({children,prefetch,...props})=>createElement('a',props,children);export const useLinkStatus=()=>({pending:false});`,loader:'js',resolveDir:root}));
}}]});
const css=await postcss([tailwind({base:root})]).process(readFileSync('src/app/globals.css','utf8'),{from:path.join(root,'src/app/globals.css')});
const sheetCss=readFileSync(path.join(output,'fixture.css'),'utf8');
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}\n${sheetCss}</style><body style="padding:16px;background:#faf8f5"><div id="root"></div><script>${readFileSync(path.join(output,'fixture.js'),'utf8').replaceAll('</script','<\\/script')}</script></body></html>`;
writeFileSync(path.join(output,'preview.html'),html);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[],results=[];
try{
 for(const [width,height] of [[360,800],[390,844],[768,1024],[1024,768],[1366,900],[1920,1080]]){
  const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.route('**/*',route=>route.request().url()==='https://synthetic.invalid/'?route.fulfill({contentType:'text/html',body:html}):route.abort());
  await page.goto('https://synthetic.invalid/');
  assert.equal(await page.getByLabel('選擇日期',{exact:true}).count(),0);assert.equal(await page.getByLabel('到店資訊',{exact:true}).count(),0);
  await page.getByLabel('手機',{exact:true}).fill('0900000000');await page.getByLabel('姓名',{exact:true}).fill('合成驗收顧客');await page.getByLabel('技師安排',{exact:true}).selectOption('ANY');
  await page.screenshot({path:path.join(output,`public-step1-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:'下一步：選擇日期與時段',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'查詢可用時段',exact:true}).count(),0);
  const holiday=page.getByRole('button',{name:/-28 公休$/});if(await holiday.count())assert.equal(await holiday.isDisabled(),true);
  await page.locator('[aria-label="選擇日期"] button[aria-pressed]:enabled').first().click();await page.getByRole('button',{name:'14:00',exact:true}).waitFor();assert.equal((await page.evaluate(()=>window.qaPublicReads)).length,1);
  await page.getByRole('button',{name:'14:00',exact:true}).click();await page.screenshot({path:path.join(output,`public-step2-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:'下一步：確認預約',exact:true}).click();await page.getByLabel('到店資訊',{exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'按摩小提醒',exact:true}).isVisible(),true);
  await page.screenshot({path:path.join(output,`public-step3-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:'返回修改日期與時段',exact:true}).click();await page.getByRole('button',{name:'14:00',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'14:00',exact:true}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'返回修改服務與資料',exact:true}).click();assert.equal(await page.getByLabel('姓名',{exact:true}).inputValue(),'合成驗收顧客');
  await page.getByRole('button',{name:'下一步：選擇日期與時段',exact:true}).click();await page.getByRole('button',{name:'14:00',exact:true}).waitFor();await page.getByRole('button',{name:'下一步：確認預約',exact:true}).click();await page.getByRole('button',{name:'確認預約',exact:true}).click();await page.getByLabel('預約成功',{exact:true}).waitFor();assert.equal((await page.evaluate(()=>window.qaPublicSubmitted)).length,1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole('button',{name:'預約詳情預覽',exact:true}).click();await page.getByRole('heading',{name:'預約詳情',exact:true}).waitFor();
  const dlg=page.getByRole('dialog');for(const label of ['✂ 改時間','⧉ 複製預約','關閉'])assert.equal(await dlg.getByRole('button',{name:label,exact:true}).isVisible(),true);
  assert.equal(await dlg.getByPlaceholder('搜尋姓名或手機').count(),0);assert.equal(await dlg.getByText('未留電話',{exact:true}).count(),0);assert.equal(await dlg.getByRole('button',{name:/新增本次備註|編輯本次備註|測試顧客 本次備註/}).count()>0,true);
  await dlg.getByRole('button',{name:'測試顧客 更多操作',exact:true}).click();for(const label of ['顧客資料','購買方案','換技師／位置','取消預約'])assert.equal(await page.getByRole('menuitem',{name:label,exact:true}).isVisible(),true);
  await page.screenshot({path:path.join(output,`roster-single-${width}.png`),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  results.push({width,height,threeSteps:true,autoSlots:true,closedDay:true,returnDraft:true,oneSyntheticSubmission:true,rosterSixColumns:true,wholePageOverflow:false});await page.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(path.join(output,'results.json'),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();}
