// Synthetic identities only. Never imports or copies real store/student data.
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { hashSync } from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { PrismaClient as CourseClient } from '../generated/course-client/index.js';
import { verifyIsolatedDevelopmentDatabase } from './isolated-dev-scope.mjs';
const {env}=JSON.parse(readFileSync('work/isolated-dev.json','utf8'));
const main=new PrismaClient({datasourceUrl:env.DATABASE_URL}), course=new CourseClient({datasourceUrl:env.DATABASE_URL});
try {
 await verifyIsolatedDevelopmentDatabase(main,env);
 if(await main.store.count()) throw new Error('Fixture requires the newly provisioned empty database.');
 const store=await main.store.create({data:{id:'synthetic-music-dev',name:'雲端隔離驗收音樂教室',slug:'synthetic-music',industryModule:'COURSE',plan:'ALLIANCE',maxStaffOverride:100,maxCustomersOverride:1000,maxMonthlyBookingsOverride:10000}});
 const password=randomBytes(18).toString('base64url');
 const user=await main.user.create({data:{id:'synthetic-owner',name:'合成驗收管理者',email:'owner@music.example.invalid',passwordHash:hashSync(password,10),role:'OWNER'}});
 const subject=await course.musicSubject.create({data:{storeId:store.id,name:'合成鋼琴'}});
 const staff=await main.staff.create({data:{id:'synthetic-teacher',userId:user.id,storeId:store.id,displayName:'合成老師',isOwner:true,courseCoachEnabled:true,courseQualificationsConfirmed:true,courseQualifiedTemplateIds:[subject.id,`teaching:${subject.id}`]}});
 await main.storeFeatureEntitlement.create({data:{storeId:store.id,featureKey:'business.music'}});
 for(let dayOfWeek=0;dayOfWeek<7;dayOfWeek++) await main.businessHours.create({data:{storeId:store.id,dayOfWeek,isOpen:true,openTime:'00:00',closeTime:'23:59',segments:[{openTime:'00:00',closeTime:'23:59',slotInterval:60,defaultCapacity:10}]}});
 const room=await course.courseRoom.create({data:{storeId:store.id,name:'合成教室',capacity:10}});
 const template=await course.courseTemplate.create({data:{storeId:store.id,name:'合成鋼琴固定課',musicSubjectId:subject.id,durationMinutes:60,pointCost:1,capacity:1,classType:'PRIVATE',musicScheduleMode:'FIXED',musicPricePerLesson:500,musicTermLessons:4,musicValidityDaysPerTerm:365,defaultRoomId:room.id}});
 await main.staff.update({where:{id:staff.id},data:{courseQualifiedTemplateIds:[subject.id,`teaching:${subject.id}`,template.id]}});
 const plan=await course.coursePointPlan.create({data:{storeId:store.id,name:'合成四堂方案',unit:'SESSION',points:4,price:2000,validDays:365,templateIds:[template.id],musicTerms:1}});
 const learners=[];
 for(const [index,name,remaining,expiry] of [[0,'每週合成學員',3,'2027-12-31'],[1,'隔週合成學員',4,'2026-11-10'],[2,'待繳費合成學員',0,'2027-12-31']]) {
  const customer=await main.customer.create({data:{id:`synthetic-student-${index}`,storeId:store.id,name,phone:`090000000${index}`,customerStage:'ACTIVE'}});
  let card=null;
  if(index<2) card=await course.coursePointCard.create({data:{storeId:store.id,planId:plan.id,nameSnapshot:`${name}課卡`,unit:'SESSION',templateIds:[template.id],remaining,expiresAt:new Date(expiry+'T15:59:59.999Z'),requestKey:`synthetic-card-${index}`,}});
  if(card) await course.courseCardMember.create({data:{cardId:card.id,storeId:store.id,customerId:customer.id}});
  learners.push({customerId:customer.id,cardId:card?.id??null});
 }
 writeFileSync('work/isolated-fixture.json',JSON.stringify({email:user.email,password,storeId:store.id,staffId:staff.id,roomId:room.id,templateId:template.id,subjectId:subject.id,learners},null,2),{mode:0o600});
 console.info('Synthetic fixture created only after actual isolated database identity verification. Login details kept in ignored work/isolated-fixture.json.');
} finally {await main.$disconnect();await course.$disconnect();}
