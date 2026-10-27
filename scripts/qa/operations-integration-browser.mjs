// Actual login and server routes against the guarded disposable PostgreSQL database.
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {assertSportsLiveFlowQaEnvironment} from '../sports-live-flow-qa-scope.mjs';
assertSportsLiveFlowQaEnvironment(process.env);
const require=createRequire(import.meta.url),{chromium}=require(process.env.QA_PLAYWRIGHT_MODULE||'playwright');
const {PrismaClient}=require('@prisma/client'),{PrismaClient:CourseClient}=require('../../generated/course-client'),{PrismaClient:BeautyClient}=require('../../generated/beauty-client');
const db=new PrismaClient(),course=new CourseClient(),beauty=new BeautyClient();
const base='http://localhost:3107',out='/tmp/operations-integration';mkdirSync(out,{recursive:true});
const results=[],errors=[],external=[];let browser,currentPage;
const stores=['sports','music','dance','beauty','steam'];
const config=key=>({key,storeId:key==='sports'?'sports-live-flow-store':'ops-'+key,slug:key==='sports'?'sports-live-flow':'ops-'+key,email:key==='sports'?'sports-owner@example.invalid':'ops-'+key+'@example.invalid'});
function persist(complete=false){writeFileSync(out+'/results.json',JSON.stringify({complete,scope:'real local login, actual Next routes, disposable PostgreSQL; no production data',realDatabase:true,physicalIPad:false,results,errors,externalRequestsBlocked:external.length},null,2));}
async function open(page,url){await page.goto(url,{waitUntil:'domcontentloaded',timeout:180000});await Promise.race([page.getByRole('navigation',{name:'營運頁籤',exact:true}).waitFor({timeout:180000}),page.getByRole('button',{name:'重試',exact:true}).waitFor({timeout:180000}).then(()=>{throw Error('Dashboard entered its error boundary');})]);await page.waitForLoadState('networkidle',{timeout:30000}).catch(()=>{});}
async function login(store){
 const context=await browser.newContext({viewport:{width:1366,height:900}});
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(['localhost','127.0.0.1'].includes(url.hostname)||['data:','blob:'].includes(url.protocol))return route.continue();external.push(url.origin);return route.abort();});
 const page=await context.newPage();currentPage=page;page.setDefaultTimeout(45000);
 page.on('pageerror',error=>{errors.push({store:store.key,message:error.message});persist();});
 await page.goto(base+'/hq/login?store='+store.slug,{waitUntil:'domcontentloaded',timeout:180000});
 await page.getByLabel('Email',{exact:true}).fill(store.email);await page.getByLabel('密碼',{exact:true}).fill('isolated-sports-test-only');await page.getByRole('button',{name:'登入',exact:true}).click();
 await page.waitForURL(url=>url.pathname.includes('/dashboard'),{timeout:180000});
 const identity=await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(session=>({role:session.user?.role,storeId:session.user?.storeId})));
 assert.equal(identity.storeId,store.storeId);assert.equal(identity.role,'OWNER');
 results.push({store:store.key,step:'actual-login',pass:true});persist();console.log(JSON.stringify(results.at(-1)));
 return {page,context,dashboard:base+'/s/'+store.slug+'/admin/dashboard'};
}
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const key of stores){
  const store=config(key),{page,context,dashboard}=await login(store);
  for(const [label,area] of [['營收明細','ledger'],['收入分類','income'],['現金帳','cashbook'],['月結管理','monthly'],['報表匯出','exports']]){
   await open(page,dashboard+'/revenue'+(area==='ledger'?'':'?area='+area));
   const nav=page.getByRole('navigation',{name:'營運頁籤',exact:true});
   assert.deepEqual(await nav.getByRole('link').allTextContents(),['營收明細','收入分類','現金帳','月結管理','報表匯出']);
   assert.equal(await nav.getByRole('link',{name:label,exact:true}).getAttribute('aria-current'),'page');
   assert.equal(await page.getByText('更多工具',{exact:true}).count(),0);
   if(area==='income')assert.equal(await page.getByRole('heading',{name:'技師服務費',exact:true}).count(),0);
   if(area==='ledger')assert.equal(await page.getByRole('heading',{name:'技師拆帳月結',exact:true}).count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   await page.screenshot({path:out+'/'+key+'-'+area+'-1366.png',fullPage:true});
   results.push({store:key,step:area,pass:true,urlPath:new URL(page.url()).pathname});persist();console.log(JSON.stringify(results.at(-1)));
  }
  await context.close();
 }
 assert.equal(errors.length,0,'Browser errors present');persist(true);console.log(JSON.stringify({complete:true,checks:results.length,errors:errors.length}));
}catch(error){errors.push({message:error.message});persist();if(currentPage&&!currentPage.isClosed()){await currentPage.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});writeFileSync(out+'/failure.txt',await currentPage.locator('body').innerText().catch(()=>''));}console.error(error.message);process.exitCode=1;}finally{await browser?.close();await db.$disconnect();await course.$disconnect();await beauty.$disconnect();}
