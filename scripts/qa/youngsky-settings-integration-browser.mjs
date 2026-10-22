// Real credentials -> actual Next route -> disposable loopback PostgreSQL -> UI.
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {assertSportsLiveFlowQaEnvironment} from '../sports-live-flow-qa-scope.mjs';
assertSportsLiveFlowQaEnvironment(process.env);
const require=createRequire(import.meta.url),{chromium}=require(process.env.QA_PLAYWRIGHT_MODULE || 'playwright');
const {PrismaClient}=require('@prisma/client'),{PrismaClient:CourseClient}=require('../../generated/course-client');
const db=new PrismaClient(),course=new CourseClient();
const base='http://localhost:3107',dashboard=base+'/s/sports-live-flow/admin/dashboard',storeId='sports-live-flow-store';
const out=path.resolve('artifacts/youngsky-settings-integration-20261021');mkdirSync(out,{recursive:true});
const readsOnly=process.argv.includes('--reads-only');
const results=[],external=[];let browser,page;
const cases=[
 {id:'store',section:'store',title:'店家資料',form:'編輯店家資料',field:'店家名稱',value:r=>`YoungSky 隔離測試 R${r}`},
 {id:'booking',section:'booking',title:'預約與取消截止',form:'編輯預約截止規則',field:'預約截止時間',value:r=>String(r+2)},
 {id:'payment',section:'payment',title:'銀行轉帳資訊',form:'編輯銀行資訊',field:'銀行名稱',value:r=>`隔離銀行 R${r}`},
 {id:'waitlist',section:'booking',title:'候補',field:'候補名額',value:r=>String(r+4)},
 {id:'trial',section:'payment',title:'體驗設定',form:'體驗設定',field:'預設體驗價格（NT$）',value:r=>String(300+r*10)},
];
function persist(complete=false){writeFileSync(path.join(out,readsOnly?'read-results.json':'results.json'),JSON.stringify({complete,scope:'real login, real Next API and disposable PostgreSQL; no production data',developmentBuild:true,physicalIPad:false,safari:false,results,externalRequestsBlocked:external.length},null,2))}
async function verify(item,value){
 if(item.id==='store')assert.equal((await db.store.findUniqueOrThrow({where:{id:storeId}})).name,value);
 if(item.id==='booking')assert.equal((await course.courseBookingRule.findUniqueOrThrow({where:{storeId}})).bookingLeadMinutes,Number(value)*60);
 if(item.id==='payment')assert.equal((await db.shopConfig.findUniqueOrThrow({where:{storeId}})).bankName,value);
 if(item.id==='waitlist')assert.equal((await course.courseWaitlistSetting.findUniqueOrThrow({where:{storeId}})).defaultLimit,Number(value));
 if(item.id==='trial')assert.equal(Number((await db.shopConfig.findUniqueOrThrow({where:{storeId}})).trialDefaultPrice),Number(value));
}
async function edit(page,item,round,label='normal',blocked){
 console.log(`Real integration ${label}/${round}/${item.id}`);
 const navStart=performance.now();
 await page.goto(dashboard+`/courses?view=settings&section=${item.section}`,{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForLoadState('networkidle',{timeout:30000});
 const row=page.locator('section').filter({has:page.getByRole('heading',{name:item.title,exact:true})}).last();
 const modify=row.getByRole('button',{name:'修改',exact:true});
 await modify.evaluate(el=>new Promise(resolve=>{const check=()=>Object.keys(el).some(key=>key.startsWith('__reactProps$'))?resolve(true):requestAnimationFrame(check);check()}));
 await modify.click();
 const pageReadyMs=Math.round(performance.now()-navStart);
 const form=item.form?page.getByRole('form',{name:item.form,exact:true}):row;
 const field=form.getByLabel(item.field,{exact:true});let value=item.value(round);
 if(await field.inputValue()===value)value=['store','payment'].includes(item.id)?value+' 新':String(Number(value)+1);
 await field.fill(value);
 await field.evaluate(el=>{
   globalThis.__settingsUi={};const state=globalThis.__settingsUi;
   new MutationObserver(()=>{if(el.closest('[hidden]')&&state.closedAt===undefined)state.closedAt=performance.now()}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['hidden']});
 });
 const save=form.locator(item.id==='waitlist'?'button':'button[type=submit]');
 if(blocked)await blocked.acquire();
 const responsePromise=page.waitForResponse(r=>r.url().includes('/settings-save/')&&r.request().method()==='POST',{timeout:180000});
 await page.evaluate(()=>globalThis.__settingsUi.startedAt=performance.now());
 const clicked=performance.now();await save.click();
 if(blocked){
   if(blocked.waitForWaiter)await blocked.waitForWaiter();
   await page.waitForTimeout(3300);
   assert.equal(await field.isVisible(),true);assert.equal(await save.isDisabled(),true);
   await blocked.release();
 }
 const response=await responsePromise,body=await response.json();
 assert.equal(body.success,true,JSON.stringify({setting:item.id,status:response.status(),error:body.error}));
 await field.waitFor({state:'hidden',timeout:30000});await verify(item,value);
 await response.finished();
 const headers=await response.allHeaders(),timing=response.request().timing();
 const server={};for(const segment of (headers['server-timing']||'').split(',')){const match=segment.trim().match(/^([^;]+);dur=([\d.]+)/);if(match)server[match[1]]=Number(match[2]);}
 assert.ok(server.handler!==undefined,'Missing server timing');
 const ui=await page.evaluate(()=>globalThis.__settingsUi);
 const result={setting:item.id,round,scenario:label,pageReadyMs,httpMs:Math.round(timing.responseEnd-timing.requestStart),clickToVerifiedMs:Math.round(performance.now()-clicked),clickToCollapseMs:Math.round(ui.closedAt-ui.startedAt),server,traceId:headers['x-settings-trace'],status:response.status(),persisted:true,collapsed:true};
 results.push(result);persist();console.log(JSON.stringify(result));
 if(round===1)await page.screenshot({path:path.join(out,`real-${item.id}.png`),fullPage:true});
}
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:1366,height:900}});page=await context.newPage();page.setDefaultTimeout(60000);
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(['localhost','127.0.0.1'].includes(u.hostname))return route.continue();external.push(u.hostname);return route.abort()});
 const started=performance.now();
 await page.goto(base+'/hq/login?store=sports-live-flow',{timeout:180000,waitUntil:'domcontentloaded'});
 await page.getByLabel('Email',{exact:true}).fill('sports-owner@example.invalid');await page.getByLabel('密碼',{exact:true}).fill('isolated-sports-test-only');
 await page.getByRole('button',{name:'登入',exact:true}).click();await page.waitForURL(url=>url.pathname.includes('/dashboard'),{timeout:180000});
 console.log(JSON.stringify({login:true,loginAndInitialCompilationMs:Math.round(performance.now()-started)}));
 if(readsOnly){
   for(const section of ['store','booking','payment']){
     const requests=[];const listener=request=>{if(request.method()==='GET'&&new URL(request.url()).pathname.endsWith('/dashboard/courses'))requests.push(request.url())};page.on('request',listener);
     const start=performance.now();await page.goto(dashboard+`/courses?view=settings&section=${section}`,{waitUntil:'domcontentloaded',timeout:180000});
     await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(el=>el.textContent==='修改'&&Object.keys(el).some(key=>key.startsWith('__reactProps$'))));
     await page.waitForLoadState('networkidle',{timeout:30000});
     const navigation=await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0];return {ttfbMs:Math.round(n.responseStart-n.requestStart),documentMs:Math.round(n.responseEnd-n.requestStart)}});
     const result={section,...navigation,readyMs:Math.round(performance.now()-start),courseRequests:requests.length};results.push(result);persist();console.log(JSON.stringify(result));page.off('request',listener);
   }persist(true);
 } else {
 for(let round=1;round<=3;round++)for(const item of cases)await edit(page,item,round);
 // Cause an actual competing PostgreSQL row lock, never a mocked HTTP delay.
 let unlock,locked;const lockReady=new Promise(resolve=>{locked=resolve});
 let lockDone;
 await edit(page,cases[1],4,'controlled-real-row-lock',{
   acquire:()=>{lockDone=db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;locked();await new Promise(resolve=>{unlock=resolve});},{timeout:20000});return lockReady},
   waitForWaiter:async()=>{for(let attempt=0;attempt<100;attempt++){const waiting=await db.$queryRaw`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname='sports_live_flow_test' AND wait_event_type='Lock'`;if(waiting[0].n>0)return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('No real PostgreSQL waiter observed')},
   release:async()=>{unlock();await lockDone},
 });
 assert.ok(results.at(-1).server.db_lock>=3000,'Controlled lock not visible in db_lock stage');
 persist(true);console.log(`Real integration complete: ${results.length} saves; ${out}`);
 }
}catch(error){persist();if(page){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});writeFileSync(path.join(out,'failure-text.txt'),await page.locator('body').innerText().catch(()=>''));}console.error(error);process.exitCode=1}
finally{await browser?.close();await db.$disconnect();await course.$disconnect()}
