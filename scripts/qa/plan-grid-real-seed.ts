// Fixtures for a disposable, guarded loopback database only.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {hashSync} from 'bcryptjs';
import {PrismaClient} from '@prisma/client';
import {PrismaClient as Course} from '../../generated/course-client';
import {PrismaClient as Beauty} from '../../generated/beauty-client';
import {assertSportsLiveFlowQaEnvironment} from '../sports-live-flow-qa-scope.mjs';
import {addTaiwanDuration,toLocalDateStr,dayRange} from '../../src/lib/date-utils';
assertSportsLiveFlowQaEnvironment(process.env);
const db=new PrismaClient(),course=new Course(),beauty=new Beauty();
async function main(){
 const today=toLocalDateStr(),expiry=dayRange(addTaiwanDuration(today,60,'DAY')).end;
 const tuition=await db.$queryRaw<{present:string|null}[]>`SELECT to_regclass('public."CourseMusicTuition"')::text AS present`;
 if(!tuition[0]?.present)execFileSync('node_modules/.bin/prisma',['db','execute','--url',process.env.DATABASE_URL!,'--stdin'],{input:readFileSync('supabase/migrations/20261016003312_music_tuition_receipts_preview.sql','utf8'),stdio:['pipe','pipe','pipe']});
 const assignments=await db.$queryRaw<{present:string|null}[]>`SELECT to_regclass('public."CourseMusicLessonAssignment"')::text AS present`;
 if(!assignments[0]?.present){const ddl=readFileSync('scripts/music-production-expand.sql','utf8').match(/CREATE TABLE public\."CourseMusicLessonAssignment" \([\s\S]*?\n\);/)?.[0];if(!ddl)throw Error('Missing reviewed music assignment DDL');await db.$executeRawUnsafe(ddl);}
 const musicStore='store-lubymusic';
 if(!await db.store.findUnique({where:{id:musicStore}})){
  await db.store.create({data:{id:musicStore,slug:'grid-music',name:'音樂格子隔離驗收店',industryModule:'COURSE',plan:'ALLIANCE'}});
  await db.user.create({data:{id:musicStore+'-owner',email:'grid-music-owner@example.invalid',name:'音樂隔離驗收店長',role:'OWNER',passwordHash:hashSync('isolated-sports-test-only',10)}});
  await db.staff.create({data:{id:musicStore+'-staff',storeId:musicStore,userId:musicStore+'-owner',displayName:'隔離驗收老師',isOwner:true,courseCoachEnabled:true,courseQualificationsConfirmed:true,courseQualifiedTemplateIds:[musicStore+'-template']}});
  await db.shopConfig.create({data:{storeId:musicStore,shopName:'音樂格子隔離驗收店'}});
  await db.customer.create({data:{id:musicStore+'-customer',storeId:musicStore,name:'音樂格子驗收顧客',phone:'0900990099',assignedStaffId:musicStore+'-staff'}});
  for(const {featureKey}of await db.storeFeatureEntitlement.findMany({where:{storeId:'ops-music'},select:{featureKey:true}}))await db.storeFeatureEntitlement.create({data:{storeId:musicStore,featureKey,status:'ENABLED'}});
  await course.courseRoom.create({data:{id:musicStore+'-room',storeId:musicStore,name:'驗收教室',capacity:10}});
  await course.courseTemplate.create({data:{id:musicStore+'-template',storeId:musicStore,name:'鋼琴',durationMinutes:60,capacity:10,pointCost:1,defaultRoomId:musicStore+'-room'}});
  await course.coursePointPlan.create({data:{id:musicStore+'-plan',storeId:musicStore,name:'格子驗收十堂方案',unit:'SESSION',points:10,price:5000,validDays:60,templateIds:[musicStore+'-template'],musicTermSizes:[10]}});
 }
 for(const key of ['sports','music','beauty','steam']){
  const sid=key==='sports'?'sports-live-flow-store':key==='music'?musicStore:'ops-'+key,cid=sid+'-customer',id='grid-real-'+key;
  const member=await db.user.upsert({where:{id:id+(key==='music'?'-native-member':'-member')},update:{},create:{id:id+(key==='music'?'-native-member':'-member'),role:'CUSTOMER',name:'隔離方案驗收會員',email:id+(key==='music'?'-native':'')+'@example.invalid',passwordHash:hashSync('isolated-plan-grid-member',10)}});
  await db.customer.update({where:{id:cid},data:{userId:member.id}});
  await db.storeFeatureEntitlement.upsert({where:{uq_store_feature_entitlement:{storeId:sid,featureKey:'frontend_preview'}},create:{storeId:sid,featureKey:'frontend_preview',status:'ENABLED'},update:{status:'ENABLED'}});
  if(key==='sports'||key==='music'){
   const existing=await course.coursePointCard.findUnique({where:{id}});
   if(existing&&existing.storeId===sid)continue;
   if(existing){await course.coursePointEntry.deleteMany({where:{cardId:id}});await course.coursePurchase.deleteMany({where:{cardId:id}});await course.courseCardMember.deleteMany({where:{cardId:id}});await course.coursePointCard.delete({where:{id}});}
   await course.coursePointCard.create({data:{id,storeId:sid,planId:sid+'-plan',nameSnapshot:'格子驗收十堂方案',unit:'SESSION',remaining:10,templateIds:[sid+'-template'],requestKey:id,expiresAt:expiry,members:{create:{customerId:cid}},musicTermSizes:key==='music'?[10]:[]}});
   await course.coursePointEntry.create({data:{storeId:sid,cardId:id,kind:'GRANT',points:10,actorUserId:key==='sports'?'sports-live-flow-owner':sid+'-owner'}});
   await course.coursePurchase.create({data:{id,storeId:sid,customerId:cid,planId:sid+'-plan',cardId:id,name:'格子驗收十堂方案',unit:'SESSION',points:10,price:5000,validDays:60,templateIds:[sid+'-template'],status:'CONFIRMED',confirmedAt:new Date(),transferLastFive:'',requestKey:id}});
  }else if(key==='beauty'){
   if(await beauty.beautyCard.findUnique({where:{id}})){if(!await beauty.beautyPayment.findFirst({where:{cardId:id}}))await beauty.beautyPayment.create({data:{storeId:sid,cardId:id,kind:'PLAN',amount:5000,method:'CASH',note:'隔離驗收原收款',actorUserId:sid+'-owner'}});continue;}
   await beauty.beautyPlan.create({data:{id,storeId:sid,name:'格子驗收十次方案',sessions:10,price:5000,validDays:60,serviceIds:[sid+'-service']}});
   await beauty.beautyCard.create({data:{id,storeId:sid,customerId:cid,memberIds:[cid],planId:id,name:'格子驗收十次方案',sessions:10,remaining:10,listPrice:5000,paid:5000,serviceIds:[sid+'-service'],allowShared:false,expiresAt:expiry}});
   await beauty.beautyLedger.create({data:{storeId:sid,cardId:id,kind:'PURCHASE',delta:10,actorUserId:sid+'-owner'}});
   await beauty.beautyPayment.create({data:{storeId:sid,cardId:id,kind:'PLAN',amount:5000,method:'CASH',note:'隔離驗收原收款',actorUserId:sid+'-owner'}});
  }else{
   if(await db.customerPlanWallet.findUnique({where:{id}}))continue;
   const plan=await db.servicePlan.create({data:{id,storeId:sid,name:'格子驗收十堂方案',category:'PACKAGE',price:5000,sessionCount:10}});
   await db.customerPlanWallet.create({data:{id,storeId:sid,customerId:cid,planId:plan.id,purchasedPrice:5000,totalSessions:10,remainingSessions:10,startDate:dayRange(addTaiwanDuration(today,-30,'DAY')).start,expiryDate:expiry,sessions:{create:Array.from({length:10},(_,i)=>({sessionNo:i+1}))}}});
  }
 }
 if(process.argv.includes('--lists')){
  const future=addTaiwanDuration(today,2,'DAY'),past=addTaiwanDuration(today,-3,'DAY');
  for(const sid of ['sports-live-flow-store','store-lubymusic'])for(const [label,date]of [['future',future],['past',past]]){const id='grid-list-'+sid+'-'+label,actor=sid==='sports-live-flow-store'?'sports-live-flow-owner':sid+'-owner',staff=sid==='sports-live-flow-store'?'sports-live-flow-staff':sid+'-staff';if(await course.courseSession.findUnique({where:{id}}))continue;await course.courseSession.create({data:{id,storeId:sid,templateId:sid+'-template',roomId:sid+'-room',coachId:staff,nameSnapshot:'清單驗收課程',startsAt:new Date(date+'T10:00:00+08:00'),endsAt:new Date(date+'T11:00:00+08:00'),pointCost:0,capacity:10,requestKey:id,requestIndex:0,createdById:actor}});await course.courseBooking.create({data:{id,storeId:sid,sessionId:id,bookingKind:'TRIAL',trialPrice:0,customerId:sid+'-customer',operatorUserId:actor,operatorName:'隔離驗收',customerName:'隔離清單驗收會員',pointCost:0,requestKey:id}});}
  if(!await db.booking.findUnique({where:{id:'grid-list-steam-future'}}))await db.booking.create({data:{id:'grid-list-steam-future',storeId:'ops-steam',customerId:'ops-steam-customer',bookingDate:new Date(future),slotTime:'10:00',bookingType:'SINGLE',bookingStatus:'CONFIRMED',revenueStaffId:'ops-steam-staff',serviceStaffId:'ops-steam-staff'}});
  if(!await beauty.beautyAppointment.findUnique({where:{id:'grid-list-beauty-future'}})){const startsAt=new Date(future+'T10:00:00+08:00'),endsAt=new Date(future+'T11:00:00+08:00');await beauty.beautyGroup.create({data:{id:'grid-list-beauty-group',storeId:'ops-beauty',customerId:'ops-beauty-customer',contactName:'隔離清單驗收會員',phone:'0900990013',startsAt}});await beauty.beautyAppointment.create({data:{id:'grid-list-beauty-future',groupId:'grid-list-beauty-group',storeId:'ops-beauty',customerId:'ops-beauty-customer',personName:'隔離清單驗收會員',personPhone:'0900990013',serviceId:'ops-beauty-service',serviceName:'清單驗收按摩',technicianId:'ops-beauty-tech',locationId:'ops-beauty-room',preference:'ANY',startsAt,endsAt,occupiedEndsAt:endsAt,duration:60,buffer:0,price:0,isTrial:true,status:'RESERVED',rate:{mode:'CLASS',value:0},fee:0,cancelDeduct:false,noShowDeduct:false}});}
 }
 console.log(JSON.stringify({seeded:true,realCustomers:0,modules:4,normalCredentialAccounts:true,notificationsEnabled:false}));
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>Promise.all([db.$disconnect(),course.$disconnect(),beauty.$disconnect()]));
