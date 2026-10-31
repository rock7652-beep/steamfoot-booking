import {PrismaClient as Course} from '../../generated/course-client';
import {PrismaClient as Beauty} from '../../generated/beauty-client';
import {PrismaClient} from '@prisma/client';
import {assertSportsLiveFlowQaEnvironment} from '../sports-live-flow-qa-scope.mjs';
import {dayRange,addTaiwanDuration,toLocalDateStr} from '../../src/lib/date-utils';
assertSportsLiveFlowQaEnvironment(process.env);
const db=new PrismaClient(),course=new Course(),beauty=new Beauty();
async function main(){try{
  for(const storeId of ['sports-live-flow-store','ops-music']){
    const id='session-adjustment-'+storeId,planId=storeId+'-plan';
    await course.coursePointCard.create({data:{id,storeId,planId,nameSnapshot:'堂數調整驗收十堂',unit:'SESSION',remaining:10,templateIds:[storeId+'-template'],musicTermSizes:storeId==='ops-music'?[5,5]:[],requestKey:id,expiresAt:dayRange(addTaiwanDuration(toLocalDateStr(),60,'DAY')).end,members:{create:{customerId:storeId+'-customer'}}}});
    await course.coursePointEntry.create({data:{storeId,cardId:id,kind:'GRANT',points:10,actorUserId:storeId==='ops-music'?'ops-music-owner':'sports-live-flow-owner'}});
    await course.coursePurchase.create({data:{id,storeId,planId,customerId:storeId+'-customer',cardId:id,name:'堂數調整驗收十堂',unit:'SESSION',points:10,price:5000,validDays:60,status:'CONFIRMED',transferLastFive:'',requestKey:id}});
  }
  await beauty.beautyCard.create({data:{id:'session-adjustment-beauty',storeId:'ops-beauty',customerId:'ops-beauty-customer',memberIds:['ops-beauty-customer'],planId:'ops-beauty-plan',name:'堂數調整驗收十次',sessions:10,remaining:10,listPrice:5000,paid:5000,serviceIds:['ops-beauty-service'],allowShared:false,expiresAt:dayRange(addTaiwanDuration(toLocalDateStr(),60,'DAY')).end}});
  await beauty.beautyPayment.create({data:{storeId:'ops-beauty',cardId:'session-adjustment-beauty',kind:'SALE',amount:5000,method:'CASH',note:'Synthetic original receipt',actorUserId:'ops-beauty-owner'}});
  // A local fixture may use existing UI capabilities, never fabricated session state.
  await db.storeFeatureEntitlement.updateMany({where:{storeId:{in:['sports-live-flow-store','ops-music','ops-beauty']},featureKey:'plan_management'},data:{status:'ENABLED'}});
  console.log(JSON.stringify({synthetic:true,stores:3,seeded:true}));
}finally{await db.$disconnect();await course.$disconnect();await beauty.$disconnect();}}
main().catch(error=>{console.error(error);process.exitCode=1;});
