/** Real Auth.js sessions and HTTP Server Actions; synthetic task-owned DB only. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {assertBeautySandboxQaEnvironment,BEAUTY_SANDBOX_ORIGIN as origin} from '../beauty-sandbox-qa-scope.mjs';
assertBeautySandboxQaEnvironment(process.env);
const require=createRequire(import.meta.url);
const {PrismaClient}=require('../../generated/beauty-client');
const {PrismaClient:MainClient}=require('@prisma/client');
const {PrismaClient:CourseClient}=require('../../generated/course-client');
const {toLocalDateStr,addTaiwanDuration,parseTaipeiDateTime}=require('../../src/lib/date-utils.ts');
const {request}=await import(process.env.QA_PLAYWRIGHT_MODULE??'/tmp/beauty-browser/node_modules/playwright/index.mjs');
const db=new PrismaClient(),main=new MainClient(),course=new CourseClient();
const password=process.env.QA_BEAUTY_REVIEW_PASSWORD;assert(password,'Provide task review password');
const storeId='beauty-1374-store',slug='beauty-1374-qa',prefix='/s/'+slug;
const runId=randomUUID().slice(0,8),tag='security-'+runId,otherId='beauty-1374-security-'+runId,otherSlug=otherId;
const out=process.env.QA_BEAUTY_SECURITY_OUTPUT??'/tmp/beauty-sandbox-security/'+runId;
await mkdir(out,{recursive:true});
const results=[],contexts=[],actionRefs=new Map();let stage='setup',originalTech,originalUser,baseline;
function pass(name,details={}){const r={case:name,passed:true,...details};results.push(r);console.log(JSON.stringify(r));}
const tables=['beautySetting','beautyService','beautyTechnician','beautyPlan','beautyCard','beautyGroup','beautyAppointment','beautyLedger','beautyPayment','beautySettlement','beautyCommand','beautyEvent','beautyPurchase'];
async function digest(){
 const rows={};for(const t of tables)rows[t]=(await db[t].findMany({where:{storeId:{in:[storeId,otherId]}}})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 rows.customers=await main.customer.findMany({where:{storeId:{in:[storeId,otherId]}},orderBy:{id:'asc'}});
 rows.spaces=await course.courseRoom.findMany({where:{storeId:{in:[storeId,otherId]}},orderBy:{id:'asc'}});
 rows.cashbook=await main.cashbookEntry.findMany({where:{storeId:{in:[storeId,otherId]}},orderBy:{id:'asc'}});
 return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
async function unchanged(){assert.equal(await digest(),baseline,'Rejected request changed business data: '+stage);}
async function context(account){
 const ctx=await request.newContext({baseURL:origin,timeout:45000});contexts.push(ctx);
 if(account){const csrf=await(await ctx.get('/api/auth/csrf')).json();const phone=account==='worker'?'0900001376':account==='member'?'0900001375':null;
 await ctx.post('/api/auth/callback/'+(phone?'customer-phone':'credentials'),{form:{csrfToken:csrf.csrfToken,password,callbackUrl:origin+prefix+'/beauty',...(phone?{phone,storeId}:{email:account+'@beauty-1374.invalid'})},maxRedirects:0});
 const session=await(await ctx.get('/api/auth/session')).json();assert.equal(session.user?.id,'beauty-1374-'+account,'Actual login failed');}
 ctx.qaPath=['owner','limited'].includes(account)?prefix+'/admin/dashboard/beauty':prefix+'/beauty';return ctx;
}
async function loadRefs(){const m=JSON.parse(await readFile('.next/dev/server/server-reference-manifest.json','utf8'));for(const [id,entry] of Object.entries(m.node))for(const worker of Object.values(entry.workers))if(worker.filename==='src/server/actions/beauty.ts')actionRefs.set(worker.exportedName,id);}
async function call(ctx,name,args,path){
 assert(actionRefs.has(name),'Missing compiled action '+name);
 const res=await ctx.post(path??ctx.qaPath,{headers:{'Next-Action':actionRefs.get(name),'Content-Type':'text/plain;charset=UTF-8',Origin:origin},data:JSON.stringify(args),maxRedirects:0});
 const text=await res.text();let value;
 for(const line of text.split('\n')){const match=line.match(/^[0-9a-f]+:(\{.*\})$/);if(match){try{const v=JSON.parse(match[1]);if(typeof v.success==='boolean')value=v;}catch{}}}
 return {status:res.status(),value,redirect:res.headers()['x-action-redirect']??res.headers().location,text};
}
async function deny(ctx,name,args,{path,pattern}={}){
 const before=await digest();const r=await call(ctx,name,args,path);
 assert(r.value?.success===false||r.status===401||r.status===403||r.redirect||/NEXT_REDIRECT/.test(r.text),'No explicit denial for '+stage+' / '+name+' HTTP '+r.status+' '+r.text.slice(0,400));
 if(pattern&&r.value)assert.match(r.value.error,pattern,'Wrong rejection layer: '+stage);
 assert(!r.text.includes('FOREIGN-PRIVATE-'+runId),'Foreign private marker leaked');
 assert.equal(await digest(),before,'Denied HTTP request changed business data: '+stage);
 return r.value?'server-action':'routing';
}
function change(id,target='COMPLETED'){return {requestKey:randomUUID(),id,revision:0,target,reason:tag};}
async function workData(ctx){
 const res=await ctx.get(prefix+'/beauty?work=1&qa='+runId,{headers:{RSC:'1'}});assert.equal(res.status(),200);
 const records=new Map();for(const line of (await res.text()).split('\n')){const match=line.match(/^([0-9a-f]+):([\[{].*)$/);if(match)try{records.set(match[1],JSON.parse(match[2]));}catch{}}
 function walk(value){if(!value||typeof value!=='object')return; if(value.work===true&&'income'in value&&'grants'in value)return value;for(const item of Object.values(value)){const found=walk(item);if(found)return found;}}
 const data=[...records.values()].map(walk).find(Boolean);assert(data,'Missing real work portal RSC data');
 if(typeof data.income==='string'&&/^\$[0-9a-f]+$/.test(data.income))data.income=records.get(data.income.slice(1));
 assert(Array.isArray(data.income));return data;
}
try{
 originalTech=await db.beautyTechnician.findUniqueOrThrow({where:{id:'beauty-1374-female'}});
 originalUser=await main.user.findUniqueOrThrow({where:{id:'beauty-1374-worker'},select:{id:true,status:true}});
 assert(originalTech.active&&originalUser.status==='ACTIVE','Existing review accounts must start enabled');
 let date;for(let offset=12;offset<28;offset++){const candidate=addTaiwanDuration(toLocalDateStr(),offset,'DAY');if(!await db.beautyAppointment.count({where:{storeId,startsAt:{gte:parseTaipeiDateTime(candidate,'00:00'),lte:parseTaipeiDateTime(candidate,'23:59')}}})){date=candidate;break;}}assert(date,'No unused fixture date');
 await main.store.create({data:{id:otherId,slug:otherSlug,name:'合成隔離分店 '+runId,industryModule:'BEAUTY',plan:'ALLIANCE',isDemo:true}});
 await main.shopConfig.create({data:{storeId:otherId,shopName:'合成隔離分店'}});
 const foreignCustomer=await main.customer.create({data:{storeId:otherId,name:'FOREIGN-PRIVATE-'+runId,phone:'095'+String(Date.now()).slice(-7),notes:'FOREIGN-PRIVATE-'+runId}});
 const room=await course.courseRoom.create({data:{storeId:otherId,name:'合成外店空間',capacity:1}});
 const foreignService=await db.beautyService.create({data:{storeId:otherId,name:'外店服務',duration:60,price:1000}});
 const foreignTech=await db.beautyTechnician.create({data:{storeId:otherId,name:'外店技師',gender:'FEMALE',serviceIds:[foreignService.id],weekly:[],rates:{}}});
 const foreignPlan=await db.beautyPlan.create({data:{storeId:otherId,name:'外店方案',sessions:1,price:1000,validDays:30,serviceIds:[foreignService.id],allowShared:true}});
 const foreignCard=await db.beautyCard.create({data:{storeId:otherId,customerId:foreignCustomer.id,memberIds:[foreignCustomer.id],planId:foreignPlan.id,name:foreignPlan.name,sessions:1,remaining:1,listPrice:1000,paid:1000,serviceIds:[foreignService.id],allowShared:true,expiresAt:new Date(Date.now()+30*86400000)}});
 const foreignGroup=await db.beautyGroup.create({data:{storeId:otherId,customerId:foreignCustomer.id,contactName:foreignCustomer.name,phone:foreignCustomer.phone,startsAt:parseTaipeiDateTime(date,'09:00')}});
 const foreignAppointment=await db.beautyAppointment.create({data:{storeId:otherId,groupId:foreignGroup.id,customerId:foreignCustomer.id,personName:foreignCustomer.name,personPhone:foreignCustomer.phone,serviceId:foreignService.id,serviceName:foreignService.name,technicianId:foreignTech.id,locationId:room.id,preference:'FEMALE',startsAt:parseTaipeiDateTime(date,'09:00'),endsAt:parseTaipeiDateTime(date,'10:00'),occupiedEndsAt:parseTaipeiDateTime(date,'10:00'),duration:60,buffer:0,price:1000,isTrial:false,rate:{mode:'FIXED',value:100},cancelDeduct:false,noShowDeduct:false,notes:foreignCustomer.notes}});
 const foreignPayment=await db.beautyPayment.create({data:{storeId:otherId,appointmentId:foreignAppointment.id,kind:'SALE',amount:1000,method:'BANK_TRANSFER',note:'外店合成收款',actorUserId:'beauty-1374-owner'}});
 const foreignFee=await db.beautyPayment.create({data:{storeId:otherId,appointmentId:foreignAppointment.id,technicianId:foreignTech.id,kind:'FEE',amount:100,method:'BANK_TRANSFER',note:'外店合成付款',actorUserId:'beauty-1374-owner'}});
 const foreignOrder=await db.beautyPurchase.create({data:{storeId:otherId,customerId:foreignCustomer.id,planId:foreignPlan.id,snapshot:foreignPlan,lastFour:'0000'}});
 // New task fixtures only; search a free interval before inserting each own-store service.
 async function appointment(technicianId,customerId){
  let time;for(let h=9;h<20;h++){const start=parseTaipeiDateTime(date,String(h).padStart(2,'0')+':00'),end=new Date(+start+75*60000);if(!await db.beautyAppointment.count({where:{storeId,status:{not:'CANCELLED'},OR:[{technicianId},{locationId:'beauty-1374-room-a'}],startsAt:{lt:end},occupiedEndsAt:{gt:start}}})){time={start,end};break;}}assert(time,'No safe fixture slot');
  const g=await db.beautyGroup.create({data:{storeId,customerId,contactName:tag,phone:'0900001375',startsAt:time.start}});
  return db.beautyAppointment.create({data:{storeId,groupId:g.id,customerId,personName:tag,personPhone:'0900001375',serviceId:'beauty-1374-face',serviceName:'做臉',technicianId,locationId:'beauty-1374-room-a',preference:technicianId.endsWith('female')?'FEMALE':'MALE',startsAt:time.start,endsAt:new Date(+time.start+60*60000),occupiedEndsAt:time.end,duration:60,buffer:15,price:1000,isTrial:false,rate:{mode:'FIXED',value:100},cancelDeduct:false,noShowDeduct:false,notes:tag}});
 }
 const own=await appointment(originalTech.id,'beauty-1374-member-customer');
 const otherWork=await appointment('beauty-1374-male','beauty-1374-worker-customer');
 const ownCustomer=await main.customer.findUniqueOrThrow({where:{id:'beauty-1374-member-customer'}});
 const localService=await db.beautyService.findUniqueOrThrow({where:{id:'beauty-1374-face'}});
 const policy=await db.beautySetting.findUniqueOrThrow({where:{storeId}});
 const owner=await context('owner'),limited=await context('limited'),member=await context('member'),worker=await context('worker'),guest=await context();
 await owner.get(prefix+'/admin/dashboard/beauty');await member.get(prefix+'/beauty');await worker.get(prefix+'/beauty?work=1');await loadRefs();
 stage='positive controls';const read=await call(owner,'readBeautyCustomer',[{id:ownCustomer.id}]);assert.equal(read.value?.success,true,JSON.stringify({status:read.status,redirect:read.redirect,error:read.value?.error,resultPrefix:read.value?undefined:read.text.slice(0,200)}));assert.equal(read.value.data.customer.id,ownCustomer.id);
 const positive=await call(worker,'readBeautyMoveSlots',['work',{id:own.id,date}]);assert.equal(positive.value?.success,true,JSON.stringify({status:positive.status,redirect:positive.redirect,error:positive.value?.error,resultPrefix:positive.value?undefined:positive.text.slice(0,200)}));assert(positive.value.data.slots.length>0);pass('真實店長與技師的正向讀取成功，確認HTTP action不是假失敗');
 const service={...localService,name:'不得修改-'+runId};
 const plan={name:tag,sessions:1,price:1000,validDays:30,serviceIds:[localService.id],allowShared:true};
 const tech={...originalTech,name:'不得修改-'+runId};
 const card=(await db.beautyCard.findMany({where:{storeId,closedAt:null},take:1}))[0];assert(card,'Commerce acceptance must have issued a synthetic local card');
 const managerCases=[
  ['saveBeautyCatalog',['service',service]],['saveBeautyCatalog',['plan',plan]],['saveBeautyCatalog',['technician',tech]],
  ['saveBeautySettings',[{...policy,selfBooking:!policy.selfBooking}]],['saveBeautyLocation',[{id:'beauty-1374-room-a',name:tag,active:true}]],
  ['bookBeautyParty',['manager',{requestKey:randomUUID(),date,time:'19:00',contactName:tag,phone:'0900001375',isTrial:false,policyRevision:policy.revision,people:[{name:ownCustomer.name,phone:ownCustomer.phone,customerId:ownCustomer.id,serviceId:localService.id,serviceRevision:localService.revision,preference:'FEMALE'}]}]],
  ['changeBeautyStatus',['manager',change(own.id)]],['moveBeautyAppointment',['manager',{...change(own.id),date,time:'19:00'}]],
  ['collectBeautyPayment',[{requestKey:randomUUID(),ids:[own.id],amounts:[1],method:'BANK_TRANSFER',note:tag}]],
  ['purchaseBeautyPlan',[{requestKey:randomUUID(),planId:'beauty-1374-plan',customerId:ownCustomer.id,memberIds:[],paid:1,method:'BANK_TRANSFER'}]],
  ['refundBeautyPayment',[{requestKey:randomUUID(),paymentId:foreignPayment.id,amount:1,method:'BANK_TRANSFER',reason:tag}]],
  ['confirmBeautySettlement',[{requestKey:randomUUID(),month:date.slice(0,7),fingerprint:'not-authorized'}]],
  ['payBeautyFee',[{requestKey:randomUUID(),id:own.id,amount:1,method:'BANK_TRANSFER',note:tag}]],
  ['voidBeautyFee',[{requestKey:randomUUID(),paymentId:foreignFee.id,amount:1,method:'BANK_TRANSFER',reason:tag}]],
  ['saveBeautyCustomer',[{name:tag,phone:'0960001374',notes:tag}]],['readBeautyCustomer',[{id:ownCustomer.id}]],
  ['updateBeautyCustomer',[{id:ownCustomer.id,expected:{name:ownCustomer.name,phone:ownCustomer.phone,notes:ownCustomer.notes??''},values:{name:tag,phone:ownCustomer.phone,notes:tag}}]],
  ['updateBeautyCardMembers',[{requestKey:randomUUID(),id:card.id,expected:card.memberIds,memberIds:[ownCustomer.id]}]],
  ['linkBeautyCustomer',[{...change(own.id),customerId:ownCustomer.id}]],['confirmBeautyPurchase',[{requestKey:randomUUID(),id:foreignOrder.id}]],
 ];
 baseline=await digest();
 for(const [who,ctx] of [['limited',limited],['member',member],['guest',guest]]){
  const layers={};for(const [name,args] of managerCases){stage=who+' '+name;const layer=await deny(ctx,name,args,{path:prefix+'/admin/dashboard/beauty',pattern:/權限|登入|員工|無法完成|店家|技師|帳號|存取/});layers[layer]=(layers[layer]??0)+1;}
  pass(who+'直接偽造20項管理操作均拒絕且無業務資料異動',{requests:managerCases.length,layers});
 }
 stage='work ownership';await deny(worker,'changeBeautyStatus',['work',change(otherWork.id)],{pattern:/自己的服務/});await deny(worker,'readBeautyMoveSlots',['work',{id:otherWork.id,date}],{pattern:/自己的服務/});await deny(member,'changeBeautyStatus',['work',change(own.id)],{pattern:/技師工作/});pass('技師不能操作或查詢別人的服務；顧客不能偽裝工作身分');
 for(const [grant,name,args] of [
  ['complete','changeBeautyStatus',['work',change(own.id)]],['cancel','changeBeautyStatus',['work',change(own.id,'CANCELLED')]],['reschedule','moveBeautyAppointment',['work',{...change(own.id),date,time:'19:00'}]],
 ]){stage='revoke '+grant;await db.beautyTechnician.update({where:{id:originalTech.id},data:{grants:originalTech.grants.filter(g=>g!==grant)}});try{await deny(worker,name,args,{pattern:/授權|開放/});}finally{await db.beautyTechnician.update({where:{id:originalTech.id},data:{grants:originalTech.grants}});}pass('舊登入撤回'+grant+'後立即拒絕後端操作');}
 for(const patch of [{active:false},{userId:null}]){stage='revoke work identity';await db.beautyTechnician.update({where:{id:originalTech.id},data:patch});try{await deny(worker,'changeBeautyStatus',['work',change(own.id)],{pattern:/技師工作/});await deny(worker,'readBeautyMoveSlots',['work',{id:own.id,date}],{pattern:/技師工作/});}finally{await db.beautyTechnician.update({where:{id:originalTech.id},data:{active:originalTech.active,userId:originalTech.userId}});}pass('舊登入'+('active'in patch?'停用技師':'解除帳號連結')+'後讀寫均拒絕');}
 stage='revoke income';const beforeIncome=await workData(worker);assert(beforeIncome.income.length>0,'Need existing confirmed synthetic income as positive control');assert(beforeIncome.income.every(line=>line.technicianId===originalTech.id));
 await db.beautyTechnician.update({where:{id:originalTech.id},data:{grants:originalTech.grants.filter(g=>g!=='income')}});try{const afterIncome=await workData(worker);assert(!afterIncome.grants.includes('income'));assert.deepEqual(afterIncome.income,[]);}finally{await db.beautyTechnician.update({where:{id:originalTech.id},data:{grants:originalTech.grants}});}pass('原收入僅含本人，撤回income後舊登入的真實RSC停止回傳收入資料');
 stage='inactive user';await main.user.update({where:{id:originalUser.id},data:{status:'SUSPENDED'}});try{await deny(worker,'changeBeautyStatus',['work',change(own.id)],{pattern:/登入|停用|帳號/});}finally{await main.user.update({where:{id:originalUser.id},data:{status:originalUser.status}});}pass('停用登入帳號後舊工作登入拒絕寫入');
 baseline=await digest();
 const foreignFields={name:foreignCustomer.name,phone:foreignCustomer.phone,notes:foreignCustomer.notes};
 const cross=[
  ['readBeautyCustomer',[{id:foreignCustomer.id}]],['updateBeautyCustomer',[{id:foreignCustomer.id,expected:foreignFields,values:{...foreignFields,name:tag}}]],
  ['saveBeautyCatalog',['service',{...foreignService,name:tag}]],['saveBeautyCatalog',['plan',{...foreignPlan,name:tag,serviceIds:[localService.id]}]],['saveBeautyCatalog',['technician',{...foreignTech,name:tag,serviceIds:[localService.id],weekly:originalTech.weekly,rates:{[localService.id]:{mode:'FIXED',value:100}}}]],
  ['saveBeautyLocation',[{id:room.id,name:tag,active:true}]],['changeBeautyStatus',['manager',change(foreignAppointment.id)]],['moveBeautyAppointment',['manager',{...change(foreignAppointment.id),date,time:'19:00'}]],
  ['collectBeautyPayment',[{requestKey:randomUUID(),ids:[foreignAppointment.id],amounts:[1],method:'BANK_TRANSFER',note:tag}]],['refundBeautyPayment',[{requestKey:randomUUID(),paymentId:foreignPayment.id,amount:1,method:'BANK_TRANSFER',reason:tag}]],
  ['payBeautyFee',[{requestKey:randomUUID(),id:foreignAppointment.id,amount:1,method:'BANK_TRANSFER',note:tag}]],['voidBeautyFee',[{requestKey:randomUUID(),paymentId:foreignFee.id,amount:1,method:'BANK_TRANSFER',reason:tag}]],
  ['purchaseBeautyPlan',[{requestKey:randomUUID(),planId:foreignPlan.id,customerId:foreignCustomer.id,memberIds:[],paid:1,method:'BANK_TRANSFER'}]],['confirmBeautyPurchase',[{requestKey:randomUUID(),id:foreignOrder.id}]],
  ['updateBeautyCardMembers',[{requestKey:randomUUID(),id:foreignCard.id,expected:foreignCard.memberIds,memberIds:[foreignCustomer.id]}]],['linkBeautyCustomer',[{...change(foreignAppointment.id),customerId:foreignCustomer.id}]],
  ['readBeautyMoveSlots',['member',{id:foreignAppointment.id,date}]],
 ];
 for(const [name,args] of cross){stage='foreign id '+name;await deny(name==='readBeautyMoveSlots'?member:owner,name,args);}
 await unchanged();pass('本店店長及會員帶入外店ID的17項操作均拒絕，沒有外店私密標記或資料異動',{requests:cross.length});
 stage='cross store URL';const crossPage=await owner.get('/s/'+otherSlug+'/admin/dashboard/beauty');const html=await crossPage.text();assert(!html.includes(foreignCustomer.name));assert(html.includes('無法存取此店舖'));pass('改門市網址仍無法讀取未授權外店');
 stage='spoof store context headers';const spoof=await owner.post(owner.qaPath,{headers:{'Next-Action':actionRefs.get('readBeautyCustomer'),'Content-Type':'text/plain;charset=UTF-8',Origin:origin,'x-store-id':otherId,'x-store-slug':otherSlug},data:JSON.stringify([{id:foreignCustomer.id}]),maxRedirects:0});const body=await spoof.text();assert(body.includes('"success":false'));assert(!body.includes(foreignCustomer.name));await unchanged();pass('偽造store headers不能覆寫伺服器的門市範圍');
 assert.equal(await db.beautyEvent.count({where:{storeId:{in:[storeId,otherId]},status:'PENDING'}}),0);pass('所有拒絕測試後業務資料摘要不變、待發通知0');
}catch(e){console.error(JSON.stringify({stage,error:e.message.trim().split('\n')[0]}));process.exitCode=1;}
finally{
 if(originalTech)await db.beautyTechnician.update({where:{id:originalTech.id},data:{active:originalTech.active,userId:originalTech.userId,grants:originalTech.grants}});
 if(originalUser)await main.user.update({where:{id:originalUser.id},data:{status:originalUser.status}});
 await writeFile(out+'/results.json',JSON.stringify({origin,runId,synthetic:true,realHttpActions:true,passed:process.exitCode!==1,stage,results,restoredReviewIdentity:true,limitations:['Dedicated PostgreSQL only; no production/pooler proof','Fixtures inserted by guarded QA clients; denial calls use real HTTP','Not all concurrent revocation races covered','LINE login and delivery pending']},null,2));
 await Promise.all(contexts.map(c=>c.dispose()));await Promise.all([db.$disconnect(),main.$disconnect(),course.$disconnect()]);console.log(JSON.stringify({output:out,passed:process.exitCode!==1}));
}
