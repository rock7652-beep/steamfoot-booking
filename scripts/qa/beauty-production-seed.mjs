/** Fresh synthetic fixtures; only guarded production-QA database. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {assertBeautyProductionQaEnvironment} from '../beauty-production-qa-scope.mjs';
assertBeautyProductionQaEnvironment(process.env);
const require=createRequire(import.meta.url),{PrismaClient}=require('@prisma/client'),{PrismaClient:Course}=require('../../generated/course-client'),{PrismaClient:Spa}=require('../../generated/spa-client'),{PrismaClient:Beauty}=require('../../generated/beauty-client'),{hashSync}=require('bcryptjs');
const {toLocalDateStr,addTaiwanDuration,parseTaipeiDateTime}=require('../../src/lib/date-utils.ts');
const password=process.env.QA_BEAUTY_REVIEW_PASSWORD;assert(password);
const main=new PrismaClient(),course=new Course(),spa=new Spa(),beauty=new Beauty(),fixtures=[];
const day=addTaiwanDuration(toLocalDateStr(),3,'DAY');
async function mainSeed(){
try{
 if(process.env.BEAUTY_PRODUCTION_SEED_RESUME==='1'){
  assert.equal(await main.store.count(),5);assert.equal(await spa.spaBooking.count(),0);assert.equal(await beauty.beautyPayment.count(),0);
  const storeId='beauty-prodqa-spa',treatment=await spa.spaTreatment.findFirstOrThrow({where:{storeId}}),location=await spa.spaServiceLocation.findFirstOrThrow({where:{storeId}});
  await spa.spaBooking.create({data:{storeId,customerId:storeId+'-customer',serviceStaffId:storeId+'-worker-staff',serviceLocationId:location.id,bookingDate:new Date(day),startTime:'10:00',endTime:'11:00',serviceNameSnapshot:treatment.name,totalPriceSnapshot:1000,items:{create:[{treatmentId:treatment.id,treatmentNameSnapshot:treatment.name,priceSnapshot:1000,serviceMinutes:60}]}}});
  for(const [index,key]of ['beauty','steamfoot','fitness','music','spa'].entries()){const store=await main.store.findUniqueOrThrow({where:{id:'beauty-prodqa-'+key}});fixtures.push({key,module:store.industryModule,storeId:store.id,slug:store.slug,name:store.name,ownerEmail:key+'-owner@beauty-production.invalid',phone:'090003'+String(index).padStart(4,'0'),workerPhone:'090004'+String(index).padStart(4,'0')});}
  writeFileSync('/tmp/beauty-production-qa/accounts.json',JSON.stringify({day,fixtures}));console.log(JSON.stringify({seeded:true,resumed:true,stores:5,synthetic:true}));return;
 }
 assert.equal(await main.store.count(),0,'Seed only a new empty production-QA database');
 const [role]=await main.$queryRaw`SELECT current_user AS name,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`;
 assert.equal(role.name,'beauty_1374_prodapp');assert(!role.rolsuper&&!role.rolbypassrls);
 for(const [index,key,module]of [[0,'beauty','BEAUTY'],[1,'steamfoot','STEAMFOOT'],[2,'fitness','COURSE'],[3,'music','COURSE'],[4,'spa','SPA']]){
  const storeId='beauty-prodqa-'+key, name=({beauty:'美業',steamfoot:'蒸足',fitness:'運動',music:'音樂',spa:'舊SPA'})[key]+'關閉回歸合成店';
  await main.store.create({data:{id:storeId,slug:storeId,name,industryModule:module,plan:'ALLIANCE',isDemo:true}});
  await main.shopConfig.create({data:{storeId,shopName:name}});
  if(key==='music')await main.storeFeatureEntitlement.create({data:{storeId,featureKey:'business.music'}});
  for(let dayOfWeek=0;dayOfWeek<7;dayOfWeek++)await main.businessHours.create({data:{storeId,dayOfWeek,openTime:'09:00',closeTime:'21:00',slotInterval:15,defaultCapacity:4}});
  const owner=await main.user.create({data:{id:storeId+'-owner',email:key+'-owner@beauty-production.invalid',name:name+'店長',role:'OWNER',passwordHash:hashSync(password,10)}});
  await main.staff.create({data:{id:storeId+'-owner-staff',userId:owner.id,storeId,displayName:owner.name,isOwner:true}});
  const phone='090003'+String(index).padStart(4,'0'),member=await main.user.create({data:{id:storeId+'-member',phone,name:name+'顧客',role:'CUSTOMER',passwordHash:hashSync(password,10)}}),customer=await main.customer.create({data:{id:storeId+'-customer',storeId,userId:member.id,name:member.name,phone,selfBookingEnabled:true}});
  await main.customerIdentityLink.create({data:{userId:member.id,storeId,customerId:customer.id,provider:'credentials',providerAccountId:member.id}});
  const workerPhone='090004'+String(index).padStart(4,'0'),worker=await main.user.create({data:{id:storeId+'-worker',phone:workerPhone,name:name+'工作人員',role:'CUSTOMER',passwordHash:hashSync(password,10)}}),workerCustomer=await main.customer.create({data:{id:storeId+'-worker-customer',storeId,userId:worker.id,name:worker.name,phone:workerPhone,selfBookingEnabled:true}});
  await main.customerIdentityLink.create({data:{userId:worker.id,storeId,customerId:workerCustomer.id,provider:'credentials',providerAccountId:worker.id}});
  const staff=await main.staff.create({data:{id:storeId+'-worker-staff',userId:worker.id,storeId,displayName:worker.name,courseCoachEnabled:module==='COURSE',courseQualificationsConfirmed:true}});
  if(module==='COURSE'){
   await main.staffMemberLink.create({data:{userId:worker.id,staffId:staff.id,storeId,courseMemberEnabled:true}});
   const room=await course.courseRoom.create({data:{storeId,name:'合成教室',capacity:4}}),template=await course.courseTemplate.create({data:{storeId,name:key+'合成課程',durationMinutes:60,pointCost:1,capacity:4,defaultRoomId:room.id}});
   await course.courseSession.create({data:{storeId,templateId:template.id,roomId:room.id,coachId:staff.id,nameSnapshot:template.name,startsAt:parseTaipeiDateTime(day,'10:00'),endsAt:parseTaipeiDateTime(day,'11:00'),pointCost:1,capacity:4,requestKey:randomUUID(),requestIndex:0,createdById:owner.id}});
  }
  if(module==='SPA'){
   const treatment=await spa.spaTreatment.create({data:{storeId,name:'spa合成服務',price:1000,serviceMinutes:60}}),location=await spa.spaServiceLocation.create({data:{storeId,name:'合成空間'}});
   await spa.spaTreatmentServiceLocation.create({data:{storeId,treatmentId:treatment.id,serviceLocationId:location.id}});
   await spa.spaBooking.create({data:{storeId,customerId:customer.id,serviceStaffId:staff.id,serviceLocationId:location.id,bookingDate:new Date(day),startTime:'10:00',endTime:'11:00',serviceNameSnapshot:treatment.name,totalPriceSnapshot:1000,items:{create:[{treatmentId:treatment.id,treatmentNameSnapshot:treatment.name,priceSnapshot:1000,serviceMinutes:60}]}}});
  }
  if(module==='STEAMFOOT')await main.booking.create({data:{storeId,customerId:customer.id,bookingDate:new Date(day),slotTime:'10:00',people:1,bookingType:'FIRST_TRIAL',bookingStatus:'PENDING'}});
  if(module==='BEAUTY'){
   const room=await course.courseRoom.create({data:{storeId,name:'合成空間',capacity:1}}),service=await beauty.beautyService.create({data:{storeId,name:'不應公開的美業服務',duration:60,price:1000}});
   const technician=await beauty.beautyTechnician.create({data:{storeId,userId:worker.id,name:'不應公開的技師',gender:'FEMALE',serviceIds:[service.id],weekly:[],grants:['income','complete'],rates:{[service.id]:{mode:'FIXED',value:500}}}});
   await beauty.beautySetting.create({data:{storeId,notifications:false}});
   const group=await beauty.beautyGroup.create({data:{storeId,customerId:customer.id,contactName:customer.name,phone,startsAt:parseTaipeiDateTime(day,'10:00')}});
   await beauty.beautyAppointment.create({data:{storeId,groupId:group.id,customerId:customer.id,personName:'不應公開的預約顧客',personPhone:phone,serviceId:service.id,serviceName:service.name,technicianId:technician.id,locationId:room.id,preference:'FEMALE',startsAt:parseTaipeiDateTime(day,'10:00'),endsAt:parseTaipeiDateTime(day,'11:00'),occupiedEndsAt:parseTaipeiDateTime(day,'11:00'),duration:60,buffer:0,price:1000,isTrial:false,cancelDeduct:false,noShowDeduct:false,rate:{mode:'FIXED',value:500}}});
  }
  fixtures.push({key,module,storeId,slug:storeId,name,ownerEmail:owner.email,phone,workerPhone});
 }
 writeFileSync('/tmp/beauty-production-qa/accounts.json',JSON.stringify({day,fixtures}));
 console.log(JSON.stringify({seeded:true,stores:fixtures.length,synthetic:true,restrictedRole:true}));
}finally{await Promise.all([main.$disconnect(),course.$disconnect(),spa.$disconnect(),beauty.$disconnect()]);}

}
await mainSeed();
