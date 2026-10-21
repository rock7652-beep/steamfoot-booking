// Authenticated Next -> query -> disposable loopback PostgreSQL -> CSV acceptance.
// Requires the isolated schema/owners from image-announcements-live.mjs seed and its dev server.
// Never imports production env files or changes real stores.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { IMAGE_ACCEPTANCE_DATABASE, IMAGE_ACCEPTANCE_ORIGIN as base, assertImageAnnouncementsAcceptance } from '../image-announcements-acceptance-scope.mjs';
const require=createRequire(import.meta.url);
const {PrismaClient}=require('@prisma/client');
const {PrismaClient:CourseClient}=require('../../generated/course-client');
const {chromium}=require('/tmp/customer-consumption-preview/node_modules/playwright-core');
assertImageAnnouncementsAcceptance({...process.env,NODE_ENV:'development',IMAGE_ANNOUNCEMENTS_ACCEPTANCE:'1',DATABASE_URL:IMAGE_ACCEPTANCE_DATABASE,DIRECT_URL:IMAGE_ACCEPTANCE_DATABASE,AUTH_URL:base,NEXTAUTH_URL:base});
const db=new PrismaClient({datasourceUrl:IMAGE_ACCEPTANCE_DATABASE}),course=new CourseClient({datasourceUrl:IMAGE_ACCEPTANCE_DATABASE});
const out=path.resolve('artifacts/customer-consumption-live');mkdirSync(out,{recursive:true});
const results=[];let browser;
const date=new Date('2026-10-20T00:00:00Z'),at=new Date('2026-10-20T04:00:00Z');
async function step(name,run){const details=await run();results.push({name,passed:true,...details});writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:false,results},null,2));console.log(name+': passed');}
async function seed(){
  assert.equal(await db.store.count({where:{id:{in:['image-qa-a','image-qa-b']}}}),2);
  assert.equal(await db.servicePlan.count({where:{id:'consumption-live-plan'}}),0,'Dedicated fixture already exists; do not overwrite');
  for(const storeId of ['image-qa-a','image-qa-b']){
    for(const featureKey of ['customer_care','data_export','customer_management','basic_booking','plan_management','transaction','transaction_management']) await db.storeFeatureEntitlement.upsert({where:{uq_store_feature_entitlement:{storeId,featureKey}},create:{storeId,featureKey,status:'ENABLED'},update:{status:'ENABLED'}});
  }
  await db.user.create({data:{id:'consumption-live-staff-user',name:'合成副店長',role:'STAFF'}});
  await db.staff.create({data:{id:'consumption-live-staff',storeId:'image-qa-a',userId:'consumption-live-staff-user',displayName:'合成副店長'}});
  await db.customer.create({data:{id:'consumption-live-second',storeId:'image-qa-a',name:'合成第二顧客',phone:'0900000401',assignedStaffId:'consumption-live-staff'}});
  await db.customer.create({data:{id:'consumption-live-zero',storeId:'image-qa-a',name:'合成未指派顧客',phone:'0900000402'}});
  await db.servicePlan.create({data:{id:'consumption-live-plan',storeId:'image-qa-a',name:'合成堂數方案',category:'PACKAGE',price:1000,sessionCount:10}});
  await db.customerPlanWallet.create({data:{id:'consumption-live-wallet',storeId:'image-qa-a',customerId:'image-qa-customer-a',planId:'consumption-live-plan',purchasedPrice:1000,totalSessions:10,remainingSessions:8,startDate:date,expiryDate:new Date('2027-01-01')}});
  await db.booking.create({data:{id:'consumption-live-booking',storeId:'image-qa-a',customerId:'image-qa-customer-a',bookingDate:date,slotTime:'12:00',bookingStatus:'COMPLETED',servicePlanId:'consumption-live-plan',customerPlanWalletId:'consumption-live-wallet'}});
  for(let i=1;i<=2;i++)await db.walletSession.create({data:{walletId:'consumption-live-wallet',sessionNo:i,status:'COMPLETED',bookingId:'consumption-live-booking',completedAt:at}});
  await db.transaction.create({data:{id:'consumption-live-payment',storeId:'image-qa-a',customerId:'image-qa-customer-a',bookingId:'consumption-live-booking',planId:'consumption-live-plan',revenueStaffId:'image-qa-staff-a',transactionType:'SINGLE_PURCHASE',amount:200,paidAt:at,createdAt:at}});
  await db.transaction.create({data:{id:'consumption-live-second-payment',storeId:'image-qa-a',customerId:'consumption-live-second',planId:'consumption-live-plan',revenueStaffId:'image-qa-staff-a',transactionType:'SINGLE_PURCHASE',amount:500,paidAt:at,createdAt:at}});
  await db.store.update({where:{id:'image-qa-b'},data:{industryModule:'COURSE'}});
  await course.courseRoom.create({data:{id:'consumption-live-room',storeId:'image-qa-b',name:'合成教室'}});
  await course.courseTemplate.create({data:{id:'consumption-live-template',storeId:'image-qa-b',name:'合成課程',durationMinutes:60,pointCost:3,capacity:10}});
  await course.courseSession.create({data:{id:'consumption-live-session',storeId:'image-qa-b',templateId:'consumption-live-template',roomId:'consumption-live-room',coachId:'image-qa-staff-b',nameSnapshot:'合成課程',startsAt:at,endsAt:new Date(at.valueOf()+3600000),pointCost:3,capacity:10,requestKey:'consumption-live-session',requestIndex:0,createdById:'image-qa-owner-b'}});
  await course.coursePointPlan.create({data:{id:'consumption-live-course-plan',storeId:'image-qa-b',name:'合成點數卡',points:10,price:1000,validDays:90}});
  await course.coursePointCard.create({data:{id:'consumption-live-card',storeId:'image-qa-b',planId:'consumption-live-course-plan',nameSnapshot:'合成點數卡',unit:'POINT',remaining:7,expiresAt:new Date('2027-01-01'),requestKey:'consumption-live-card',members:{create:{customerId:'image-qa-customer-b'}}}});
  await course.courseBooking.create({data:{id:'consumption-live-course-booking',storeId:'image-qa-b',sessionId:'consumption-live-session',cardId:'consumption-live-card',customerId:'image-qa-customer-b',customerName:'驗收顧客 b',operatorUserId:'image-qa-owner-b',operatorName:'驗收店長 b',pointCost:3,status:'NO_SHOW',requestKey:'consumption-live-course-booking'}});
}
async function login(key){
  const context=await browser.newContext({viewport:{width:1366,height:900}});
  await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===base||u.protocol==='data:'?route.continue():route.abort();});
  const page=await context.newPage();page.setDefaultTimeout(90000);
  await page.goto(`${base}/hq/login?store=image-qa-${key}`);
  await page.getByLabel('Email',{exact:true}).fill(`image-owner-${key}@example.invalid`);
  await page.getByLabel('密碼',{exact:true}).fill('image-qa-only-password');
  await page.getByRole('button',{name:'登入',exact:true}).click();
  await page.waitForURL(`**/s/image-qa-${key}/admin/dashboard`);
  const url=`${base}/s/image-qa-${key}/admin/dashboard/growth/consumption?preset=custom&startDate=2026-10-20&endDate=2026-10-20`;
  await page.goto(url);await page.getByRole('columnheader',{name:'所屬店長',exact:true}).waitFor();
  return {page,context,url};
}
try{
  await step('seed-disposable-stores',async()=>{if(process.argv.includes('--resume')){assert.equal(await db.servicePlan.count({where:{id:'consumption-live-plan'}}),1);assert.equal((await course.courseBooking.findUniqueOrThrow({where:{id:'consumption-live-course-booking'}})).status,'NO_SHOW');}else await seed();return{loopbackOnly:true,realStoresTouched:false}});
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
  const steam=await login('a');
  await step('steamfoot-real-login-query-and-csv',async()=>{
    assert.equal(await steam.page.locator('tbody tr').count(),3);
    const row=steam.page.locator('tbody tr').filter({hasText:'驗收顧客 a'});
    const cells=await row.locator('td').allTextContents();assert.equal(cells[2],'1');assert.equal(cells[3],'2');assert.equal(cells[4],'NT$ 200');assert.equal(cells[5],'NT$ 200');
    const csvUrl=await steam.page.getByRole('link',{name:'匯出名單 CSV'}).getAttribute('href');
    const response=await steam.context.request.get(`${base}${csvUrl}`);assert.equal(response.status(),200);
    const text=await response.text();assert.ok(text.includes('合成第二顧客'));assert.ok(text.includes('合成副店長'));assert.ok(!text.includes('驗收顧客 b'));
    await steam.page.screenshot({path:path.join(out,'steamfoot-desktop.png')});return{rows:3,oneServiceTwoSlots:true,consumed:200,paid:200,csvStatus:200,crossStoreExcluded:true};
  });
  await step('manager-filter-real-response',async()=>{
    await steam.page.getByRole('button',{name:/^篩選/}).click();await steam.page.getByRole('combobox',{name:'所屬店長',exact:true}).selectOption('consumption-live-staff');
    await steam.page.getByRole('button',{name:'套用篩選',exact:true}).click();await steam.page.waitForURL(/staffId=consumption-live-staff/);
    await steam.page.getByText('合成第二顧客',{exact:true}).waitFor();assert.equal(await steam.page.locator('tbody tr').count(),1);
    const response=await steam.context.request.get(`${base}${await steam.page.getByRole('link',{name:'匯出名單 CSV'}).getAttribute('href')}`);
    const csv=await response.text();assert.ok(csv.includes('"所屬店長條件","合成副店長"'));assert.ok(!csv.includes('驗收顧客 a'));
    const denied=await steam.context.request.get(`${base}/api/export/customer-consumption-summary?staffId=image-qa-staff-b`);assert.equal(denied.status(),400);
    await steam.page.setViewportSize({width:768,height:1024});await steam.page.screenshot({path:path.join(out,'steamfoot-manager-ipad.png')});assert.equal(await steam.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    return{rows:1,selectedManagerCsv:true,foreignManagerStatus:400};
  });
  await step('course-charged-no-show-and-reversal',async()=>{
    const c=await login('b');const row=c.page.locator('tbody tr').filter({hasText:'驗收顧客 b'});const cells=await row.locator('td').allTextContents();assert.equal(cells[2],'1');assert.equal(cells[3],'3');
    await c.page.getByRole('button',{name:/^篩選/}).click();await c.page.getByRole('combobox',{name:'曠課／請假扣除',exact:true}).selectOption('0');await c.page.getByRole('button',{name:'套用篩選',exact:true}).click();await c.page.waitForURL(/includeAbsent=0/);
    await c.page.getByRole('columnheader',{name:'所屬店長',exact:true}).waitFor();assert.equal((await c.page.locator('tbody tr td').allTextContents())[2],'0');
    await course.courseBooking.update({where:{id:'consumption-live-course-booking'},data:{status:'RESERVED'}});
    await c.page.goto(c.url);await c.page.getByRole('columnheader',{name:'所屬店長',exact:true}).waitFor();assert.equal((await c.page.locator('tbody tr td').allTextContents())[2],'0');
    await c.page.setViewportSize({width:1024,height:768});await c.page.screenshot({path:path.join(out,'course-ipad.png')});await c.context.close();return{chargedNoShowCount:1,chargedPoints:3,excludeNoShowCount:0,reversalCount:0};
  });
  await steam.context.close();
  writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:true,scope:'real credentials login -> Next server -> disposable PostgreSQL -> rendered table and CSV',results,limitations:['Synthetic records, not Youngsky production records','Physical iPad/Safari and production deployment not verified']},null,2));
}catch(error){console.error(error);writeFileSync(path.join(out,'failure.txt'),String(error));process.exitCode=1;}
finally{if(browser)await browser.close();await Promise.all([db.$disconnect(),course.$disconnect()]);}
