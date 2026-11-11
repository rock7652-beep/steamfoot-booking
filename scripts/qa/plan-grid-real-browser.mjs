// Real owner credentials, real application routes and disposable PostgreSQL only.
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {assertSportsLiveFlowQaEnvironment} from '../sports-live-flow-qa-scope.mjs';
assertSportsLiveFlowQaEnvironment(process.env);
const require=createRequire(import.meta.url),{chromium}=require(process.env.QA_PLAYWRIGHT_MODULE),{PrismaClient}=require('@prisma/client'),{PrismaClient:Course}=require('../../generated/course-client'),{PrismaClient:Beauty}=require('../../generated/beauty-client');
const db=new PrismaClient(),course=new Course(),beauty=new Beauty();
const flow=process.argv.includes('--flows'),listsMode=process.argv.includes('--lists');
const out='artifacts/plan-grid-real-acceptance-20261111';mkdirSync(out,{recursive:true});
const stores=[{key:'steam',sid:'ops-steam',slug:'ops-steam',email:'ops-steam@example.invalid',name:'格子驗收十堂方案'},{key:'beauty',sid:'ops-beauty',slug:'ops-beauty',email:'ops-beauty@example.invalid',name:'格子驗收十次方案'},{key:'music',sid:'store-lubymusic',slug:'grid-music',email:'grid-music-owner@example.invalid',name:'格子驗收十堂方案'},{key:'sports',sid:'sports-live-flow-store',slug:'sports-live-flow',email:'sports-owner@example.invalid',name:'格子驗收十堂方案'}].filter(s=>!process.argv[2]||process.argv[2].startsWith('--')||s.key===process.argv[2]);
const report={environment:'actual local application, normal owner login, dedicated loopback PostgreSQL; no mocks or fabricated sessions',deployed:false,productionWrites:false,modules:[],errors:[]};
const save=()=>writeFileSync(out+(listsMode?'/lists.json':flow?'/flows-'+(process.argv[2]?.startsWith('--')?'all':process.argv[2]??'all')+'.json':'/results.json'),JSON.stringify(report,null,2));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});let last;
async function waitFor(check,label){for(let i=0;i<200;i++){if(await check())return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+label);}
function adminPath(s){return '/s/'+s.slug+'/admin/dashboard/'+(s.key==='steam'?'customers':s.key==='beauty'?'beauty?tab='+encodeURIComponent('顧客管理'):'courses?view=customers');}
function plan(s,p){if(s.key==='steam')return p.locator('li').filter({has:p.getByText(s.name,{exact:true})}).first();return p.getByRole('button',{name:new RegExp('^'+s.name)}).first().locator('..');}
async function checkGrid(s,p,expected=0,voided=0){const block=plan(s,p);await block.waitFor();await waitFor(async()=>await block.locator('[data-lesson-slot]').count()===10,'ten slots for '+s.key);assert.match(await block.innerText(),/5,000/);assert.equal(await block.locator('[data-completed="true"]').count(),expected);assert.equal(await block.locator('[data-voided="true"]').count(),voided);return block;}
async function openCustomer(s,p,expected=0,voided=0){const path=adminPath(s),url=path+(path.includes('?')?'&':'?')+'customerId='+s.sid+'-customer';const at=performance.now();await p.goto('http://localhost:3107'+url,{waitUntil:'commit',timeout:180000});await checkGrid(s,p,expected,voided);return Math.round(performance.now()-at);}
async function checkFrontend(s,p,expected=0,voided=0){const url='http://localhost:3107/frontend-preview?'+new URLSearchParams({storeId:s.sid,personId:s.sid+'-customer',role:'member',view:s.key==='beauty'?'cards':'wallets'});await p.goto(url,{waitUntil:'commit',timeout:180000});const block=p.locator('article').filter({has:p.getByText(s.name,{exact:true})}).first();await block.waitFor({timeout:60000});await waitFor(async()=>await block.locator('[data-lesson-slot]').count()===10,'frontend slots '+s.key);assert.match(await block.innerText(),/5,000/);assert.match(await block.innerText(),new RegExp('(?:剩餘|可預約|還可預約)\\s*'+(10-expected-voided)+'\\s*[堂次]'));assert.equal(await block.locator('[data-completed="true"]').count(),expected);assert.equal(await block.locator('[data-voided="true"]').count(),voided);assert.equal(await block.locator('[data-lesson-slot]').first().evaluate(e=>!!e.closest('details')),false);assert.equal(await block.locator('details,summary').count(),0);assert.equal((await block.innerText()).includes('繳費明細'),false);assert.equal((await block.innerText()).includes('可預約課程'),false);await p.screenshot({path:out+'/'+s.key+'-frontend.png',fullPage:true});for(const width of [390,768]){await p.setViewportSize({width,height:900});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(await block.locator('[data-lesson-slot]').count(),10);await p.screenshot({path:out+'/'+s.key+'-frontend-'+width+'.png',fullPage:true});}await p.setViewportSize({width:1366,height:900});return block;}

