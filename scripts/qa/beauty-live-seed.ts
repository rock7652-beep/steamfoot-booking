/** Synthetic accounts only. Refuses remote/shared databases before constructing clients. */
import { assertBeautyLocalQaEnvironment } from '../beauty-local-qa-scope.mjs';
import { assertBeautySandboxQaEnvironment } from '../beauty-sandbox-qa-scope.mjs';
import { PrismaClient } from '@prisma/client';
import { PrismaClient as BeautyClient } from '../../generated/beauty-client';
import { PrismaClient as CourseClient } from '../../generated/course-client';
import { hashSync } from 'bcryptjs';
import { toLocalDateStr } from '../../src/lib/date-utils';
async function main() {
if(process.env.BEAUTY_SANDBOX_QA === '1') assertBeautySandboxQaEnvironment(process.env);
else assertBeautyLocalQaEnvironment(process.env);
const db = new PrismaClient(), beauty = new BeautyClient(), course = new CourseClient();
try {
  const [role] = await db.$queryRaw<Array<{safe:boolean}>>`SELECT NOT rolsuper AND NOT rolbypassrls AS safe FROM pg_roles WHERE rolname=current_user`;
  if (!role?.safe) throw new Error('QA must use the restricted app login.');
  const storeId = 'beauty-1374-store';
  await db.store.upsert({where:{id:storeId},update:{},create:{id:storeId,name:'美業隔離驗收店',slug:'beauty-1374-qa',industryModule:'BEAUTY',plan:'ALLIANCE',isDemo:true}});
  await db.shopConfig.upsert({where:{storeId},update:{},create:{storeId,shopName:'美業隔離驗收店'}});
  for (const [id, name, role, phone] of [
    ['owner','驗收店長','OWNER','0900001374'],['member','驗收顧客','CUSTOMER','0900001375'],
    ['worker','驗收女技師','CUSTOMER','0900001376'],['limited','受限人員','STAFF','0900001377'],
  ] as const) {
    const userId = `beauty-1374-${id}`;
    await db.user.upsert({where:{id:userId},update:{},create:{id:userId,name,email:`${id}@beauty-1374.invalid`,phone,role,passwordHash:hashSync('Beauty1374-test-only!',10)}});
    if (role === 'OWNER' || role === 'STAFF') await db.staff.upsert({where:{userId},update:{},create:{id:`${userId}-staff`,userId,storeId,displayName:name,isOwner:role==='OWNER'}});
    else {
      const customerId=`${userId}-customer`;
      await db.customer.upsert({where:{id:customerId},update:{},create:{id:customerId,userId,storeId,name,phone,selfBookingEnabled:true}});
      await db.customerIdentityLink.upsert({where:{uq_customer_identity_user_store_provider:{userId,storeId,provider:'credentials'}},update:{},create:{userId,storeId,customerId,provider:'credentials',providerAccountId:userId}});
    }
  }
  for(let day=0;day<7;day++) await db.businessHours.upsert({where:{storeId_dayOfWeek:{storeId,dayOfWeek:day}},update:{},create:{storeId,dayOfWeek:day,openTime:'09:00',closeTime:'21:00',slotInterval:15,defaultCapacity:2}});
  for(const id of ['room-a','room-b']) await course.courseRoom.upsert({where:{id:`beauty-1374-${id}`},update:{},create:{id:`beauty-1374-${id}`,storeId,name:`驗收空間${id}`,capacity:1}});
  await beauty.beautySetting.upsert({where:{storeId},update:{},create:{storeId,bookableDays:30,cancelLeadMinutes:0,notifications:false}});
  for(const [id,name,duration,buffer,price] of [['face','做臉',60,15,1000],['massage','按摩',90,0,1500]] as const) {
    await beauty.beautyService.upsert({where:{id:`beauty-1374-${id}`},update:{},create:{id:`beauty-1374-${id}`,storeId,name,duration,buffer,price,trialPrice:500}});
  }
  for(const [id,gender,sort] of [['female','FEMALE',0],['male','MALE',1]] as const) {
    await beauty.beautyTechnician.upsert({where:{id:`beauty-1374-${id}`},update:{},create:{id:`beauty-1374-${id}`,storeId,name:gender==='FEMALE'?'驗收女技師':'驗收男技師',gender,sort,userId:gender==='FEMALE'?'beauty-1374-worker':null,serviceIds:['beauty-1374-face','beauty-1374-massage'],weekly:Array.from({length:7},(_,day)=>({day,start:'09:00',end:'21:00'})),rates:{'beauty-1374-face':{mode:'PERCENT',value:50,base:'PAID'},'beauty-1374-massage':{mode:'HOURLY',value:600}},grants:['complete','cancel','reschedule','income']}});
  }
  await beauty.beautyPlan.upsert({where:{id:'beauty-1374-plan'},update:{},create:{id:'beauty-1374-plan',storeId,name:'合成共用一次方案',sessions:1,price:1000,validDays:30,serviceIds:['beauty-1374-face'],allowShared:true}});
  const businessDate=new Date(toLocalDateStr()+'T00:00:00Z');
  if(!await db.cashDrawerSession.findFirst({where:{storeId,businessDate}})) await db.cashDrawerSession.create({data:{storeId,businessDate,openedByUserId:'beauty-1374-owner',openingBookBalance:0,openingActualCash:0,openingDifference:0}});
  console.log(JSON.stringify({synthetic:true,store:storeId,restrictedRole:true,seeded:true}));
} finally {await Promise.all([db.$disconnect(),beauty.$disconnect(),course.$disconnect()]);}

}
main().catch(error => { console.error(error); process.exitCode=1; });
