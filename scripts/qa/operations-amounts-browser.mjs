// Actual login and server routes against the guarded disposable PostgreSQL database.
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {assertSportsLiveFlowQaEnvironment} from '../sports-live-flow-qa-scope.mjs';
assertSportsLiveFlowQaEnvironment(process.env);
const require=createRequire(import.meta.url),{chromium}=require(process.env.QA_PLAYWRIGHT_MODULE||'playwright');
const {PrismaClient}=require('@prisma/client'),{PrismaClient:CourseClient}=require('../../generated/course-client'),{PrismaClient:BeautyClient}=require('../../generated/beauty-client');
const db=new PrismaClient(),course=new CourseClient(),beauty=new BeautyClient();
const base='http://localhost:3107',out='/tmp/operations-integration/amounts';mkdirSync(out,{recursive:true});
const results=[],errors=[],external=[];let browser;
const stores=['sports','music','dance','beauty','steam'];
const config=key=>({key,storeId:key==='sports'?'sports-live-flow-store':'ops-'+key,slug:key==='sports'?'sports-live-flow':'ops-'+key,email:key==='sports'?'sports-owner@example.invalid':'ops-'+key+'@example.invalid'});
function persist(complete=false){writeFileSync(out+'/results.json',JSON.stringify({complete,scope:'real local login, actual Next routes, disposable PostgreSQL; no production data',realDatabase:true,physicalIPad:false,results,errors,externalRequestsBlocked:external.length},null,2));}
async function open(page,url){await page.goto(url,{waitUntil:'domcontentloaded',timeout:180000});await Promise.race([page.getByRole('navigation',{name:'營運頁籤',exact:true}).waitFor({timeout:180000}),page.getByRole('button',{name:'重試',exact:true}).waitFor({timeout:180000}).then(()=>{throw Error('Dashboard entered its error boundary');})]);await page.waitForLoadState('networkidle',{timeout:30000}).catch(()=>{});}
async function login(store){
 const context=await browser.newContext({viewport:{width:1366,height:900}});
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(['localhost','127.0.0.1'].includes(url.hostname)||['data:','blob:'].includes(url.protocol))return route.continue();external.push(url.origin);return route.abort();});
 const page=await context.newPage();page.setDefaultTimeout(45000);
 page.on('pageerror',error=>{errors.push({store:store.key,message:error.message});persist();});
 await page.goto(base+'/hq/login?store='+store.slug,{waitUntil:'domcontentloaded',timeout:180000});
 await page.getByLabel('Email',{exact:true}).fill(store.email);await page.getByLabel('密碼',{exact:true}).fill('isolated-sports-test-only');await page.getByRole('button',{name:'登入',exact:true}).click();
 await page.waitForURL(url=>url.pathname.includes('/dashboard'),{timeout:180000});
 const identity=await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(session=>({role:session.user?.role,storeId:session.user?.storeId})));
 assert.equal(identity.storeId,store.storeId);assert.equal(identity.role,'OWNER');
 results.push({store:store.key,step:'actual-login',pass:true});persist();console.log(JSON.stringify(results.at(-1)));
 return {page,context,dashboard:base+'/s/'+store.slug+'/admin/dashboard'};
}

const ExcelJS=require('exceljs');
function sum(sheet,header){assert.ok(sheet,'Missing worksheet');const index=sheet.getRow(1).values.indexOf(header);assert.ok(index>0,'Missing amount column '+header);let total=0;for(let row=2;row<=sheet.rowCount;row++)total+=Number(sheet.getRow(row).getCell(index).value??0);return total;}
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const expected={sports:5100,music:5100,dance:5100,beauty:3400,steam:1100};
 for(const key of stores){const store=config(key),{page,context,dashboard}=await login(store);await open(page,dashboard+'/revenue');
  const text=await page.locator('[aria-label="營運摘要"]').locator('span').filter({hasText:/^淨收款/}).locator('strong').innerText();const net=Number(text.replace(/[^0-9.-]/g,''));assert.equal(net,expected[key],key+' net receipt mismatch');
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile('/tmp/operations-integration/writes/'+key+'-transactions.xlsx');
  let exported;
  if(['sports','music','dance'].includes(key)){const receipts=sum(workbook.getWorksheet('體驗收款'),'實收'),purchases=sum(workbook.getWorksheet('購買登錄'),'累計實收'),refunds=sum(workbook.getWorksheet('退款發生'),'退款金額');assert.equal(receipts,500);assert.equal(purchases,5000);assert.equal(refunds,400);exported=purchases+receipts-refunds;assert.equal(exported,net);}
  else if(key==='beauty'){exported=sum(workbook.getWorksheet('收退款發生'),'金額（退款為負）');assert.equal(exported,net);}
  else {exported=sum(workbook.worksheets[0],'實收金額');assert.equal(exported+100,net,'Steam manual income is explicitly separate from transaction export');}
  results.push({store:key,step:'screen-and-excel-amounts',pass:true,screenNet:net,transactionExportNet:exported,manualIncomeIncludedInScreen:key==='steam'?100:0});persist();console.log(JSON.stringify(results.at(-1)));await page.screenshot({path:out+'/'+key+'-final-net.png',fullPage:true});await context.close();
 }
 assert.equal(errors.length,0);persist(true);console.log('All five screen and workbook amounts verified');
}catch(error){errors.push({message:error.message});persist();console.error(error.message);process.exitCode=1;}finally{await browser?.close();await db.$disconnect();await course.$disconnect();await beauty.$disconnect();}
