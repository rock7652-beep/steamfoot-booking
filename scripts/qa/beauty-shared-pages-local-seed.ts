/** Synthetic, new loopback database only; never accepts a deployed connection. */
import {readFileSync} from 'node:fs';
import {PrismaClient} from '@prisma/client';
import {PrismaClient as BeautyClient} from '../../generated/beauty-client';
import {PrismaClient as CourseClient} from '../../generated/course-client';
import {hashSync} from 'bcryptjs';
import {addTaiwanDuration,toLocalDateStr} from '../../src/lib/date-utils';
const config=JSON.parse(readFileSync('/tmp/beauty-shared-pages-local-runtime.json','utf8'));
const url=new URL(config.url);
if(url.hostname!=='127.0.0.1'||url.port!=='32771'||url.pathname!=='/beauty_shared_pages_qa'||url.username!=='beauty_shared_pages_app')throw Error('New synthetic loopback database required');
const db=new PrismaClient({datasourceUrl:config.url}),beauty=new BeautyClient({datasourceUrl:config.url}),course=new CourseClient({datasourceUrl:config.url});
async function main(){
 const storeId='beauty-shared-qa',other='beauty-shared-other';
 for(const id of [storeId,other]){
  await db.store.upsert({where:{id},create:{id,slug:id,name:id===storeId?'美業共用頁面合成店':'跨店隔離合成店',industryModule:'BEAUTY',plan:'EXPERIENCE'},update:{}});
  await db.shopConfig.upsert({where:{storeId:id},create:{storeId:id,shopName:'合成驗收店'},update:{}});
  await beauty.beautySetting.upsert({where:{storeId:id},create:{storeId:id,bookableDays:365},update:{}});
  for(let dayOfWeek=0;dayOfWeek<7;dayOfWeek++)await db.businessHours.upsert({where:{storeId_dayOfWeek:{storeId:id,dayOfWeek}},create:{storeId:id,dayOfWeek,openTime:'09:00',closeTime:'21:00',slotInterval:30},update:{}});
 }
 for(const [id,role] of [['owner','OWNER'],['limited','STAFF'],['other-owner','OWNER']] as const){
  const sid=id==='other-owner'?other:storeId;
  await db.user.upsert({where:{id:'shared-qa-'+id},create:{id:'shared-qa-'+id,name:'合成'+id,email:id+'@shared-qa.invalid',role,passwordHash:hashSync('shared-local-test-only',10)},update:{}});
  await db.staff.upsert({where:{id:'shared-qa-staff-'+id},create:{id:'shared-qa-staff-'+id,userId:'shared-qa-'+id,storeId:sid,displayName:'合成'+id,isOwner:role==='OWNER'},update:{}});
 }
 await db.customer.upsert({where:{id:'shared-qa-customer'},create:{id:'shared-qa-customer',storeId,name:'合成顧客',phone:'0900000301'},update:{}});
 await course.courseRoom.upsert({where:{id:'shared-qa-room'},create:{id:'shared-qa-room',storeId,name:'合成床位A',capacity:1,rentalEnabled:true,rentalHourlyRate:300,rentalBufferMinutes:15},update:{}});
 await beauty.beautyService.upsert({where:{id:'shared-qa-service'},create:{id:'shared-qa-service',storeId,name:'合成做臉',duration:60,buffer:15,price:1000,trialPrice:500},update:{}});
 await beauty.beautyTechnician.upsert({where:{id:'shared-qa-technician'},create:{id:'shared-qa-technician',storeId,name:'合成技師',gender:'FEMALE',serviceIds:['shared-qa-service'],weekly:{inheritStore:true},rates:{'shared-qa-service':{mode:'FIXED',value:500}},phone:'0900000302',contactEmail:'technician@shared-qa.invalid'},update:{}});
 await beauty.beautyTechnician.upsert({where:{id:'shared-qa-inactive'},create:{id:'shared-qa-inactive',storeId,name:'停用合成技師',gender:'MALE',serviceIds:[],weekly:{inheritStore:true},active:false},update:{}});
 await beauty.beautyPlan.upsert({where:{id:'shared-qa-plan'},create:{id:'shared-qa-plan',storeId,name:'合成五次方案',sessions:5,price:4500,validDays:90,serviceIds:['shared-qa-service']},update:{}});
 console.log(JSON.stringify({seeded:true,syntheticStore:storeId,tomorrow:addTaiwanDuration(toLocalDateStr(),1,'DAY')}));
}
main().finally(()=>Promise.all([db.$disconnect(),beauty.$disconnect(),course.$disconnect()]));
