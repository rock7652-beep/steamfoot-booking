// Actual first-open acceptance: no hovered row, fresh browser, normal owner login.
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {assertSportsLiveFlowQaEnvironment} from '../sports-live-flow-qa-scope.mjs';
assertSportsLiveFlowQaEnvironment(process.env);
const require=createRequire(import.meta.url),{PrismaClient}=require('@prisma/client'),{PrismaClient:Course}=require('../../generated/course-client'),{PrismaClient:Beauty}=require('../../generated/beauty-client'),{chromium}=require(process.env.QA_PLAYWRIGHT_MODULE);
const db=new PrismaClient(),course=new Course(),beauty=new Beauty(),run=Date.now(),base='http://localhost:3107',out='artifacts/customer-plan-first-open-20261111';mkdirSync(out,{recursive:true});
const stores=[{key:'music',sid:'store-lubymusic',slug:'grid-music',email:'grid-music-owner@example.invalid'},{key:'sports',sid:'sports-live-flow-store',slug:'sports-live-flow',email:'sports-owner@example.invalid'},{key:'beauty',sid:'ops-beauty',slug:'ops-beauty',email:'ops-beauty@example.invalid'},{key:'steam',sid:'ops-steam',slug:'ops-steam',email:'ops-steam@example.invalid'}].filter(s=>!process.argv[2]||process.argv[2].split(',').includes(s.key));
const report={environment:'actual local app and disposable loopback PostgreSQL, fresh authenticated browser per module, no network mocks',deployed:false,productionWrites:false,modules:[],errors:[]};
const save=()=>writeFileSync(out+'/results'+(process.argv[2]?'-'+process.argv[2]:'')+'.json',JSON.stringify(report,null,2));
const wait=async(check,label)=>{for(let i=0;i<1200;i++){if(await check())return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out '+label);};
let browser,last;
const source=await db.customerPlanWallet.findUniqueOrThrow({where:{id:'grid-real-steam'}});
async function fixtures(s){const rows=[];const actor=s.key==='sports'?'sports-live-flow-owner':s.sid+'-owner',staff=s.key==='sports'?'sports-live-flow-staff':s.sid+'-staff';
 for(let i=0;i<8;i++){const id='qa-first-'+s.key+'-'+run+'-'+i,name='預讀驗收 '+s.key+' '+run+' '+i;await db.customer.create({data:{id,storeId:s.sid,name,assignedStaffId:staff,phone:'09008800'+String(i).padStart(2,'0')}});const cards=[];
  for(const history of [false,true]){const cardId=id+(history?'-history':'-active'),title=(history?'歷史預讀方案 ':'有效預讀方案 ')+s.key+' '+run+' '+i,expiresAt=history?source.startDate:source.expiryDate;
   if(s.key==='steam'){const plan=await db.servicePlan.create({data:{id:cardId,storeId:s.sid,name:title,category:'PACKAGE',price:4000,sessionCount:10}});await db.customerPlanWallet.create({data:{id:cardId,storeId:s.sid,customerId:id,planId:plan.id,purchasedPrice:4000,totalSessions:10,remainingSessions:10,status:history?'EXPIRED':'ACTIVE',startDate:source.startDate,createdAt:source.startDate,expiryDate:expiresAt,sessions:{create:Array.from({length:10},(_,n)=>({sessionNo:n+1}))}}});}
   else if(s.key==='beauty'){await beauty.beautyCard.create({data:{id:cardId,storeId:s.sid,customerId:id,memberIds:[id],planId:'grid-real-beauty',name:title,sessions:10,remaining:10,listPrice:4000,paid:4000,serviceIds:[s.sid+'-service'],allowShared:false,createdAt:source.startDate,expiresAt}});await beauty.beautyLedger.create({data:{storeId:s.sid,cardId,kind:'PURCHASE',delta:10,actorUserId:actor}});}
   else {await course.coursePointCard.create({data:{id:cardId,storeId:s.sid,planId:s.sid+'-plan',nameSnapshot:title,unit:'SESSION',remaining:10,templateIds:[s.sid+'-template'],requestKey:cardId,expiresAt,createdAt:source.startDate,musicTermSizes:s.key==='music'?[10]:[],members:{create:{customerId:id}}}});await course.coursePointEntry.create({data:{storeId:s.sid,cardId,kind:'GRANT',points:10,actorUserId:actor}});await course.coursePurchase.create({data:{id:cardId,storeId:s.sid,customerId:id,planId:s.sid+'-plan',cardId,name:title,unit:'SESSION',points:10,price:4000,validDays:60,templateIds:[s.sid+'-template'],status:'CONFIRMED',transferLastFive:'',confirmedAt:source.startDate,createdAt:source.startDate,requestKey:cardId}});}
   cards.push({id:cardId,name:title,history});
  }rows.push({id,name,cards});
 }return rows;
}
const route=s=>base+'/s/'+s.slug+'/admin/dashboard/'+(s.key==='steam'?'customers':s.key==='beauty'?'beauty?tab='+encodeURIComponent('顧客管理'):'courses?view=customers');
function plan(p,s,name){return s.key==='steam'?p.locator('li').filter({has:p.getByText(name,{exact:true})}).first():p.getByRole('button',{name:new RegExp('^'+name)}).first().locator('..');}
async function grid(p,s,name){const b=plan(p,s,name);await b.waitFor();await wait(async()=>await b.locator('[data-lesson-slot]').count()===10,'ten visible dates '+name);assert.match(await b.innerText(),/4,000/);assert.equal(await b.locator('[data-lesson-slot]').first().evaluate(e=>!!e.closest('details')),false);return b;}
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const s of stores){const own=await fixtures(s),r={module:s.key,checks:[],timings:[]};report.modules.push(r);save();const context=await browser.newContext({viewport:{width:1366,height:900}});await context.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());const p=await context.newPage();last=p;p.setDefaultTimeout(60000);p.on('pageerror',e=>report.errors.push({module:s.key,message:e.message}));
  const reads=[],ready=new Set();let steamAction='';
  const describe=req=>{const url=new URL(req.url());try{if(url.pathname.endsWith('/card-read')){const a=JSON.parse(url.searchParams.get('args'));return {kind:'cards',id:a.customerId,history:a.history};}if(url.pathname.endsWith('/card-progress-read')){const a=JSON.parse(url.searchParams.get('args'));return {kind:'progress',id:a.customerId,card:a.cardId};}if(url.pathname==='/api/beauty/customer-read'){const a=JSON.parse(req.postData()??'{}');if(a.operation==='cards')return {kind:'cards',id:a.input?.customerId,history:a.input?.history};if(a.operation==='progress')return {kind:'progress',id:a.input?.customerId,card:a.input?.cardId};}if(req.headers()['next-action']){const a=JSON.parse(req.postData()??'[]');if(typeof a[0]==='string')return {kind:'action',id:a[0],action:req.headers()['next-action']};}}catch{}return null;};
  p.on('request',req=>{const d=describe(req);if(d)reads.push({...d,at:Date.now()});});
  p.on('response',async response=>{const d=describe(response.request());if(!d||!own.some(row=>row.id===d.id))return;try{if(d.kind==='action'){const body=await response.text();if(body.includes('"planWallets"')){steamAction=d.action;ready.add(d.id+':detail');}}else{const body=await response.json();if(body.success)ready.add(d.id+(d.kind==='cards'?':cards:'+!!d.history:':progress:'+d.card));}}catch{}});
  await p.goto(base+'/hq/login?store='+s.slug,{timeout:120000});await p.getByLabel('Email',{exact:true}).fill(s.email);await p.getByLabel('密碼',{exact:true}).fill('isolated-sports-test-only');await p.getByRole('button',{name:'登入',exact:true}).click();await p.waitForURL(u=>!u.pathname.includes('/login'),{timeout:120000});await p.goto(route(s),{timeout:120000});
  await p.getByRole('button',{name:own[0].name,exact:true}).waitFor();const visible=[];for(const row of own){const b=p.getByRole('button',{name:row.name,exact:true});if(await b.count())visible.push({...row,rowIndex:await b.evaluate(e=>e.closest('tr')?.rowIndex??-1)});}visible.sort((a,b)=>a.rowIndex-b.rowIndex);const target=visible.at(-1);assert.ok(target?.rowIndex>5,JSON.stringify(visible.map(v=>v.rowIndex)));r.targetRow=target.rowIndex;
  const prepared=()=>s.key==='steam'?ready.has(target.id+':detail'):ready.has(target.id+':cards:false')&&ready.has(target.id+':cards:true')&&target.cards.every(c=>ready.has(target.id+':progress:'+c.id));
  await wait(async()=>prepared(),'background preload beyond first five');r.checks.push('active-and-history-data-prefetched-before-any-customer-hover-or-open');
  const planRead=d=>d.id===target.id&&(d.kind==='cards'||d.kind==='progress'||d.kind==='action'&&d.action===steamAction);
  const active=target.cards.find(c=>!c.history),historical=target.cards.find(c=>c.history);
  for(const delayed of [false,true]){if(delayed){await p.getByRole('button',{name:s.key==='steam'?'關閉':'關閉顧客資料',exact:true}).click();await p.waitForTimeout(16500);}
   const before=reads.length,at=performance.now();await p.getByRole('button',{name:target.name,exact:true}).click();await grid(p,s,active.name);r.timings.push({scenario:delayed?'open-after-fresh-cache-expiry':'first-open-without-intent-prefetch',ms:Math.round(performance.now()-at)});
   const toggle=p.getByRole('button',{name:/^歷史方案/});const historyAt=performance.now();await toggle.click();await grid(p,s,historical.name);await grid(p,s,active.name);r.timings.push({scenario:delayed?'history-after-expiry':'first-history-toggle',ms:Math.round(performance.now()-historyAt)});
   assert.equal((await plan(p,s,historical.name).innerText()).includes('讀取'),false);await p.waitForTimeout(100);
   const foreground=reads.slice(before).filter(planRead).length;if(!delayed)assert.equal(foreground,0,'first open/history should reuse preload');r.checks.push(delayed?'after-expiry-retains-bounded-data-while-revalidating':'first-open-and-first-history-toggle-issue-no-additional-plan-read');r.timings.push({scenario:delayed?'background-revalidations-after-expiry':'extra-plan-reads-on-first-open',count:foreground});
   await p.screenshot({path:out+'/'+s.key+(delayed?'-after-expiry':'-first-history')+'.png',fullPage:true});save();
  }
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await context.close();console.log(s.key,'passed beyond row',target.rowIndex);save();
 }
 assert.deepEqual(report.errors,[]);report.complete=true;save();
}catch(error){report.complete=false;report.failure=String(error);save();if(last){console.log((await last.locator('body').innerText().catch(()=>'' )).slice(-2500));await last.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});}throw error;}
finally{await browser?.close();await Promise.all([db.$disconnect(),course.$disconnect(),beauty.$disconnect()]);}
