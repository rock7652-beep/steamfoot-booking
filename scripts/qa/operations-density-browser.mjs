// Actual Next routes and actions, guarded local database; no deployed credentials.
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {assertSportsLiveFlowQaEnvironment} from '../sports-live-flow-qa-scope.mjs';
assertSportsLiveFlowQaEnvironment(process.env);
const require=createRequire(import.meta.url),{chromium}=require(process.env.QA_PLAYWRIGHT_MODULE||'playwright');
const {PrismaClient}=require('@prisma/client'),{PrismaClient:CourseClient}=require('../../generated/course-client');
const ExcelJS=require('exceljs');
const ledgerOnly=process.argv.includes('--ledger-only');
const db=new PrismaClient(),course=new CourseClient(),out=ledgerOnly?'/tmp/operations-density-ledger-final':'/tmp/operations-density';mkdirSync(out,{recursive:true});
const results=[],errors=[],base='http://localhost:3107';let browser,page,context;
const stores=['sports-live-flow-store','ops-music','ops-dance','ops-beauty','ops-steam'];
function save(){writeFileSync(out+'/results.json',JSON.stringify({results,errors,realLocalDatabase:true,physicalIPad:false},null,2));}
function record(step,extra={}){results.push({step,...extra,pass:true});save();console.log(JSON.stringify(results.at(-1)));}
async function scope(id){await context.addCookies([{name:'active-store-id',value:id,url:base}]);}
async function open(query=''){await page.goto(base+'/hq/dashboard/revenue'+query,{waitUntil:'domcontentloaded',timeout:180000});await page.waitForLoadState('networkidle',{timeout:30000}).catch(()=>{});assert.equal(await page.getByRole('button',{name:'重試',exact:true}).count(),0,'Error boundary');}
async function poll(read,test){for(let i=0;i<40;i++){const value=await read();if(test(value))return value;await page.waitForTimeout(250);}throw Error('Database result did not persist');}
try {
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});context=await browser.newContext({viewport:{width:1366,height:900}});
 await context.route('**/*',route=>{const url=new URL(route.request().url());return ['localhost','127.0.0.1'].includes(url.hostname)||['data:','blob:'].includes(url.protocol)?route.continue():route.abort();});
 page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+'/hq/login',{waitUntil:'domcontentloaded',timeout:180000});await page.getByLabel('Email',{exact:true}).fill('operations-hq@example.invalid');await page.getByLabel('密碼',{exact:true}).fill('isolated-sports-test-only');await page.getByRole('button',{name:'登入',exact:true}).click();await page.waitForURL(url=>url.pathname.includes('/dashboard'),{timeout:180000});
 const role=await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(s=>s.user?.role));assert.equal(role,'ADMIN');record('actual-hq-login');
 if(!ledgerOnly){await scope('__all__');await open('?area=monthly');await page.getByText('請先選擇店家。',{exact:true}).waitFor();record('hq-monthly-requires-concrete-store');
 for(const [index,storeId] of stores.entries()) {
  await scope(storeId);await open('?area=monthly&month=2026-08');
  const text=await page.locator('main').last().innerText();assert.ok(!text.includes('僅店長可')&&!text.includes('尚未授權')&&!text.includes('尚未開通'));
  record('hq-monthly-module-access',{storeId});
  if(index>2)continue;
  let revisions=await course.courseMonthlySettlement.findMany({where:{storeId,month:'2026-08'}});
  if(!revisions.length){await page.getByRole('button',{name:'確認月結',exact:true}).click();await page.getByText('操作門市：',{exact:false}).last().waitFor();await page.getByRole('button',{name:'確認',exact:true}).click();revisions=await poll(()=>course.courseMonthlySettlement.findMany({where:{storeId,month:'2026-08'}}),rows=>rows.length>0);}
  assert.equal(revisions.length,1);record('hq-confirms-course-monthly',{storeId});
  const sessionId=storeId+'-hq-density-session';let payments=await course.courseFeePayment.findMany({where:{storeId,sessionId,voidedAt:null}});
  if(!payments.length) {
   await open('?area=monthly&month=2026-08');await page.getByRole('button',{name:/(教師|老師|教練)授課費/}).click();await page.getByText('明細 ＋',{exact:true}).first().click();await page.getByRole('button',{name:'登錄已付',exact:true}).click();await page.getByLabel('本次已付金額',{exact:true}).fill('100');await page.getByLabel('付款備註',{exact:true}).fill('HQ 隔離付款驗收');
   await scope(stores[(index+1)%3]);await page.getByRole('button',{name:'確認登錄',exact:true}).click();await page.getByRole('alert').filter({hasText:'目前門市已切換'}).waitFor();assert.equal(await course.courseFeePayment.count({where:{sessionId}}),0);record('hq-stale-store-payment-blocked',{storeId});
   await scope(storeId);await open('?area=monthly&month=2026-08');await page.getByRole('button',{name:/(教師|老師|教練)授課費/}).click();await page.getByText('明細 ＋',{exact:true}).first().click();await page.getByRole('button',{name:'登錄已付',exact:true}).click();await page.getByLabel('本次已付金額',{exact:true}).fill('100');await page.getByLabel('付款備註',{exact:true}).fill('HQ 隔離付款驗收');await page.getByRole('button',{name:'確認登錄',exact:true}).click();payments=await poll(()=>course.courseFeePayment.findMany({where:{storeId,sessionId,voidedAt:null}}),rows=>rows.length>0);
  }
  assert.equal(payments.length,1);assert.equal(payments[0].amount,100);assert.equal(Number((await db.cashbookEntry.findUniqueOrThrow({where:{id:'course-fee:'+payments[0].id}})).amount),100);record('hq-fee-payment-linked-once',{storeId});
 }
 // Shared filters retain their own namespace while dates follow the operational context.
 await scope(stores[0]);await open('?dateFrom=2026-09-01&dateTo=2026-09-30&status=PENDING&kind=plans');await page.getByRole('navigation',{name:'營運頁籤',exact:true}).getByRole('link',{name:'報表匯出',exact:true}).click();await page.getByRole('link',{name:'資料匯出',exact:true}).click();
 const types=page.getByLabel('匯出類型',{exact:true});await types.waitFor();const values=await types.locator('option').evaluateAll(options=>options.map(o=>o.value));const type=values.find(value=>value!=='customers');await types.selectOption(type);await page.getByRole('button',{name:'自訂期間',exact:true}).click();await page.getByLabel('開始日期',{exact:true}).fill('2026-09-02');
 await page.getByRole('navigation',{name:'營運頁籤',exact:true}).getByRole('link',{name:'營收明細',exact:true}).click();await page.waitForURL(url=>url.searchParams.get('status')==='PENDING');assert.equal(new URL(page.url()).searchParams.get('dateFrom'),'2026-09-02');
 await page.getByRole('navigation',{name:'營運頁籤',exact:true}).getByRole('link',{name:'報表匯出',exact:true}).click();await types.waitFor();assert.equal(await types.inputValue(),type);assert.ok((await page.getByLabel('匯出範圍').innerText()).includes('2026-09-02'));record('ledger-export-filter-roundtrip');}
 for(const storeId of stores) {
  await scope(storeId);
  for(const [width,height] of [[1366,900],[1024,768],[768,1024]])for(const [area,query] of (ledgerOnly?[['ledger','']]:[['ledger',''],['report','?area=exports'],['data','?area=exports&reportView=data']])) {
   await page.setViewportSize({width,height});await open(query);await page.getByRole('navigation',{name:'營運頁籤',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,storeId+' '+area+' '+width+' overflow');
   const periodControls=await page.locator('[aria-label="營運期間"] a').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));assert.ok(periodControls.every(height=>height>=43));
   const controls=await page.locator('main input:not([type=hidden]), main select').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().height>0).map(n=>({height:n.getBoundingClientRect().height,label:n.getAttribute('aria-label')??n.name})));assert.ok(controls.every(control=>control.height>=43),JSON.stringify(controls));
   if(area==='data')assert.ok((await page.getByLabel('匯出範圍').innerText()).length>0);
   await page.screenshot({path:`${out}/${storeId}-${area}-${width}.png`,fullPage:true});record('responsive-toolbar',{storeId,area,width,height});
   if(area==='data'&&width===1366){
    const select=page.getByLabel('匯出類型',{exact:true});const options=await select.locator('option').evaluateAll(options=>options.map(o=>o.value));const exportType=options.find(value=>value!=='customers');await select.selectOption(exportType);
    const requestPromise=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/data-export');const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'匯出 Excel',exact:true}).click();const request=await requestPromise,download=await downloadPromise;assert.equal(new URL(request.url()).searchParams.get('type'),exportType);assert.equal(await download.failure(),null);const file=out+'/'+storeId+'-export.xlsx';await download.saveAs(file);const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(file);assert.ok(workbook.worksheets.length>0);record('actual-export-download',{storeId,exportType,worksheets:workbook.worksheets.length});
   }
  }
 }
 assert.equal(errors.length,0);record('complete',{checks:results.length,browserErrors:0});
} catch(error) {errors.push(error.message);save();console.error(error.message);if(page){await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});writeFileSync(out+'/failure.txt',await page.locator('body').innerText().catch(()=>''));}process.exitCode=1;}
finally {await browser?.close();await db.$disconnect();await course.$disconnect();}
