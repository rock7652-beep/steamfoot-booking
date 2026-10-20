/** Real HTTPS UI + restricted DB readback. Writes only through real UI actions. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {assertBeautySandboxQaEnvironment,BEAUTY_SANDBOX_ORIGIN as base} from '../beauty-sandbox-qa-scope.mjs';
assertBeautySandboxQaEnvironment(process.env);
const require=createRequire(import.meta.url);
const {PrismaClient}=require('../../generated/beauty-client');
const {PrismaClient:MainClient}=require('@prisma/client');
const {toLocalDateStr,addTaiwanDuration,toLocalMonthStr}=require('../../src/lib/date-utils.ts');
const {chromium}=await import(process.env.QA_PLAYWRIGHT_MODULE??'/tmp/beauty-browser/node_modules/playwright/index.mjs');
const password=process.env.QA_BEAUTY_REVIEW_PASSWORD;
assert(password,'Provide staging password through the command environment');
const db=new PrismaClient(),main=new MainClient(),storeId='beauty-1374-store';
const prefix=base+'/s/beauty-1374-qa',dashboard=prefix+'/admin/dashboard/beauty';
const runId=randomUUID().slice(0,8),marker='commerce-'+runId;
const out=process.env.QA_BEAUTY_COMMERCE_OUTPUT??'/tmp/beauty-sandbox-commerce/'+runId;
await mkdir(out,{recursive:true});
const started=new Date(),results=[],pageErrors=[],contexts=[];
const day=addTaiwanDuration(toLocalDateStr(),6,'DAY'),month=day.slice(0,7);
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_EXECUTABLE??'/usr/bin/google-chrome',args:['--no-sandbox']});
let stage='start';
async function pageFor(width=1024,height=768){
 const c=await browser.newContext({viewport:{width,height}});contexts.push(c);
 await c.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 const p=await c.newPage();p.setDefaultTimeout(45000);p.on('pageerror',e=>pageErrors.push(e.message.split('\n')[0]));return p;
}
async function until(fn){for(let i=0;i<60;i++){const r=await fn();if(r)return r;await new Promise(resolve=>setTimeout(resolve,250));}throw Error('DB readback timed out: '+stage);}
function pass(label){results.push({case:label,passed:true});console.log(JSON.stringify(results.at(-1)));}
async function shot(p,name){await p.waitForLoadState('networkidle');assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:out+'/'+name+'.png',fullPage:true});}
async function tab(p,label){await p.goto(dashboard+'?tab='+encodeURIComponent(label)+'&date='+day+'&month='+month);await p.waitForLoadState('networkidle');}
async function money(p,amount,note=marker){const panel=p.getByRole('dialog');await panel.getByLabel('金額',{exact:true}).fill(String(amount));await panel.getByLabel('付款方式').selectOption('BANK_TRANSFER');await panel.getByLabel('原因／備註').fill(note);return panel;}
async function submit(panel){await panel.getByRole('button',{name:'確認',exact:true}).click();await panel.waitFor({state:'hidden'});}
async function booking(p,{customerId,cardId=null,note}){
 await tab(p,'首頁');await p.getByRole('button',{name:'新增預約',exact:true}).click();const panel=p.getByRole('dialog');
 await panel.getByLabel('服務者').selectOption(customerId);
 await panel.getByLabel('服務項目').selectOption('beauty-1374-face');
 await panel.getByLabel('技師性別（必選）').selectOption('FEMALE');
 if(cardId)await panel.getByLabel('付款／方案').selectOption(cardId);
 await panel.getByLabel('本次備註（選填）').fill(note);
 await panel.getByLabel('聯絡人姓名',{exact:true}).fill('合成帳務驗收');await panel.getByLabel('聯絡人手機',{exact:true}).fill('0900001375');
 await panel.getByLabel('共同日期').fill(day);await panel.getByRole('button',{name:'查詢共同可用時間',exact:true}).click();
 const times=panel.getByLabel('共同開始時間');await times.waitFor();const opts=await times.locator('option').allTextContents();assert(opts.length>1);await times.selectOption(opts[1]);
 await panel.getByRole('button',{name:'確認預約',exact:true}).click();await panel.getByRole('heading',{name:'預約成功',exact:true}).waitFor();await panel.getByRole('button',{name:'關閉',exact:true}).click();
 return until(()=>db.beautyAppointment.findFirst({where:{storeId,notes:note}}));
}
async function status(p,note,label){p.once('dialog',d=>d.accept(marker));await p.locator('article').filter({hasText:note}).getByRole('button',{name:label,exact:true}).click();}
try{
 stage='owner login';const owner=await pageFor();await owner.goto(base+'/hq/login?store=beauty-1374-qa');await owner.getByLabel('Email',{exact:true}).fill('owner@beauty-1374.invalid');await owner.getByLabel('密碼',{exact:true}).fill(password);await owner.getByRole('button',{name:'登入',exact:true}).click();await owner.getByRole('button',{name:'新增預約',exact:true}).waitFor();
 stage='create family';await tab(owner,'顧客管理');await owner.getByRole('button',{name:'新增顧客',exact:true}).click();let panel=owner.getByRole('dialog');await panel.getByLabel('姓名',{exact:true}).fill(marker);const phone='094'+String(Date.now()).slice(-7);await panel.getByLabel('手機',{exact:true}).fill(phone);await panel.getByLabel('備註',{exact:true}).fill(marker);await panel.getByRole('button',{name:'儲存',exact:true}).click();await panel.waitFor({state:'hidden'});
 const family=await main.customer.findFirstOrThrow({where:{storeId,phone}});
 stage='purchase shared card';const customer=owner.locator('details').filter({has:owner.locator('summary').filter({hasText:'驗收顧客'})});await customer.locator('summary').click();await customer.getByRole('button',{name:'購買方案',exact:true}).click();panel=await money(owner,1000);await panel.locator('select[name="planId"]').selectOption('beauty-1374-plan');await panel.locator('input[name="memberIds"][value="'+family.id+'"]').check();
 await shot(owner,'purchase-ipad');await owner.setViewportSize({width:1440,height:900});await shot(owner,'purchase-desktop');await owner.setViewportSize({width:390,height:844});await shot(owner,'purchase-phone');await owner.setViewportSize({width:1024,height:768});await submit(panel);
 const card=await db.beautyCard.findFirstOrThrow({where:{storeId,memberIds:{has:family.id},createdAt:{gte:started}}});assert.equal(card.remaining,1);assert(card.memberIds.includes('beauty-1374-member-customer'));assert.equal(await db.beautyLedger.count({where:{storeId,cardId:card.id,kind:'GRANT',delta:1}}),1);pass('真實後台售出具名家人共用方案；桌機／iPad／手機表單無整頁溢出');
 stage='shared reservation';const held=await booking(owner,{customerId:family.id,cardId:card.id,note:marker+'-held'});assert.equal(held.cardId,card.id);assert.equal((await db.beautyCard.findUniqueOrThrow({where:{id:card.id}})).remaining,1);
 await tab(owner,'顧客管理');const familyRow=owner.locator('details').filter({has:owner.locator('summary').filter({hasText:marker})});await familyRow.locator('summary').click();await familyRow.getByText(/剩餘1次.*已預約1次.*可用0次/).waitFor();pass('家人可使用同一方案，預約先預留且顯示可用0次、不提前扣次');
 stage='cancel releases hold';await tab(owner,'首頁');await status(owner,marker+'-held','取消');await until(async()=> (await db.beautyAppointment.findUniqueOrThrow({where:{id:held.id}})).status==='CANCELLED');assert.equal((await db.beautyCard.findUniqueOrThrow({where:{id:card.id}})).remaining,1);assert.equal(await db.beautyLedger.count({where:{storeId,appointmentId:held.id,delta:{not:0}}}),0);pass('取消不扣次：預留釋放、餘額保留、沒有錯誤扣次帳本');
 stage='complete shared service';const shared=await booking(owner,{customerId:family.id,cardId:card.id,note:marker+'-shared'});
 const worker=await pageFor(390,844);await worker.goto(prefix+'/');await worker.getByLabel('手機號碼',{exact:true}).fill('0900001376');await worker.getByRole('button',{name:'下一步',exact:true}).click();await worker.getByLabel('密碼',{exact:true}).fill(password);await worker.getByRole('button',{name:'登入',exact:true}).click();await worker.getByRole('button',{name:'立即預約',exact:true}).waitFor();await worker.getByRole('link',{name:'我的工作',exact:true}).click();await status(worker,marker+'-shared','服務完成');await until(async()=> (await db.beautyAppointment.findUniqueOrThrow({where:{id:shared.id}})).status==='COMPLETED');
 assert.equal((await db.beautyCard.findUniqueOrThrow({where:{id:card.id}})).remaining,0);assert.equal(await db.beautyLedger.count({where:{storeId,appointmentId:shared.id,delta:-1}}),1);const done=await db.beautyAppointment.findUniqueOrThrow({where:{id:shared.id}});assert.equal(done.fee,500);assert.equal(done.technicianId,'beauty-1374-female');await shot(worker,'shared-technician');pass('實際技師完成家人服務，只扣1次；方案百分比拆帳500元歸屬實際技師');
 stage='single payment';const single=await booking(owner,{customerId:'beauty-1374-member-customer',note:marker+'-single'});await owner.locator('article').filter({hasText:marker+'-single'}).getByRole('button',{name:'收款',exact:true}).click();panel=owner.getByRole('dialog');await panel.locator('input[type="number"]').fill('800');await panel.getByLabel('付款方式').selectOption('BANK_TRANSFER');await panel.getByLabel('原因／備註').fill(marker+'-sale');await submit(panel);await status(owner,marker+'-single','服務完成');await until(async()=> (await db.beautyAppointment.findUniqueOrThrow({where:{id:single.id}})).status==='COMPLETED');assert.equal((await db.beautyAppointment.findUniqueOrThrow({where:{id:single.id}})).fee,400);pass('單次服務實收800元，完成後依實收50%產生400元拆帳');
 stage='confirm and pay settlement';await tab(owner,'營運');const confirmedAction=owner.waitForResponse(r=>r.request().headers()['next-action']!==undefined);await owner.getByRole('button',{name:'確認本月拆帳',exact:true}).click();const confirmResponse=await confirmedAction;assert.equal(confirmResponse.status(),200);await owner.waitForLoadState('networkidle');await writeFile(out+'/confirm-response.txt',await confirmResponse.text());await until(async()=> !!await db.beautySettlement.findFirst({where:{storeId,month,createdAt:{gte:started}}}));await owner.getByRole('button',{name:'更新',exact:true}).click();
 const {formatTWDateTime}=require('../../src/lib/date-utils.ts');const line=owner.locator('div.border-b').filter({hasText:'應付400／已付0'}).filter({hasText:formatTWDateTime(single.startsAt)});await line.getByRole('button',{name:'登錄付款',exact:true}).click();panel=await money(owner,300,marker+'-fee');await submit(panel);
 const fee=await until(()=>db.beautyPayment.findFirst({where:{storeId,appointmentId:single.id,kind:'FEE'}}));assert.equal(fee.amount,300);assert.equal(fee.technicianId,'beauty-1374-female');pass('月結確認後登錄部分拆帳付款300元，技師與原服務連結正確');
 stage='fee recovery';const feeRow=owner.locator('div.border-b').filter({hasText:marker+'-fee'});await feeRow.getByRole('button',{name:'登錄拆帳收回',exact:true}).click();panel=await money(owner,300,marker+'-recovery');await submit(panel);const recovered=await db.beautyPayment.findFirstOrThrow({where:{storeId,originalPaymentId:fee.id,kind:'FEE_VOID'}});assert.equal(recovered.amount,-300);pass('拆帳收回追加反向紀錄，保留原付款與原技師');
 stage='refund single';await tab(owner,'首頁');await status(owner,marker+'-single','取消');await until(async()=> (await db.beautyAppointment.findUniqueOrThrow({where:{id:single.id}})).status==='CANCELLED');await tab(owner,'營運');const sale=await db.beautyPayment.findFirstOrThrow({where:{storeId,appointmentId:single.id,kind:'SALE'}});await owner.locator('div.border-b').filter({hasText:marker+'-sale'}).getByRole('button',{name:'登錄退款',exact:true}).click();panel=await money(owner,800,marker+'-refund');await submit(panel);await shot(owner,'refund-ipad');await owner.setViewportSize({width:768,height:1024});await shot(owner,'settlement-ipad-portrait');await owner.setViewportSize({width:1366,height:900});await shot(owner,'settlement-desktop');await owner.setViewportSize({width:1920,height:1080});await shot(owner,'settlement-wide');await owner.setViewportSize({width:390,height:844});await shot(owner,'settlement-phone');
 const payments=await db.beautyPayment.findMany({where:{storeId,appointmentId:single.id}});assert.equal(payments.length,4);assert.equal(payments.reduce((s,p)=>s+p.amount,0),0);assert(payments.some(p=>p.kind==='REFUND'&&p.amount===-800&&p.originalPaymentId===sale.id));
 const cashbook=await main.cashbookEntry.findMany({where:{storeId,id:{in:payments.map(p=>'beauty:'+p.id)}}});assert.equal(cashbook.length,4);assert.equal(cashbook.reduce((n,c)=>n+(c.type==='INCOME'?Number(c.amount):-Number(c.amount)),0),0);assert(cashbook.every(c=>c.paymentMethod==='OTHER'));pass('取消服務後退款800元；收款、拆帳付款、收回與退款4筆原始紀錄及共用收支帳淨額均為0');
 assert.equal(await db.beautyEvent.count({where:{storeId,status:'PENDING'}}),0);assert.equal(pageErrors.length,0);
 await writeFile(out+'/database-verification.json',JSON.stringify({synthetic:true,runId,card:{sessions:1,remaining:0,debits:1,sharedWithNamedFamily:true},sharedService:{fee:500,technicianId:done.technicianId},singleService:{feeBeforeCancellation:400,status:'CANCELLED',paymentKinds:payments.map(p=>p.kind).sort(),cashbookEntries:cashbook.length,net:0},pendingNotifications:0},null,2));
}catch(e){console.error(JSON.stringify({stage,error:e.message.trim().split('\n')[0]}));for(const [i,c] of contexts.entries())for(const p of c.pages())try{await writeFile(out+'/failure-'+i+'.txt',await p.locator('body').innerText({timeout:3000}));}catch{}process.exitCode=1;}
finally{
 await writeFile(out+'/results.json',JSON.stringify({origin:base,synthetic:true,runId,stage,passed:process.exitCode!==1,results,pageErrors,limitations:['No real LINE login or delivery','Bank transfer registration only; no real transfer','No physical Safari device','No cash-drawer UI in this run'],month,executionMonth:toLocalMonthStr()},null,2));
 await Promise.all(contexts.map(c=>c.unrouteAll({behavior:'ignoreErrors'})));await Promise.all(contexts.map(c=>c.close()));await browser.close();await Promise.all([db.$disconnect(),main.$disconnect()]);console.log(JSON.stringify({output:out,passed:process.exitCode!==1}));
}
