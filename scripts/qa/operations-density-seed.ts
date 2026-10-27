import {PrismaClient} from '@prisma/client';
import {PrismaClient as CourseClient} from '../../generated/course-client';
import {hashSync} from 'bcryptjs';
import {assertSportsLiveFlowQaEnvironment} from '../sports-live-flow-qa-scope.mjs';
assertSportsLiveFlowQaEnvironment(process.env);
const db=new PrismaClient(),course=new CourseClient();
async function main(){try {
 const ids=['sports-live-flow-store','ops-music','ops-dance','ops-beauty','ops-steam'];
 if(await db.store.count({where:{id:{notIn:ids}}}))throw Error('Unexpected database contents');
 await db.user.upsert({where:{id:'operations-density-hq'},create:{id:'operations-density-hq',email:'operations-hq@example.invalid',name:'隔離總部驗收',role:'ADMIN',passwordHash:hashSync('isolated-sports-test-only',10)},update:{role:'ADMIN',status:'ACTIVE'}});
 for(const storeId of ids.slice(0,3)) {
  const original=await course.coursePurchase.findUniqueOrThrow({where:{id:storeId+'-pending'}});
  const session=await course.courseSession.findUniqueOrThrow({where:{id:storeId+'-session'}});
  const sessionId=storeId+'-hq-density-session';
  await course.courseSession.upsert({where:{id:sessionId},create:{id:sessionId,storeId,templateId:session.templateId,roomId:session.roomId,coachId:session.coachId,nameSnapshot:'隔離 HQ 月結授課費',startsAt:new Date('2026-08-14T01:00:00+08:00'),endsAt:new Date('2026-08-14T02:00:00+08:00'),pointCost:1,capacity:10,requestKey:sessionId,requestIndex:0,createdById:'operations-density-hq',teacherAttendance:'ATTENDED'},update:{}});
  await course.courseCompensationSnapshot.upsert({where:{sessionId},create:{sessionId,storeId,staffId:session.coachId!,rule:{mode:'CLASS',value:500},revision:1,durationMinutes:60},update:{}});
  const id=storeId+'-hq-density-purchase';
  await course.coursePurchase.upsert({where:{id},create:{id,storeId,customerId:original.customerId,planId:original.planId,name:'隔離 HQ 月結驗收方案',unit:'SESSION',points:10,price:5000,validDays:30,templateIds:original.templateIds,requestKey:id,storeCostSnapshot:1000,developerProfitSnapshot:4000,revenueStaffId:original.revenueStaffId,status:'CONFIRMED',confirmedAt:new Date('2026-08-14T01:00:00+08:00'),confirmedBy:'operations-density-hq',paymentMethod:'TRANSFER',transferLastFive:'12345'},update:{}});
 }
 console.log('Isolated HQ and August obligations ready; no production database.');
} finally {await db.$disconnect();await course.$disconnect();}}
main().catch(error=>{console.error(error instanceof Error?error.message:"QA seed failed");process.exitCode=1;});