async function authority(s){const id='grid-real-'+s.key;if(s.key==='steam'){const w=await db.customerPlanWallet.findUniqueOrThrow({where:{id},include:{sessions:true}});return {remaining:w.remainingSessions,price:String(w.purchasedPrice),completed:w.sessions.filter(r=>['COMPLETED','BACKFILLED'].includes(r.status)).length,voided:w.sessions.filter(r=>r.status==='VOIDED').length};}const c=s.key==='beauty'?await beauty.beautyCard.findUniqueOrThrow({where:{id}}):await course.coursePointCard.findUniqueOrThrow({where:{id}});const records=s.key==='beauty'?(await beauty.beautyEvent.findMany({where:{storeId:s.sid,kind:'PLAN_SESSION_ADJUSTMENT'},select:{body:true}})).map(r=>JSON.parse(r.body)).filter(r=>r.cardId===id):(await db.auditLog.findMany({where:{storeId:s.sid,targetId:id,action:'PLAN_SESSION_ADJUSTMENT'},select:{afterJson:true}})).map(r=>r.afterJson.record);const reversed=new Set(records.map(r=>r.reversalOf));const active=records.filter(r=>!reversed.has(r.id));return {remaining:c.remaining,completed:active.filter(r=>r.operation==='BACKFILL').reduce((n,r)=>n+r.quantity,0),voided:active.filter(r=>r.operation==='VOID').reduce((n,r)=>n+r.quantity,0)};}
async function receipts(s){if(s.key==='steam')return JSON.stringify(await db.transaction.findMany({where:{storeId:s.sid,amount:{not:0}},orderBy:{id:'asc'},select:{id:true,amount:true}}));if(s.key==='beauty')return JSON.stringify(await beauty.beautyPayment.findMany({where:{storeId:s.sid},orderBy:{id:'asc'},select:{id:true,amount:true}}));return JSON.stringify(await course.coursePurchase.findMany({where:{storeId:s.sid},orderBy:{id:'asc'},select:{id:true,price:true,status:true}}));}
async function adjust(s,p,operation,date){
 if(s.key==='steam'){
  const b=plan(s,p);
  if(operation==='BACKFILL'){await b.getByRole('button',{name:'補登已上課',exact:true}).click();await b.locator('[name=occurredAt]').fill(date);await b.locator('[name=reason]').fill('隔離環境真實流程驗收');await b.getByRole('button',{name:'確認補登',exact:true}).click();await b.locator('[name=occurredAt]').waitFor({state:'hidden'});}
  else {await b.locator('summary').filter({hasText:'使用明細與註銷'}).click();await b.getByRole('button',{name:'註銷此堂',exact:true}).first().click();await b.locator('textarea').fill('隔離環境真實註銷驗收');await b.getByRole('button',{name:'確認註銷',exact:true}).click();await b.getByRole('button',{name:'確認註銷',exact:true}).waitFor({state:'hidden'});}
  return;
 }
 if(s.key==='beauty'){await p.getByRole('button',{name:new RegExp('^'+s.name)}).first().click();await p.getByRole('button',{name:'調整堂數',exact:true}).click();}
 else await plan(s,p).getByRole('button',{name:operation==='VOID'?'註銷堂數':'補登已上課',exact:true}).click();
 const panel=p.getByRole('region',{name:'調整堂數',exact:true});await panel.waitFor({timeout:20000});
 if(operation==='REVERSE'){await panel.locator('li').filter({hasText:'補登已上課'}).getByRole('button',{name:'更正返還',exact:true}).first().click();}
 else {await panel.getByLabel('調整類型').selectOption(operation);if(operation==='BACKFILL')await panel.getByLabel('實際上課日期').fill(date);}
 await panel.getByLabel('調整原因（選填）').fill('隔離環境真實流程驗收');await panel.getByRole('button',{name:operation==='REVERSE'?'確認更正返還':'確認調整',exact:true}).click();
}
async function verifyState(s,p,result,label,remaining,completed,voided,date){
 await waitFor(async()=> (await authority(s)).remaining===remaining,'committed '+label);
 result.timings.push({scenario:label+'-reopen-route',ms:await openCustomer(s,p,completed,voided)});
 const b=await checkGrid(s,p,completed,voided);if(date)assert.ok((await b.locator('[data-lesson-slot]').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label')))).some(d=>d.includes(date)),label+' exact date');
 assert.match(await b.innerText(),new RegExp('(?:可用|可預約|剩餘)\\s*'+remaining+'\\s*[堂次]'));
 const front=await p.context().newPage();last=front;await checkFrontend(s,front,completed,voided);await front.screenshot({path:out+'/'+s.key+'-'+label+'-frontend.png',fullPage:true});await front.close();last=p;
 await p.screenshot({path:out+'/'+s.key+'-'+label+'-backend.png',fullPage:true});result.checks.push(label+'-database-backend-frontend-dates-and-balance');save();console.log(s.key,label,'passed');
}
async function flows(s,p,result){
 const original=await receipts(s),customer=await db.customer.findUniqueOrThrow({where:{id:s.sid+'-customer'},select:{name:true}});
 for(let i=0;i<(process.argv.includes('--skip-warm')?0:3);i++){await p.getByRole('button',{name:s.key==='steam'?'關閉':'關閉顧客資料',exact:true}).last().click();await p.waitForURL(u=>!u.searchParams.has('customerId'),{timeout:20000});await p.waitForLoadState('networkidle',{timeout:15000}).catch(()=>{});const trigger=p.getByRole('button',{name:customer.name,exact:true}).first();await trigger.waitFor();await trigger.hover();await p.waitForTimeout(400);const at=performance.now();await trigger.click();await checkGrid(s,p,(await authority(s)).completed,(await authority(s)).voided);result.timings.push({scenario:'preloaded-drawer-reopen',ms:Math.round(performance.now()-at)});}
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()-2*86400000));
 if((await authority(s)).remaining===10)await adjust(s,p,'BACKFILL',day);await verifyState(s,p,result,'after-backfill',9,1,0,day);
 await adjust(s,p,'VOID');await verifyState(s,p,result,'after-void',8,1,1,day);
 if(s.key!=='steam'){await adjust(s,p,'REVERSE');await verifyState(s,p,result,'after-correction',9,0,1);}
 else {result.gaps=['Steam manual void/backfill has no correction/refund UI; current action explicitly irreversible'];}
 assert.equal(await receipts(s),original);result.checks.push('original-financial-receipts-unchanged');
 for(const width of [768,390]){await p.setViewportSize({width,height:900});await checkGrid(s,p,s.key==='steam'?1:0,1);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await p.screenshot({path:out+'/'+s.key+'-final-'+width+'.png',fullPage:true});}result.checks.push('ipad-mobile-no-document-overflow');save();
}


