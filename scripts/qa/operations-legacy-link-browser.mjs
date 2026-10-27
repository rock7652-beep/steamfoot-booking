// Actual login and server routes against the guarded disposable PostgreSQL database.
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {assertSportsLiveFlowQaEnvironment} from '../sports-live-flow-qa-scope.mjs';
assertSportsLiveFlowQaEnvironment(process.env);
const require=createRequire(import.meta.url),{chromium}=require(process.env.QA_PLAYWRIGHT_MODULE||'playwright');
const {PrismaClient}=require('@prisma/client'),{PrismaClient:CourseClient}=require('../../generated/course-client'),{PrismaClient:BeautyClient}=require('../../generated/beauty-client');
const db=new PrismaClient(),course=new CourseClient(),beauty=new BeautyClient();
const base='http://localhost:3107',out='/tmp/operations-integration/legacy';mkdirSync(out,{recursive:true});
const results=[],errors=[],external=[];let browser,currentPage;
const stores=['sports','music','dance','beauty','steam'];
const config=key=>({key,storeId:key==='sports'?'sports-live-flow-store':'ops-'+key,slug:key==='sports'?'sports-live-flow':'ops-'+key,email:key==='sports'?'sports-owner@example.invalid':'ops-'+key+'@example.invalid'});
function persist(complete=false){writeFileSync(out+'/results.json',JSON.stringify({complete,scope:'real local login, actual Next routes, disposable PostgreSQL; no production data',realDatabase:true,physicalIPad:false,results,errors,externalRequestsBlocked:external.length},null,2));}
async function open(page,url){await page.goto(url,{waitUntil:'domcontentloaded',timeout:180000});await Promise.race([page.getByRole('navigation',{name:'營運頁籤',exact:true}).waitFor({timeout:180000}),page.getByRole('button',{name:'重試',exact:true}).waitFor({timeout:180000}).then(()=>{throw Error('Dashboard entered its error boundary');})]);await page.waitForLoadState('networkidle',{timeout:30000}).catch(()=>{});}
async function login(store){
 const context=await browser.newContext({viewport:{width:1366,height:900}});
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(['localhost','127.0.0.1'].includes(url.hostname)||['data:','blob:'].includes(url.protocol))return route.continue();external.push(url.origin);return route.abort();});
 const page=await context.newPage();currentPage=page;page.setDefaultTimeout(45000);
 page.on('pageerror',error=>{errors.push({store:store.key,message:error.message,stack:error.stack});persist();});
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
 const store=config('sports'),{page,context,dashboard}=await login(store);
 await open(page,dashboard+'/revenue?area=monthly');
 await open(page,dashboard+'/cashbook?month=2026-10');
 await page.goto(dashboard+'/cash-drawer',{waitUntil:'domcontentloaded',timeout:180000});
 await page.getByRole('link',{name:'查看收支明細',exact:true}).click();
 await page.getByRole('navigation',{name:'營運頁籤',exact:true}).waitFor();
 assert.equal(new URL(page.url()).pathname,'/s/'+store.slug+'/admin/dashboard/revenue');
 await page.waitForTimeout(1500);
 await page.screenshot({path:out+'/legacy-redirect.png',fullPage:true});
 assert.equal(errors.length,0,JSON.stringify(errors));persist(true);await context.close();console.log('Legacy route passed');
}catch(error){errors.push({message:error.message});persist();console.error(error.message);process.exitCode=1;}finally{await browser?.close();await db.$disconnect();await course.$disconnect();await beauty.$disconnect();}
