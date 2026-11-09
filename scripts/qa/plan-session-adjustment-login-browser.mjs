// Actual local login + actions + authoritative DB. Never a hosted or fabricated session.
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {assertSportsLiveFlowQaEnvironment} from '../sports-live-flow-qa-scope.mjs';
assertSportsLiveFlowQaEnvironment(process.env);
const require=createRequire(import.meta.url),{chromium}=require('/opt/codex/cua_node/lib/node_modules/playwright');
const {PrismaClient}=require('@prisma/client'),{PrismaClient:Course}=require('../../generated/course-client'),{PrismaClient:Beauty}=require('../../generated/beauty-client');
const db=new PrismaClient(),course=new Course(),beauty=new Beauty(),out='artifacts/plan-session-adjustment-login-20261030';mkdirSync(out,{recursive:true});
const stores=[{key:'sports',sid:'sports-live-flow-store',slug:'sports-live-flow',email:'sports-owner@example.invalid',card:'session-adjustment-sports-live-flow-store',name:'堂數調整驗收十堂'},{key:'music',sid:'ops-music',slug:'ops-music',email:'ops-music@example.invalid',card:'session-adjustment-ops-music',name:'堂數調整驗收十堂'},{key:'beauty',sid:'ops-beauty',slug:'ops-beauty',email:'ops-beauty@example.invalid',card:'session-adjustment-beauty',name:'堂數調整驗收十次'}];
const results=[],errors=[];let lastPage;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const record=(s,step,detail={})=>{results.push({module:s.key,step,...detail});console.log('PASS',s.key,step);};
async function wait(check,label){for(let n=0;n<150;n++){if(await check())return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out '+label);}
async function snapshot(s){return s.key==='beauty'?{card:await beauty.beautyCard.findUniqueOrThrow({where:{id:s.card}}),payments:await beauty.beautyPayment.findMany({where:{cardId:s.card},orderBy:{id:'asc'}}),bookings:await beauty.beautyAppointment.count({where:{storeId:s.sid}}),events:await beauty.beautyEvent.findMany({where:{storeId:s.sid,kind:'PLAN_SESSION_ADJUSTMENT'},orderBy:{createdAt:'asc'}})}:{card:await course.coursePointCard.findUniqueOrThrow({where:{id:s.card}}),payments:await course.coursePurchase.findMany({where:{cardId:s.card},orderBy:{id:'asc'}}),bookings:await course.courseBooking.count({where:{storeId:s.sid}}),events:await db.auditLog.findMany({where:{storeId:s.sid,targetId:s.card,action:'PLAN_SESSION_ADJUSTMENT'},orderBy:{createdAt:'asc'}})};}
async function panel(page){const p=page.getByRole('region',{name:'調整堂數',exact:true});if(!await p.count())await page.getByRole('button',{name:'調整堂數',exact:true}).click();await p.waitFor();return p;}
try{
  for(const s of stores){
    const context=await browser.newContext({viewport:{width:1366,height:900}});await context.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
    const page=await context.newPage();lastPage=page;page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push({module:s.key,message:e.message}));
    await page.goto('http://localhost:3107/hq/login?store='+s.slug,{timeout:180000});await page.getByLabel('Email',{exact:true}).fill(s.email);await page.getByLabel('密碼',{exact:true}).fill('isolated-sports-test-only');await page.getByRole('button',{name:'登入',exact:true}).click();await page.waitForURL(u=>!u.pathname.includes('/login'),{timeout:180000});
    const identity=await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(s=>({role:s.user?.role,storeId:s.user?.storeId})));assert.deepEqual(identity,{role:'OWNER',storeId:s.sid});record(s,'actual-owner-login');
    const qs=new URLSearchParams({customerId:s.sid+'-customer'});qs.set(s.key==='beauty'?'tab':'view',s.key==='beauty'?'顧客管理':s.key==='music'?'plans':'customers');
    await page.goto('http://localhost:3107/s/'+s.slug+'/admin/dashboard/'+(s.key==='beauty'?'beauty':'courses')+'?'+qs,{waitUntil:'commit',timeout:180000});
    if(s.key==='music')await page.getByRole('button',{name:'顧客持有方案',exact:true}).click();
    await page.getByText(s.name,{exact:true}).first().waitFor();
    if(s.key==='beauty')await page.getByRole('button',{name:new RegExp('^'+s.name)}).click();
    else{const direct=page.getByRole('button',{name:'查看 '+s.name+' 明細',exact:true});if(await direct.count())await direct.click();else{await page.getByRole('button',{name:s.name+' 操作',exact:true}).click();await page.getByRole('button',{name:'查看堂數明細',exact:true}).click();}}
    const original=await snapshot(s),path=new URL(page.url()).pathname;let p=await panel(page);record(s,'existing-plan-panel-entry');
    await p.getByLabel('實際上課日期').fill('2026-01-02');await page.setViewportSize({width:768,height:1024});assert.equal(await p.getByLabel('實際上課日期').inputValue(),'2026-01-02');
    await p.getByRole('button',{name:'確認調整',exact:true}).evaluate(b=>{b.click();b.click();});await wait(async()=>(await snapshot(s)).card.remaining===9,'backfill writes once');
    await page.getByRole('button',{name:'調整堂數',exact:true}).waitFor({state:'visible'});await wait(async()=>await page.getByRole('button',{name:'調整堂數',exact:true}).isEnabled(),'refresh finished');
    p=await panel(page);await p.getByText('實際上課：2026-01-02',{exact:true}).waitFor();assert.equal((await snapshot(s)).events.length,1);record(s,'actual-date-optional-reason-debit-once-ipad');
    await p.getByLabel('調整類型').selectOption('VOID');await p.getByRole('button',{name:'確認調整',exact:true}).click();await wait(async()=>(await snapshot(s)).card.remaining===8,'void unit');
    await wait(async()=>await page.getByRole('button',{name:'調整堂數',exact:true}).isEnabled(),'void refresh');p=await panel(page);record(s,'void-unit-without-closing-plan');
    let li=p.locator('li').filter({hasText:'補登已上課 1'}).first();await li.getByRole('button',{name:'更正返還',exact:true}).click();await p.getByRole('button',{name:'確認更正返還',exact:true}).click();await wait(async()=>(await snapshot(s)).card.remaining===9,'reverse backfill');
    await wait(async()=>await page.getByRole('button',{name:'調整堂數',exact:true}).isEnabled(),'reverse refresh');p=await panel(page);await p.getByText(/補登已上課 1.*（已更正）/).waitFor();
    li=p.locator('li').filter({hasText:'註銷堂數 1'}).first();await li.getByRole('button',{name:'更正返還',exact:true}).click();await p.getByRole('button',{name:'確認更正返還',exact:true}).click();await wait(async()=>(await snapshot(s)).card.remaining===10,'reverse void');record(s,'corrections-refund-once-retain-originals');
    const after=await snapshot(s);assert.deepEqual(after.payments,original.payments);assert.equal(after.bookings,original.bookings);assert.equal(after.card.closedAt,null);assert.equal(after.events.length,4);assert.equal(new URL(page.url()).pathname,path);record(s,'money-schedule-original-history-preserved-same-panel');
    await page.screenshot({path:out+'/'+s.key+'-ipad.png',fullPage:true});await context.close();
  }
  assert.deepEqual(errors,[]);writeFileSync(out+'/results.json',JSON.stringify({complete:true,scope:'actual local credentials and Server Actions; disposable loopback DB; no hosted or physical Safari verification',results,errors},null,2));
}catch(error){writeFileSync(out+'/results.json',JSON.stringify({complete:false,results,errors,error:String(error)},null,2));if(lastPage)await lastPage.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});throw error;}
finally{await browser.close();await db.$disconnect();await course.$disconnect();await beauty.$disconnect();}