async function lists(s,p,result){
 const history=p.getByRole('button',{name:'歷史方案',exact:true});if(await history.count()){await history.click();const current=await authority(s);await checkGrid(s,p,current.completed,current.voided);result.checks.push('history-toggle-preserves-active-plan-and-grid');}
 const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'});
 for(const past of [false,true]){
  const date=fmt.format(new Date(Date.now()+(past?-3:2)*86400000));const url='http://localhost:3107/frontend-preview?'+new URLSearchParams({storeId:s.sid,personId:s.sid+'-customer',role:'member',view:'bookings',date});await p.goto(url,{waitUntil:'commit',timeout:120000});
  if(past&&(s.key==='steam'||s.key==='beauty'))await p.getByRole('button',{name:'歷史紀錄',exact:true}).click();
  const rows=p.locator('[data-customer-booking-row]');await rows.first().waitFor({timeout:30000});assert.ok(await rows.count()>0);assert.equal(await rows.locator(':scope > summary').first().isVisible(),true);assert.equal(await rows.first().getAttribute('open'),null);
  const heights=await rows.locator(':scope > summary').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height));assert.ok(heights.every(h=>h>=44&&h<=90),JSON.stringify(heights));
  await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await p.screenshot({path:out+'/'+s.key+'-bookings-'+(past?'history':'upcoming')+'.png',fullPage:true});await p.setViewportSize({width:1366,height:900});result.checks.push((past?'history':'upcoming')+'-real-booking-compact-list-no-overflow');save();
 }
}

