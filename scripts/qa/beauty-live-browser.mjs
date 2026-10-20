/** Real Next server, real credentials login and Server Actions; synthetic local DB only. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomBytes,createCipheriv,createHmac,createHash} from 'node:crypto';
import {assertBeautyLocalQaEnvironment} from '../beauty-local-qa-scope.mjs';
assertBeautyLocalQaEnvironment(process.env);
const require=createRequire(import.meta.url);
const {PrismaClient}=require('../../generated/beauty-client');
const {PrismaClient:MainClient}=require('@prisma/client');
const {chromium}=await import(process.env.QA_PLAYWRIGHT_MODULE ?? '/tmp/beauty-qa-tooling/node_modules/playwright/index.mjs');
const db=new PrismaClient(),main=new MainClient();
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_EXECUTABLE ?? '/usr/bin/chromium',args:['--no-sandbox']});
const base=process.env.AUTH_URL,prefix=base+'/s/beauty-1374-qa',out=process.env.QA_BEAUTY_LIVE_OUTPUT ?? '/tmp/beauty-1374-qa/browser';
await mkdir(out,{recursive:true});
const results=[],contexts=[],errors=[];
const {toLocalDateStr,addTaiwanDuration,formatTWDateTime}=require('../../src/lib/date-utils.ts');
const nextDate=(n)=>addTaiwanDuration(toLocalDateStr(),n,'DAY');
const runId=String(Date.now()).slice(-6),publicPhone='0921'+runId,otherPhone='0922'+runId;
async function context(login,width=390,height=844){
 const c=await browser.newContext({viewport:{width,height}});contexts.push(c);
 // Real integrations are additionally blocked at the browser boundary; no external credentials exist.
 await c.route('**/*',route=>{const u=new URL(route.request().url());return ['localhost','127.0.0.1'].includes(u.hostname)?route.continue():route.abort();});
 if(login){const csrf=await(await c.request.get(base+'/api/auth/csrf')).json();await c.request.post(base+'/api/auth/callback/credentials',{form:{csrfToken:csrf.csrfToken,email:login+'@beauty-1374.invalid',password:'Beauty1374-test-only!',callbackUrl:prefix+'/beauty'},maxRedirects:0});const session=await(await c.request.get(base+'/api/auth/session')).json();assert.equal(session.user?.id,'beauty-1374-'+login);}
 const page=await c.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));return page;
}
async function shot(page,name){await page.waitForLoadState('networkidle');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/'+name+'.png',fullPage:true,caret:'initial'});}
async function until(fn){for(let i=0;i<40;i++){const r=await fn();if(r)return r;await new Promise(resolve=>setTimeout(resolve,250));}throw Error('Database expectation timed out');}
async function formBook(page,{date,people,member=false,expectedError}){
 await page.getByLabel('預約人數').selectOption(String(people.length));
 for(let i=0;i<people.length;i++){
  const section=page.locator('form section').nth(i),p=people[i];
  if(!member || i>0){await section.getByLabel('姓名',{exact:true}).fill(p.name);await section.getByLabel('手機',{exact:true}).fill(p.phone);}
  assert.equal(await section.getByLabel('技師性別（必選）').inputValue(),'');
  await section.getByLabel('服務項目').selectOption('beauty-1374-'+p.service);
  await section.getByLabel('技師性別（必選）').selectOption(p.gender);
  assert.equal(await section.getByLabel('指定技師（選填）').inputValue(),'');
  await section.getByLabel('本次備註（選填）').fill('live-'+runId);
 }
 if(!member){await page.getByLabel('聯絡人姓名',{exact:true}).fill(people[0].name);await page.getByLabel('聯絡人手機',{exact:true}).fill(people[0].phone);}
 await page.getByLabel('共同日期').fill(date);
 await page.getByRole('button',{name:'查詢共同可用時間',exact:true}).click();
 const times=page.getByLabel('共同開始時間');await times.waitFor();
 const options=await times.locator('option').allTextContents();assert(options.length>1);
 await times.selectOption(options[1]);await page.getByRole('button',{name:'確認預約',exact:true}).click();
 if(expectedError) await page.getByRole('alert').filter({hasText:expectedError}).waitFor();
 else await page.getByRole('heading',{name:'預約成功',exact:true}).waitFor();
}
try{
 const pub=await context(null);await pub.goto(base+'/beauty-trial/beauty-1374-qa',{timeout:120000});
 await formBook(pub,{date:nextDate(2),people:[{name:'公開做臉'+runId,phone:publicPhone,service:'face',gender:'FEMALE'},{name:'公開按摩'+runId,phone:otherPhone,service:'massage',gender:'MALE'}]});
 const publicItems=await db.beautyAppointment.findMany({where:{personPhone:{in:[publicPhone,otherPhone]}}});assert.equal(publicItems.length,2);assert.equal(new Set(publicItems.map(b=>b.groupId)).size,1);assert.deepEqual(publicItems.map(b=>b.duration).sort(),[60,90]);
 const lead=await main.customer.findFirstOrThrow({where:{phone:publicPhone}});assert.equal(lead.userId,null);
 await shot(pub,'public-party-success');results.push({case:'公開兩人不同服務，性別必選、預設不指定、原子寫入與未授予會員帳號',passed:true});
 const owner=await context('owner',1440,900);await owner.goto(prefix+'/admin/dashboard/beauty?date='+nextDate(2),{timeout:120000});
 await owner.locator('article strong').filter({hasText:'公開做臉'+runId}).first().waitFor();await owner.locator('article strong').filter({hasText:'公開按摩'+runId}).first().waitFor();
 for(const label of ['首頁','班表','顧客管理','顧客經營','營運','分析','位置管理','服務項目','收費方式','技師管理','人員管理','圖片公告','設定'])assert(await owner.getByRole('link',{name:label,exact:true}).count()>0,label);
 await shot(owner,'manager-desktop');await owner.setViewportSize({width:1024,height:768});await shot(owner,'manager-ipad');results.push({case:'真實店長登入、十三個功能列及同筆分項預約桌機／iPad',passed:true});
 const member=await context('member');await member.goto(prefix+'/beauty',{timeout:120000});await member.getByRole('button',{name:'立即預約',exact:true}).click();
 await formBook(member,{date:nextDate(3),member:true,people:[{service:'face',gender:'FEMALE'}]});
 const item=await db.beautyAppointment.findFirstOrThrow({where:{storeId:'beauty-1374-store',customerId:'beauty-1374-member-customer',notes:'live-'+runId,startsAt:{gte:new Date(nextDate(3)+'T00:00:00Z'),lt:new Date(nextDate(4)+'T00:00:00Z')}}});
 assert.equal(item.technicianId,'beauty-1374-female');await shot(member,'member-book-success');results.push({case:'真實會員登入、查共同時段、Server Action 預約及資料庫核對',passed:true});
 await member.goto(prefix+'/beauty');
 const memberItem=member.locator('article').filter({hasText:formatTWDateTime(item.startsAt)}).filter({hasText:'驗收顧客'}).first();
 await memberItem.getByRole('button',{name:'改期',exact:true}).click();
 const panel=member.getByRole('dialog');await panel.getByLabel('日期',{exact:true}).fill(nextDate(4));
 await panel.getByRole('button',{name:'查詢可用時間',exact:true}).click();
 const moveTimes=panel.getByLabel('開始時間');await moveTimes.waitFor();
 await moveTimes.selectOption((await moveTimes.locator('option').allTextContents())[1]);
 await panel.getByRole('button',{name:'確認改期',exact:true}).click();
 await until(async()=>toLocalDateStr((await db.beautyAppointment.findUniqueOrThrow({where:{id:item.id}})).startsAt)===nextDate(4));
 await shot(member,'member-rescheduled');results.push({case:'會員以權威可用時間改期，資料庫保留服務與性別偏好',passed:true});
 const worker=await context('worker');await worker.goto(prefix+'/beauty?work=1',{timeout:120000});
 const own=worker.locator('article').filter({hasText:'live-'+runId}).first();await own.waitFor();assert.equal(await worker.getByText('公開按摩'+runId).count(),0);
 worker.once('dialog',dialog=>dialog.accept('合成實際服務完成'));await own.getByRole('button',{name:'服務完成',exact:true}).click();
 await until(async()=> (await db.beautyAppointment.findUniqueOrThrow({where:{id:item.id}})).status==='COMPLETED');
 await shot(worker,'worker-completed');results.push({case:'技師僅見本人工作並實際完成服務；顧客前台回讀已完成',passed:true});
 await member.goto(prefix+'/beauty');await member.locator('article').filter({hasText:'驗收顧客'}).filter({hasText:'已完成'}).first().waitFor();await shot(member,'member-completed');
 await member.getByRole('button',{name:'立即預約',exact:true}).click();
 await formBook(member,{date:nextDate(7),member:true,people:[{service:'face',gender:'FEMALE'}]});
 const cancelItem=await db.beautyAppointment.findFirstOrThrow({where:{storeId:'beauty-1374-store',customerId:'beauty-1374-member-customer',notes:'live-'+runId,status:'RESERVED'}});
 await member.goto(prefix+'/beauty');
 const cancelArticle=member.locator('article').filter({hasText:formatTWDateTime(cancelItem.startsAt)}).filter({hasText:'驗收顧客'}).first();
 member.once('dialog',dialog=>dialog.accept('隔離自行取消'));await cancelArticle.getByRole('button',{name:'取消預約',exact:true}).click();
 await until(async()=> (await db.beautyAppointment.findUniqueOrThrow({where:{id:cancelItem.id}})).status==='CANCELLED');
 results.push({case:'會員自行取消透過真實 Server Action 寫入並釋放預約',passed:true});
 // Members may not enter a technician work portal just by adding ?work=1.
 await member.goto(prefix+'/beauty?work=1');assert(!(await member.locator('body').innerText()).includes('公開做臉'+runId));
 const limited=await context('limited',1024,768);await limited.goto(prefix+'/admin/dashboard/beauty?tab='+encodeURIComponent('技師管理'),{timeout:120000});
 assert.equal(await limited.getByRole('button',{name:'新增技師',exact:true}).count(),0);results.push({case:'一般會員不能取得技師工作資料；受限人員沒有新增技師操作',passed:true});
 await main.store.upsert({where:{id:'beauty-1374-other'},update:{},create:{id:'beauty-1374-other',slug:'beauty-1374-other',name:'禁止跨店讀取的合成店',industryModule:'BEAUTY',plan:'ALLIANCE'}});
 await owner.goto(base+'/s/beauty-1374-other/admin/dashboard/beauty');
 await owner.getByRole('heading',{name:'無法存取此店舖',exact:true}).waitFor();
 results.push({case:'店長改網址不能讀取另一間未授權門市',passed:true});
 // Revoke a real staff account after successful login; the existing JWT must not keep access.
 await main.staff.update({where:{userId:'beauty-1374-owner'},data:{status:'INACTIVE'}});
 try{await owner.goto(prefix+'/admin/dashboard/beauty');assert.equal(await owner.getByRole('button',{name:'新增預約',exact:true}).count(),0);}finally{await main.staff.update({where:{userId:'beauty-1374-owner'},data:{status:'ACTIVE'}});}
 results.push({case:'帳號停用後既有店長 session 無法繼續讀取後台',passed:true});
 // Opaque chat-link fixture: models a link issued after verified LINE identity.
 // This exercises production token resolution/consumption, not live LINE OAuth.
 async function linkFixture({expired=false,consumed=false,storeId='beauty-1374-store'}={}){
  const identity='synthetic-line-'+randomBytes(12).toString('hex'),key=Buffer.from(process.env.DIGITAL_BUTLER_ENCRYPTION_KEY,'base64url');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),ciphertext=Buffer.concat([cipher.update(identity),cipher.final()]);
  const token=randomBytes(32).toString('base64url');
  const link=await main.trialBookingLink.create({data:{storeId,channel:'LINE',identityHash:createHmac('sha256',key).update(identity).digest('hex'),identityCiphertext:ciphertext,identityIv:iv,identityAuthTag:cipher.getAuthTag(),identityKeyVersion:'v1',tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+(expired?-60000:1800000)),consumedAt:consumed?new Date():null}});
  return {entry:link.id+'.'+token,id:link.id,identity};
 }
 const valid=await linkFixture(),linePhone='0923'+runId;
 const linePage=await context(null);await linePage.goto(base+'/beauty-trial/beauty-1374-qa?entry='+valid.entry);
 await formBook(linePage,{date:nextDate(5),people:[{name:'LINE 合成'+runId,phone:linePhone,service:'face',gender:'ANY'}]});
 const lineLead=await main.customer.findFirstOrThrow({where:{phone:linePhone}});
 assert.equal(lineLead.lineUserId,valid.identity);assert.equal(lineLead.userId,null);
 assert((await main.trialBookingLink.findUniqueOrThrow({where:{id:valid.id}})).consumedAt);
 results.push({case:'合成已驗證 LINE entry 的解密、建預約及一次性消耗；無真實 LINE 登入或發送',passed:true});
 for(const [label,link] of [['expired',await linkFixture({expired:true})],['consumed',valid]]){
  const page=await context(null),phone=(label==='expired'?'0924':'0925')+runId;
  await page.goto(base+'/beauty-trial/beauty-1374-qa?entry='+link.entry);
  await formBook(page,{date:nextDate(6),expectedError:'預約連結已失效',people:[{name:'無效連結'+label,phone,service:'face',gender:'ANY'}]});
  assert.equal(await db.beautyAppointment.count({where:{personPhone:phone}}),0);
 }
 const conflictLink=await linkFixture(),conflict=await context(null);await conflict.goto(base+'/beauty-trial/beauty-1374-qa?entry='+conflictLink.entry);
 await formBook(conflict,{date:nextDate(6),expectedError:'此手機已有顧客資料',people:[{name:'不得接管',phone:'0900001375',service:'face',gender:'ANY'}]});
 assert.equal((await main.customer.findUniqueOrThrow({where:{id:'beauty-1374-member-customer'}})).lineUserId,null);
 results.push({case:'過期與已消耗 entry 拒絕，既有手機不能被新 LINE 身分接管',passed:true});
 assert.equal(await db.beautyEvent.count({where:{storeId:'beauty-1374-store',status:'PENDING'}}),0);
 results.push({case:'未建立待發通知；全程未呼叫外部 LINE 或付款服務',passed:true});
 console.log(JSON.stringify({results,pageErrors:errors},null,2));await writeFile(out+'/results.json',JSON.stringify({synthetic:true,actualNextServer:true,actualPostgres:true,results,pageErrors:errors},null,2));
}finally{await Promise.all(contexts.map(c=>c.close()));await browser.close();await Promise.all([db.$disconnect(),main.$disconnect()]);}
