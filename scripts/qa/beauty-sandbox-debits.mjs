/** Cancellation/no-show matrix through real HTTP; task QA DB readback only. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {assertBeautySandboxQaEnvironment,BEAUTY_SANDBOX_ORIGIN as origin} from '../beauty-sandbox-qa-scope.mjs';
assertBeautySandboxQaEnvironment(process.env);
const require=createRequire(import.meta.url),{PrismaClient}=require('../../generated/beauty-client');
const {toLocalDateStr,addTaiwanDuration}=require('../../src/lib/date-utils.ts');
const {request}=await import(process.env.QA_PLAYWRIGHT_MODULE??'/tmp/beauty-browser/node_modules/playwright/index.mjs');
const db=new PrismaClient(),storeId='beauty-1374-store',prefix='/s/beauty-1374-qa',dashboard=prefix+'/admin/dashboard/beauty';
const runId=randomUUID().slice(0,8),tag='debits-'+runId,out='/tmp/beauty-sandbox-debits/'+runId;
const date=addTaiwanDuration(toLocalDateStr(),4,'DAY'),password=process.env.QA_BEAUTY_REVIEW_PASSWORD;assert(password);
const memberId='beauty-1374-member-customer',familyId='beauty-1374-worker-customer',serviceId='beauty-1374-face';
const contexts=[],refs=new Map(),results=[],matrix=[];let stage='login',originalPolicy,owner,checks=0,restored=false;
await mkdir(out,{recursive:true});
async function context(account){const ctx=await request.newContext({baseURL:origin,timeout:45000});contexts.push(ctx);const csrf=await(await ctx.get('/api/auth/csrf')).json();const phone=account==='member'?'0900001375':account==='worker'?'0900001376':null;await ctx.post('/api/auth/callback/'+(phone?'customer-phone':'credentials'),{form:{csrfToken:csrf.csrfToken,password,callbackUrl:origin+prefix+'/beauty',...(phone?{phone,storeId}:{email:'owner@beauty-1374.invalid'})},maxRedirects:0});const session=await(await ctx.get('/api/auth/session')).json();assert.equal(session.user?.id,'beauty-1374-'+account);ctx.path=account==='owner'?dashboard:prefix+'/beauty';await ctx.get(ctx.path);return ctx;}
async function call(ctx,name,args){assert(refs.has(name),'Missing action '+name);const r=await ctx.post(ctx.path,{headers:{Origin:origin,'Next-Action':refs.get(name),'Content-Type':'text/plain;charset=UTF-8'},data:JSON.stringify(args),maxRedirects:0});const text=await r.text();for(const line of text.split('\n')){const m=line.match(/^[0-9a-f]+:(\{.*\})$/);if(m)try{const v=JSON.parse(m[1]);if(typeof v.success==='boolean')return v;}catch{}}throw Error('Missing action response '+name+' HTTP '+r.status());}
async function ok(ctx,name,args){const r=await call(ctx,name,args);assert.equal(r.success,true,name+': '+r.error);return r.data;}
async function portal(ctx,work=false,manager=false){const r=await ctx.get((manager?dashboard:prefix+'/beauty')+'?'+(manager?'month='+date.slice(0,7)+'&date='+date:'work='+(work?'1':'0'))+'&qa='+randomUUID(),{headers:{RSC:'1'}});assert.equal(r.status(),200);const records=new Map();for(const line of (await r.text()).split('\n')){const m=line.match(/^([0-9a-f]+):([\[{].*)$/);if(m)try{records.set(m[1],JSON.parse(m[2]));}catch{}}
 function deref(v){return typeof v==='string'&&/^\$[0-9a-f]+$/.test(v)?records.get(v.slice(1)):v;}
 function walk(v){if(!v||typeof v!=='object')return;if('cards'in v&&'items'in v&&(manager?'access'in v:v.work===work))return v;for(const child of Object.values(v)){const found=walk(child);if(found)return found;}}
 const data=[...records.values()].map(walk).find(Boolean);assert(data,'Missing portal RSC');for(const key of ['cards','items']){const values=deref(data[key]);assert(Array.isArray(values));data[key]=values.map(deref);}return data;
}
async function policy(cancelDeduct,noShowDeduct){const current=await db.beautySetting.findUniqueOrThrow({where:{storeId}});await ok(owner,'saveBeautySettings',[{...current,cancelDeduct,noShowDeduct}]);}
function pass(name){results.push({case:name,passed:true});console.log(JSON.stringify(results.at(-1)));}
async function allState(){const values={};for(const t of ['beautySetting','beautyService','beautyTechnician','beautyPlan','beautyCard','beautyGroup','beautyAppointment','beautyLedger','beautyPayment','beautySettlement','beautyCommand','beautyEvent','beautyPurchase'])values[t]=(await db[t].findMany({where:{storeId}})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return createHash('sha256').update(JSON.stringify(values)).digest('hex');}
async function denied(ctx,name,args,pattern){const before=await allState(),r=await call(ctx,name,args);assert.equal(r.success,false,stage+' must reject');assert.match(r.error,pattern);assert.equal(await allState(),before,stage+' changed data on rejection');checks++;}
async function plan(sessions){const name=tag+'-'+sessions;await ok(owner,'saveBeautyCatalog',['plan',{name,sessions,price:sessions*1000,validDays:30,serviceIds:[serviceId],allowShared:true}]);return db.beautyPlan.findFirstOrThrow({where:{storeId,name}});}
async function card(plan){const r=await ok(owner,'purchaseBeautyPlan',[{requestKey:randomUUID(),planId:plan.id,customerId:memberId,memberIds:[familyId],paid:plan.price,method:'BANK_TRANSFER'}]);return db.beautyCard.findUniqueOrThrow({where:{id:r.cardId}});}
async function book(ctx,cardId,customerId=memberId,afterTime){const p=await db.beautySetting.findUniqueOrThrow({where:{storeId}}),service=await db.beautyService.findUniqueOrThrow({where:{id:serviceId}});const d={requestKey:randomUUID(),policyRevision:p.revision,date,time:'09:00',contactName:'合成扣次驗收',phone:'0900001375',isTrial:false,people:[{name:tag,phone:customerId===memberId?'0900001375':'0900001376',customerId,serviceId,serviceRevision:service.revision,preference:'FEMALE',specifiedTechnicianId:'beauty-1374-female',cardId,notes:tag}]};const slots=await ok(ctx,'readBeautySlots',['member','beauty-1374-qa',d]);d.time=slots.slots.find(t=>!afterTime||t>=afterTime);assert(d.time,'No authoritative available time');const r=await ok(ctx,'bookBeautyParty',['member',d]);return db.beautyAppointment.findUniqueOrThrow({where:{id:r.ids[0]}});}
async function moveStatus(ctx,id,target,requestKey=randomUUID()){const b=await db.beautyAppointment.findUniqueOrThrow({where:{id}}),input={requestKey,id,revision:b.revision,target,reason:tag};await ok(ctx,'changeBeautyStatus',[ctx===owner?'manager':ctx===worker?'work':'member',input]);return input;}
let worker,member;
async function check(c,b,expectedStatus,cancelDeduct,noShowDeduct,previous=new Map()){
 const card=await db.beautyCard.findUniqueOrThrow({where:{id:c.id}}),item=await db.beautyAppointment.findUniqueOrThrow({where:{id:b.id}}),debit=expectedStatus==='COMPLETED'||(expectedStatus==='CANCELLED'&&cancelDeduct)||(expectedStatus==='NO_SHOW'&&noShowDeduct);
 assert.equal(item.status,expectedStatus);assert.equal(item.cancelDeduct,cancelDeduct);assert.equal(item.noShowDeduct,noShowDeduct);assert.equal(item.debit,debit);assert.equal(card.remaining,c.sessions-Number(debit));
 const held=await db.beautyAppointment.count({where:{storeId,cardId:c.id,status:'RESERVED'}});assert.equal(held,Number(expectedStatus==='RESERVED'));
 const ledger=await db.beautyLedger.findMany({where:{storeId,cardId:c.id}});assert.equal(ledger.reduce((n,l)=>n+l.delta,0),card.remaining);for(const [id,text] of previous){const row=ledger.find(l=>l.id===id);assert(row,'Ledger was deleted');assert.equal(JSON.stringify(row),text,'Ledger was overwritten');}
 for(const [ctx,work,manager] of [[member,false,false],[worker,true,false],[owner,false,true]]){const data=await portal(ctx,work,manager),row=data.items.find(x=>x.id===b.id);if(!manager||data.date===toLocalDateStr(item.startsAt)){assert(row,'Service missing from portal');assert.equal(row.status,expectedStatus);assert.equal(row.cancelDeduct,cancelDeduct);assert.equal(row.noShowDeduct,noShowDeduct);}if(!work){const summary=data.cards.find(x=>x.id===c.id);assert(summary);assert.equal(summary.remaining,card.remaining);assert.equal(summary.held,held);}}
 checks++;return new Map(ledger.map(l=>[l.id,JSON.stringify(l)]));
}
try{
 originalPolicy=await db.beautySetting.findUniqueOrThrow({where:{storeId}});assert.equal(originalPolicy.notifications,false);
 owner=await context('owner');member=await context('member');worker=await context('worker');
 const manifest=JSON.parse(await readFile('.next/dev/server/server-reference-manifest.json','utf8'));for(const [id,entry] of Object.entries(manifest.node))for(const w of Object.values(entry.workers))if(w.filename==='src/server/actions/beauty.ts')refs.set(w.exportedName,id);
 const three=await plan(3),one=await plan(1);
 for(const cancelDeduct of [false,true])for(const noShowDeduct of [false,true]){
  stage='matrix '+Number(cancelDeduct)+Number(noShowDeduct);await policy(cancelDeduct,noShowDeduct);const c=await card(three),b=await book(member,c.id);let history=await check(c,b,'RESERVED',cancelDeduct,noShowDeduct);
  // Change store defaults after acceptance; accepted appointments keep their snapshots.
  await policy(!cancelDeduct,!noShowDeduct);
  await moveStatus(member,b.id,'CANCELLED');history=await check(c,b,'CANCELLED',cancelDeduct,noShowDeduct,history);
  await moveStatus(owner,b.id,'RESERVED');history=await check(c,b,'RESERVED',cancelDeduct,noShowDeduct,history);
  await moveStatus(owner,b.id,'NO_SHOW');history=await check(c,b,'NO_SHOW',cancelDeduct,noShowDeduct,history);
  await moveStatus(owner,b.id,'RESERVED');history=await check(c,b,'RESERVED',cancelDeduct,noShowDeduct,history);
  const completeInput=await moveStatus(worker,b.id,'COMPLETED');history=await check(c,b,'COMPLETED',cancelDeduct,noShowDeduct,history);
  const before=await allState();await ok(worker,'changeBeautyStatus',['work',completeInput]);assert.equal(await allState(),before,'Exact retry wrote twice');checks++;
  await denied(worker,'changeBeautyStatus',['work',{...completeInput,requestKey:randomUUID()}],/已更新/);
  const sameBefore=await db.beautyAppointment.findUniqueOrThrow({where:{id:b.id}}),ledgerCount=history.size;await moveStatus(worker,b.id,'COMPLETED');const sameAfter=await db.beautyAppointment.findUniqueOrThrow({where:{id:b.id}});assert.equal(sameAfter.revision,sameBefore.revision);assert.equal(await db.beautyLedger.count({where:{cardId:c.id}}),ledgerCount);checks++;
  if(!cancelDeduct&&!noShowDeduct){
   const report=(await portal(owner,false,true)).report;assert(report);await ok(owner,'confirmBeautySettlement',[{requestKey:randomUUID(),month:date.slice(0,7),fingerprint:report.fingerprint}]);await ok(owner,'payBeautyFee',[{requestKey:randomUUID(),id:b.id,amount:100,method:'BANK_TRANSFER',note:tag}]);const now=await db.beautyAppointment.findUniqueOrThrow({where:{id:b.id}});await denied(owner,'changeBeautyStatus',['manager',{requestKey:randomUUID(),id:b.id,revision:now.revision,target:'CANCELLED',reason:tag}],/已有技師付款/);history=await check(c,b,'COMPLETED',cancelDeduct,noShowDeduct,history);
   const payment=await db.beautyPayment.findFirstOrThrow({where:{storeId,appointmentId:b.id,kind:'FEE'}});await ok(owner,'voidBeautyFee',[{requestKey:randomUUID(),paymentId:payment.id,amount:100,method:'BANK_TRANSFER',reason:tag}]);pass('已支付拆帳時更正被拒絕，扣次與帳本完整回滾；收回後才可更正');
  }
  await moveStatus(owner,b.id,'CANCELLED');history=await check(c,b,'CANCELLED',cancelDeduct,noShowDeduct,history);
  await moveStatus(owner,b.id,'NO_SHOW');history=await check(c,b,'NO_SHOW',cancelDeduct,noShowDeduct,history);
  await moveStatus(owner,b.id,'RESERVED');history=await check(c,b,'RESERVED',cancelDeduct,noShowDeduct,history);
  await moveStatus(member,b.id,'CANCELLED');await check(c,b,'CANCELLED',cancelDeduct,noShowDeduct,history);
  matrix.push({cancelDeduct,noShowDeduct,initial:3,finalRemaining:3-Number(cancelDeduct),finalHeld:0,snapshotPreserved:true,ledgerAppendOnly:true});pass('取消'+(cancelDeduct?'扣次':'不扣次')+'／未到'+(noShowDeduct?'扣次':'不扣次')+'：取消、恢復、未到、完成、更正、重送及三端資料一致');
 }
 stage='restoration guards';await policy(false,false);const c=await card(one),a=await book(member,c.id);await moveStatus(member,a.id,'CANCELLED');
 const start=a.startsAt.toLocaleTimeString('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit'}),end=a.occupiedEndsAt.toLocaleTimeString('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit'});
 const b=await book(member,c.id,familyId,end);const restore=async pattern=>{const row=await db.beautyAppointment.findUniqueOrThrow({where:{id:a.id}});await denied(owner,'changeBeautyStatus',['manager',{requestKey:randomUUID(),id:a.id,revision:row.revision,target:'RESERVED',reason:tag}],pattern);};
 await restore(/不足|過期/);pass('家人已預留最後一次時，另一筆取消預約不能恢復且無殘留');
 await moveStatus(worker,b.id,'COMPLETED');await restore(/不足|過期/);pass('家人已用完最後一次時，不能恢復取消預約或透支');
 await moveStatus(owner,b.id,'CANCELLED');assert.equal((await db.beautyCard.findUniqueOrThrow({where:{id:c.id}})).remaining,1);
 const conflict=await book(member,null,memberId,start);assert.equal(+conflict.startsAt,+a.startsAt);await restore(/全部同行者|可用|安排/);pass('原技師／空間時段被占用時，恢復整筆失敗且不預留次數');
 await moveStatus(owner,conflict.id,'CANCELLED');await moveStatus(owner,a.id,'RESERVED');await check(c,a,'RESERVED',false,false);await moveStatus(worker,a.id,'COMPLETED');await check(c,a,'COMPLETED',false,false);await moveStatus(owner,a.id,'CANCELLED');await check(c,a,'CANCELLED',false,false);
 const sale=await db.beautyPayment.findFirstOrThrow({where:{storeId,cardId:c.id,kind:'SALE'}});await ok(owner,'refundBeautyPayment',[{requestKey:randomUUID(),paymentId:sale.id,amount:1000,method:'BANK_TRANSFER',reason:tag}]);await restore(/已結清/);const closed=await db.beautyCard.findUniqueOrThrow({where:{id:c.id}});assert(closed.closedAt);assert.equal(closed.remaining,0);assert.equal((await db.beautyLedger.findMany({where:{cardId:c.id}})).reduce((n,l)=>n+l.delta,0),0);pass('更正釋回最後一次後可正常恢復；方案退款結清後禁止恢復且帳本餘額為0');
 assert.equal(await db.beautyEvent.count({where:{storeId,status:'PENDING'}}),0);pass('所有重送、拒絕與更正均無重複扣次或待發通知');
}catch(e){console.error(JSON.stringify({stage,error:e.message.trim().split('\n')[0]}));process.exitCode=1;}
finally{
 try{if(originalPolicy&&owner){const current=await db.beautySetting.findUniqueOrThrow({where:{storeId}});await ok(owner,'saveBeautySettings',[{...originalPolicy,revision:current.revision}]);const after=await db.beautySetting.findUniqueOrThrow({where:{storeId}});for(const k of Object.keys(originalPolicy).filter(k=>k!=='revision'))assert.deepEqual(after[k],originalPolicy[k]);restored=true;}}
 catch{console.error('Review policy restoration failed');process.exitCode=1;}
 await writeFile(out+'/results.json',JSON.stringify({origin,runId,synthetic:true,actualHttpActions:true,passed:process.exitCode!==1,stage,checks,settingsRestored:restored,matrix,results,limitations:['Real HTTP/RSC and database readback; not every button clicked in this run','Dedicated development PostgreSQL; not production/pooler','Transfer registration only; no real transfers','LINE login/delivery pending']},null,2));await Promise.all(contexts.map(c=>c.dispose()));await db.$disconnect();console.log(JSON.stringify({output:out,passed:process.exitCode!==1,checks,settingsRestored:restored}));
}
