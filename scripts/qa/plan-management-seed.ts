/** Synthetic fixtures only; the existing guard rejects every remote database. */
import {PrismaClient} from '@prisma/client';
import {PrismaClient as CourseClient} from '../../generated/course-client';
import {PrismaClient as BeautyClient} from '../../generated/beauty-client';
import {assertSportsLiveFlowQaEnvironment} from '../sports-live-flow-qa-scope.mjs';
import {addTaiwanDuration,toLocalDateStr,dayRange} from '../../src/lib/date-utils';
assertSportsLiveFlowQaEnvironment(process.env);
const db=new PrismaClient(),course=new CourseClient(),beauty=new BeautyClient();
async function main(){
 const expiry=dayRange(addTaiwanDuration(toLocalDateStr(),60,'DAY')).end;
 for(const sid of ['sports-live-flow-store','ops-music']){
  const id='plan-management-'+sid,customerId=sid+'-customer',planId=sid+'-plan';
  await course.coursePointCard.create({data:{id,storeId:sid,planId,nameSnapshot:'方案管理驗收十堂',unit:'SESSION',templateIds:[sid+'-template'],remaining:8,expiresAt:expiry,requestKey:id,musicValidityDays:sid==='ops-music'?60:null,members:{create:{customerId}}}});
  await course.coursePointEntry.createMany({data:[{storeId:sid,cardId:id,kind:'GRANT',points:10,actorUserId:sid==='sports-live-flow-store'?'sports-live-flow-owner':sid+'-owner'},{storeId:sid,cardId:id,kind:'DEBIT',points:2,actorUserId:sid==='sports-live-flow-store'?'sports-live-flow-owner':sid+'-owner'}]});
  await course.coursePurchase.create({data:{id,storeId:sid,customerId,planId,cardId:id,name:'方案管理驗收十堂',unit:'SESSION',points:10,price:5000,validDays:60,templateIds:[sid+'-template'],status:'CONFIRMED',transferLastFive:'',paymentMethod:'CASH',requestKey:id}});
 }
 await beauty.beautyPlan.create({data:{id:'plan-management-beauty-plan',storeId:'ops-beauty',name:'方案管理驗收十次',sessions:10,price:5000,validDays:60,serviceIds:['ops-beauty-service']}});
 await beauty.beautyCard.create({data:{id:'plan-management-beauty',storeId:'ops-beauty',customerId:'ops-beauty-customer',memberIds:['ops-beauty-customer'],planId:'plan-management-beauty-plan',name:'方案管理驗收十次',sessions:10,remaining:8,listPrice:5000,paid:5000,serviceIds:['ops-beauty-service'],allowShared:false,expiresAt:expiry}});
 await beauty.beautyLedger.createMany({data:[{storeId:'ops-beauty',cardId:'plan-management-beauty',kind:'PURCHASE',delta:10,actorUserId:'ops-beauty-owner'},{storeId:'ops-beauty',cardId:'plan-management-beauty',kind:'ATTEND',delta:-2,actorUserId:'ops-beauty-owner'}]});
 await beauty.beautyPayment.create({data:{storeId:'ops-beauty',cardId:'plan-management-beauty',kind:'PLAN',amount:5000,method:'CASH',note:'合成驗收原收款',actorUserId:'ops-beauty-owner'}});
 await db.customerPlanWallet.update({where:{id:'ops-steam-wallet'},data:{expiryDate:new Date(addTaiwanDuration(toLocalDateStr(),60,'DAY')),remainingSessions:3}});
 await db.walletSession.updateMany({where:{walletId:'ops-steam-wallet',sessionNo:{lte:2}},data:{status:'COMPLETED',completedAt:new Date()}});
 console.log(JSON.stringify({seeded:true,synthetic:true,modules:4,expiresAt:expiry}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>Promise.all([db.$disconnect(),course.$disconnect(),beauty.$disconnect()]));