try{
 for(const s of stores){
  const result={module:s.key,checks:[],timings:[]};report.modules.push(result);save();
  const context=await browser.newContext({viewport:{width:1366,height:900}});await context.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
  const p=await context.newPage();last=p;p.setDefaultTimeout(60000);p.on('pageerror',e=>report.errors.push({module:s.key,message:e.message}));
  await p.goto('http://localhost:3107/hq/login?store='+s.slug,{timeout:180000});await p.getByLabel('Email',{exact:true}).fill(s.email);await p.getByLabel('密碼',{exact:true}).fill('isolated-sports-test-only');await p.getByRole('button',{name:'登入',exact:true}).click();await p.waitForURL(u=>!u.pathname.includes('/login'),{timeout:180000});
  const identity=await p.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(s=>({role:s.user?.role,storeId:s.user?.storeId})));assert.deepEqual(identity,{role:'OWNER',storeId:s.sid});result.checks.push('normal-owner-login');save();console.log(s.key,'actual login passed');
  const initial=await authority(s);const cold=await openCustomer(s,p,initial.completed??0,initial.voided??0);result.timings.push({scenario:'first-route-and-plan-ready',ms:cold,includesDevelopmentCompilation:true});result.checks.push('backend-ten-visible-slots-and-purchase-price');await p.screenshot({path:out+'/'+s.key+'-backend.png',fullPage:true});save();console.log(s.key,'backend ready',cold);
  const front=await context.newPage();last=front;await checkFrontend(s,front,initial.completed??0,initial.voided??0);result.checks.push('authorized-owner-member-preview-ten-visible-slots-and-price','plan-grid-always-open-without-duplicate-payment-or-course-sections');save();console.log(s.key,'frontend passed');await front.close();last=p;
  if(flow)await flows(s,p,result);if(listsMode)await lists(s,p,result);
  if(report.errors.length)throw Error('Browser exception: '+report.errors.at(-1).message);
  await context.close();
 }
 report.complete=true;save();console.log('Selected real application checks passed');
}catch(error){report.complete=false;report.failure=String(error);save();if(last){console.log('LAST BODY',(await last.locator('body').innerText().catch(()=>'' )).slice(0,7000));await last.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});}throw error;}
finally{await browser.close();await Promise.all([db.$disconnect(),course.$disconnect(),beauty.$disconnect()]);}
