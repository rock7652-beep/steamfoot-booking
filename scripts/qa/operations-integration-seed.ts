/** Only the exact disposable loopback database is accepted. */
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {PrismaClient} from '@prisma/client';
import {PrismaClient as CourseClient} from '../../generated/course-client';
import {PrismaClient as BeautyClient} from '../../generated/beauty-client';
import {hashSync} from 'bcryptjs';
import {assertSportsLiveFlowQaEnvironment} from '../sports-live-flow-qa-scope.mjs';
import {toLocalDateStr} from '../../src/lib/date-utils';
assertSportsLiveFlowQaEnvironment(process.env);
const db=new PrismaClient(),course=new CourseClient(),beauty=new BeautyClient();
async function installFinanceScope(){
 const found=await db.$queryRaw<{present:string|null}[]>`SELECT to_regclass('public."CourseTeacherFinanceScope"')::text AS present`;
 if(!found[0]?.present)execFileSync('node_modules/.bin/prisma',['db','execute','--url',process.env.DATABASE_URL!,'--stdin'],{input:readFileSync('supabase/migrations/20260929044152_music_teacher_finance_scope.sql','utf8'),stdio:['pipe','pipe','pipe']});
}
async function installSteamPurchase(){
 const storeId="ops-steam",customerId=storeId+"-customer",staffId=storeId+"-staff",today=toLocalDateStr();
 if(await db.transaction.findUnique({where:{id:storeId+"-package"}}))return;
 const plan=await db.servicePlan.create({data:{id:storeId+"-plan",storeId,name:"驗收五堂套餐",category:"PACKAGE",price:5000,sessionCount:5}});
 const wallet=await db.customerPlanWallet.create({data:{id:storeId+"-wallet",storeId,customerId,planId:plan.id,purchasedPrice:5000,totalSessions:5,remainingSessions:5,startDate:new Date(today)}});
 await db.walletSession.createMany({data:Array.from({length:5},(_,index)=>({walletId:wallet.id,sessionNo:index+1}))});
 await db.transaction.create({data:{id:storeId+"-package",storeId,customerId,revenueStaffId:staffId,serviceStaffId:staffId,transactionType:"PACKAGE_PURCHASE",paymentMethod:"CASH",amount:5000,grossAmount:5000,netAmount:5000,planNameSnapshot:plan.name,planType:"PACKAGE",planId:plan.id,customerPlanWalletId:wallet.id,paidAt:new Date()}});
 await db.transaction.update({where:{id:storeId+"-sale"},data:{bookingId:storeId+"-booking"}});
}
async function installBeautyRefundCase(){
 const storeId="ops-beauty",id=storeId+"-cancelled",today=toLocalDateStr();
 if(await beauty.beautyAppointment.findUnique({where:{id}}))return;
 const start=new Date(today+"T03:00:00+08:00"),end=new Date(today+"T04:00:00+08:00");
 await beauty.beautyAppointment.create({data:{id,storeId,groupId:storeId+"-group",customerId:storeId+"-customer",personName:"美業隔離驗收顧客",personPhone:"0900990013",serviceId:storeId+"-service",serviceName:"驗收已取消服務",technicianId:storeId+"-tech",locationId:storeId+"-room",preference:"ANY",startsAt:start,endsAt:end,occupiedEndsAt:end,duration:60,buffer:0,price:1900,isTrial:false,status:"CANCELLED",rate:{mode:"CLASS",value:0},fee:0,cancelDeduct:false,noShowDeduct:false}});
 const payment=await beauty.beautyPayment.create({data:{id:storeId+"-cancel-sale",storeId,appointmentId:id,kind:"SALE",amount:1900,method:"CASH",note:"隔離取消服務原收款",actorUserId:storeId+"-owner"}});
 await db.cashbookEntry.create({data:{id:"beauty:"+payment.id,storeId,type:"INCOME",category:"服務收入",amount:1900,paymentMethod:"CASH",entryDate:new Date(today),createdByUserId:storeId+"-owner",staffId:storeId+"-staff",customerId:storeId+"-customer"}});
}
async function main(){
 if(process.argv.includes('--beauty-refund')){await installBeautyRefundCase();console.log('Isolated cancelled beauty service prepared');return;}
 if(process.argv.includes('--steam-purchase')){await installSteamPurchase();console.log('Isolated steam purchase prepared');return;}
 if(process.argv.includes('--schema-only')){await installFinanceScope();console.log('Isolated finance scope installed');return;}

 if(await db.store.count({where:{id:{not:'sports-live-flow-store'}}}))throw Error('Only a freshly initialized QA database is accepted');
 const sql=execFileSync('node_modules/.bin/prisma',['migrate','diff','--from-empty','--to-schema-datamodel','beauty-prisma/schema.prisma','--script'],{encoding:'utf8'});
 execFileSync('node_modules/.bin/prisma',['db','execute','--url',process.env.DATABASE_URL!,'--stdin'],{input:sql,stdio:['pipe','pipe','pipe']});
 await installFinanceScope();
 const features=['basic_booking','customer_management','staff_management','transaction','transaction_management','plan_management','cashbook','cash_drawer','reconciliation','basic_reports','store_revenue','data_export','service_fee_calculator'];
 const today=toLocalDateStr(),start=new Date(today+'T01:00:00+08:00'),end=new Date(today+'T02:00:00+08:00');
 for(const key of ['sports','music','dance','beauty','steam'] as const){
  const storeId=key==='sports'?'sports-live-flow-store':'ops-'+key,slug=key==='sports'?'sports-live-flow':'ops-'+key,userId=key==='sports'?'sports-live-flow-owner':storeId+'-owner',staffId=key==='sports'?'sports-live-flow-staff':storeId+'-staff';
  const label={sports:'運動',music:'音樂',dance:'舞蹈',beauty:'美業',steam:'蒸足'}[key]!;
  if(key!=='sports'){
   await db.store.create({data:{id:storeId,slug,name:label+'隔離帳務驗收店',industryModule:key==='beauty'?'BEAUTY':key==='steam'?'STEAMFOOT':'COURSE',plan:'ALLIANCE'}});
   await db.user.create({data:{id:userId,email:storeId+'@example.invalid',name:label+'驗收老闆',role:'OWNER',passwordHash:hashSync('isolated-sports-test-only',10)}});
   await db.staff.create({data:{id:staffId,storeId,userId,displayName:label+'驗收老師',isOwner:true,courseCoachEnabled:true,courseQualificationsConfirmed:true}});
   await db.shopConfig.create({data:{storeId,shopName:label+'隔離帳務驗收店',trialEnabled:true,trialDefaultPrice:500,trialAllowPriceEdit:true,trialMinPrice:0,trialMaxPrice:1000}});
  }else await db.store.update({where:{id:storeId},data:{plan:'ALLIANCE'}});
  for(const featureKey of [...features,...(['music','sports','dance'].includes(key)?[key==='music'?'business.music':'business.fitness']:[])])await db.storeFeatureEntitlement.upsert({where:{uq_store_feature_entitlement:{storeId,featureKey}},create:{storeId,featureKey,status:'ENABLED'},update:{status:'ENABLED'}});
  const customerId=storeId+'-customer';await db.customer.create({data:{id:customerId,storeId,name:label+'隔離驗收顧客',phone:'09009900'+String(['sports','music','dance','beauty','steam'].indexOf(key)+10),assignedStaffId:staffId}});
  if(['sports','music','dance'].includes(key)){
   const roomId=storeId+'-room',templateId=storeId+'-template',planId=storeId+'-plan',sessionId=storeId+'-session';
   await course.courseRoom.create({data:{id:roomId,storeId,name:'驗收空間',capacity:10}});
   await course.courseTemplate.create({data:{id:templateId,storeId,name:'驗收課程',durationMinutes:60,capacity:10,pointCost:1,defaultRoomId:roomId}});
   await course.coursePointPlan.create({data:{id:planId,storeId,name:'驗收十堂方案',points:10,price:5000,validDays:30,unit:'SESSION',storeCost:1000,templateIds:[templateId]}});
   await course.coursePurchase.create({data:{id:storeId+'-pending',storeId,customerId,planId,name:'驗收十堂方案',unit:'SESSION',points:10,price:5000,validDays:30,templateIds:[templateId],transferLastFive:'12345',requestKey:storeId+'-pending',storeCostSnapshot:1000,developerProfitSnapshot:4000,revenueStaffId:staffId,paymentMethod:'TRANSFER'}});
   await course.courseSession.create({data:{id:sessionId,storeId,templateId,roomId,coachId:staffId,nameSnapshot:'驗收體驗課',startsAt:start,endsAt:end,pointCost:1,capacity:10,requestKey:storeId+'-session',requestIndex:0,createdById:userId,teacherAttendance:'ATTENDED'}});
   await course.courseBooking.create({data:{id:storeId+'-trial',storeId,sessionId,bookingKind:'TRIAL',trialPrice:500,customerId,operatorUserId:userId,operatorName:'驗收老闆',customerName:label+'隔離驗收顧客',pointCost:0,requestKey:storeId+'-trial'}});
   await course.courseCompensationSnapshot.create({data:{sessionId,storeId,staffId,rule:{mode:'CLASS',value:500},revision:1,durationMinutes:60}});
  }else if(key==='steam'){
   await db.transaction.create({data:{id:storeId+'-sale',storeId,customerId,revenueStaffId:staffId,serviceStaffId:staffId,transactionType:'SINGLE_PURCHASE',paymentMethod:'CASH',amount:1000,grossAmount:1000,netAmount:1000,planNameSnapshot:'驗收單次服務',planType:'SINGLE',paidAt:new Date()}});
   await db.booking.create({data:{id:storeId+'-booking',storeId,customerId,bookingDate:new Date(today),slotTime:'01:00',bookingType:'SINGLE',bookingStatus:'COMPLETED',revenueStaffId:staffId,serviceStaffId:staffId}});
  }else{
   await beauty.beautySetting.create({data:{storeId}});
   await beauty.beautyService.create({data:{id:storeId+'-service',storeId,name:'驗收按摩服務',duration:60,buffer:0,price:1900,trialPrice:500}});
   await beauty.beautyTechnician.create({data:{id:storeId+'-tech',storeId,name:'驗收技師',gender:'ANY',serviceIds:[storeId+'-service'],weekly:[]}});
   await beauty.beautyGroup.create({data:{id:storeId+'-group',storeId,customerId,contactName:'美業隔離驗收顧客',phone:'0900990013',startsAt:start}});
   await beauty.beautyAppointment.create({data:{id:storeId+'-appointment',storeId,groupId:storeId+'-group',customerId,personName:'美業隔離驗收顧客',personPhone:'0900990013',serviceId:storeId+'-service',serviceName:'驗收按摩服務',technicianId:storeId+'-tech',locationId:storeId+'-room',preference:'ANY',startsAt:start,endsAt:end,occupiedEndsAt:end,duration:60,buffer:0,price:1900,isTrial:false,status:'COMPLETED',rate:{mode:'CLASS',value:500},fee:500,cancelDeduct:false,noShowDeduct:false}});
   const payment=await beauty.beautyPayment.create({data:{id:storeId+'-sale',storeId,appointmentId:storeId+'-appointment',kind:'SALE',amount:1900,method:'CASH',note:'隔離驗收起始收款',actorUserId:userId}});
   await db.cashbookEntry.create({data:{id:'beauty:'+payment.id,storeId,type:'INCOME',category:'服務收入',amount:1900,paymentMethod:'CASH',entryDate:new Date(today),createdByUserId:userId,staffId,customerId}});
  }
 }
 await installSteamPurchase();
 await installBeautyRefundCase();
 console.log(JSON.stringify({isolated:true,stores:5,productionRecords:0,seeded:true}));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'seed failed');process.exitCode=1}).finally(async()=>{await db.$disconnect();await course.$disconnect();await beauty.$disconnect()});
