import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {PrismaClient as CourseClient,type Prisma as CoursePrisma,type CoursePurchase} from '../../generated/course-client';
import {PrismaClient as BeautyClient,type Prisma as BeautyPrisma} from '../../generated/beauty-client';
import {resolveBookingConcurrencyTestDatabaseUrl} from './helpers/booking-concurrency-test-db';
import {installAuditOutboxTestSchema} from './helpers/audit-outbox-test-schema';
import {assignCourseWithCheckout} from '@/server/services/course-assignment-checkout';
import {reserveCourseInTransaction,settleCourseBooking,correctCourseAttendance} from '@/server/services/course-booking';
import {reserveScheduledMusicLearner} from '@/server/services/music-schedule-enrollment';
import {readMusicItemBalances} from '@/server/services/music-item-cards';
import {bindMusicLesson} from '@/server/services/music-lesson-periods';
import {sportsTeachingTemplateId} from '@/server/services/sports-teaching-rule';
import {lockCourseStore} from '@/server/services/course-store-lock';
import {reserveParty,transition} from '@/server/beauty/booking';
import {issueCard} from '@/server/beauty/commerce';
import {addTaiwanDuration,toLocalDateStr} from '@/lib/date-utils';
import {sumItemBalances} from '@/lib/item-entitlement';
import {readSportsRosterBalances} from '@/server/services/sports-roster-balance';
import {reconcileCourseItemCard} from '@/server/services/course-item-attendance';
import {verifyItemDatabaseUi} from '../../scripts/qa/item-core-database-browser.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import {loadBeautyRoster,type BeautyRosterContext} from '@/server/beauty/roster-read';
import {calculateCourseCheckout} from '@/lib/course-checkout';

const readClients=vi.hoisted(()=>({course:null as CourseClient|null,beauty:null as BeautyClient|null}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:new Proxy({},{get:(_target,key)=>{const value=Reflect.get(readClients.beauty!,key);return typeof value==='function'?value.bind(readClients.beauty):value;}})}));
vi.mock('@/lib/db',()=>({prisma:{customer:{findMany:async({where}:{where:{storeId:string;id:{in:string[]}}})=>{
 const rows=await readClients.course!.$queryRaw<Array<{id:string;name:string;phone:string}>>`SELECT id,name,phone FROM "Customer" WHERE "storeId"=${where.storeId} AND id=ANY(${where.id.in}::text[])`;
 return rows.map(row=>({...row,serviceNote:null,notes:null,assignedStaff:null}));
}}}}));
vi.mock('@/lib/manager-visibility',()=>({getManagerCustomerWhere:(_role:string,_staff:string|null,storeId:string)=>({storeId})}));

// Only deployment/notification boundaries are replaced. Purchases, receipts,
// reservations, FIFO, period slots, debit, restoration and audit use PostgreSQL.
vi.mock('@/lib/sports-native-preview',()=>({sportsNativePreview:(id:string)=>id.startsWith('sports-')}));
vi.mock('@/server/services/music-native-workflow',()=>({musicNativeWorkflowEnabled:(id:string)=>id.startsWith('music-')}));
vi.mock('@/server/services/course-business-profile',()=>({isMusicCourseStore:async(_tx:unknown,id:string)=>id.startsWith('music-'),readCourseBusinessProfile:async(_tx:unknown,id:string)=>id.startsWith('music-')?'MUSIC':'FITNESS'}));
vi.mock('@/server/services/sports-production-readiness',()=>({sportsRulesAvailable:async()=>true,assertSportsProductionReady:vi.fn()}));
vi.mock('@/lib/feature-gate',()=>({getStoreLimitsByStoreId:async()=>({maxMonthlyBookings:null})}));
vi.mock('@/server/services/course-access',()=>({courseManager:vi.fn(),courseTransaction:vi.fn()}));
vi.mock('@/lib/session',()=>({requireSession:vi.fn(),getCurrentUser:vi.fn()}));
vi.mock('@/lib/permissions',()=>({requirePermission:vi.fn()}));
vi.mock('@/lib/store',()=>({resolveWriteStoreId:vi.fn(),getActiveStoreForRead:vi.fn()}));
vi.mock('@/server/services/plan-activation-enqueue',()=>({enqueuePlanActivation:vi.fn()}));
vi.mock('@/server/services/plan-activation-notification-kick',()=>({kickPlanActivationNotifications:vi.fn()}));
vi.mock('@/server/beauty/technician-notification-outbox',()=>({queueTechnicianChange:vi.fn()}));

const url=resolveBookingConcurrencyTestDatabaseUrl(process.env),schema=`item_flow_${randomUUID().replaceAll('-','')}`;
const scoped=url?new URL(url):null;scoped?.searchParams.set('schema',schema);
const course=scoped?new CourseClient({datasourceUrl:scoped.toString()}):null,beauty=scoped?new BeautyClient({datasourceUrl:scoped.toString()}):null;
Object.assign(readClients,{course,beauty});
const db=()=>{if(!course)throw Error('Explicit isolated database required');return course;};
const bdb=()=>{if(!beauty)throw Error('Explicit isolated database required');return beauty;};
const courseRun=<T,>(storeId:string,work:(tx:CoursePrisma.TransactionClient)=>Promise<T>)=>db().$transaction(async tx=>{await lockCourseStore(tx,storeId);return work(tx);},{timeout:20000});
const beautyRun=<T,>(storeId:string,work:(tx:BeautyPrisma.TransactionClient)=>Promise<T>)=>bdb().$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;return work(tx);},{timeout:20000});
let created=false;
const contexts=new Map<string,{storeId:string;actor:{storeId:string;userId:string;name:string};sessionId:string}>();
let beautyContext:{storeId:string;actor:{storeId:string;userId:string;manager:boolean};serviceId:string;roomId:string;technicianId:string}|undefined;
(url?describe:describe.skip)('three-module item workflow — isolated real PostgreSQL',()=>{
 beforeAll(async()=>{
  await db().$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;
  await installAuditOutboxTestSchema(url!,db());
  for(const datamodel of ['course-prisma/schema.prisma','beauty-prisma/schema.prisma']){
   const ddl=execFileSync('node_modules/.bin/prisma',['migrate','diff','--from-empty','--to-schema-datamodel',datamodel,'--script'],{encoding:'utf8'});
   for(const sql of ddl.split(';').map(s=>s.trim()).filter(Boolean))await db().$executeRawUnsafe(sql);
  }
  await db().$executeRawUnsafe('CREATE TABLE "Store" (id text PRIMARY KEY,"industryModule" text NOT NULL)');
  await db().$executeRawUnsafe('CREATE TABLE "Customer" (id text,"storeId" text,name text,phone text,"assignedStaffId" text,"mergedIntoCustomerId" text,PRIMARY KEY(id,"storeId"))');
  await db().$executeRawUnsafe('CREATE TABLE "Staff" (id text PRIMARY KEY,"storeId" text,"displayName" text,status text)');
  await db().$executeRawUnsafe('CREATE TABLE "StoreFeatureEntitlement" ("storeId" text,"featureKey" text,status text)');
  await db().$executeRawUnsafe('CREATE TABLE "BusinessHours" ("storeId" text,"dayOfWeek" integer,"isOpen" boolean,"openTime" text,"closeTime" text,segments jsonb,"slotInterval" integer,"defaultCapacity" integer)');
  await db().$executeRawUnsafe('CREATE TABLE "SpecialBusinessDay" ("storeId" text,date date,type text)');
  await db().$executeRawUnsafe('CREATE TABLE "SlotOverride" ("storeId" text,date date,"startTime" text,type text,capacity integer,reason text)');
  await db().$executeRawUnsafe('CREATE TABLE "SportsStagingSessionRule" ("sessionId" text PRIMARY KEY,"storeId" text,frequency text,enrollment text,"planId" text,"trialPrice" integer,payload jsonb)');
  await db().$executeRawUnsafe(`CREATE TYPE "CashbookPaymentMethod" AS ENUM ('CASH','OTHER')`);
  await db().$executeRawUnsafe(`CREATE TYPE "CashbookEntryType" AS ENUM ('INCOME','EXPENSE')`);
  await db().$executeRawUnsafe('CREATE TABLE "CashbookEntry" (id text PRIMARY KEY,"storeId" text,"entryDate" date,type "CashbookEntryType","paymentMethod" "CashbookPaymentMethod",category text,amount integer,note text,"staffId" text,"createdByUserId" text,"updatedAt" timestamp)');
  await db().$executeRawUnsafe('CREATE TABLE "AuditLog" (id text PRIMARY KEY,"storeId" text,"actorUserId" text,"actorNameSnapshot" text,module text,summary text,"targetType" text,"targetId" text,action text,"beforeJson" jsonb,"afterJson" jsonb,"createdAt" timestamp)');
  const music=readFileSync('scripts/music-production-expand.sql','utf8');
  for(const table of ['CourseMusicTuition','CourseMusicReceipt','CourseMusicLessonAssignment']){
   const ddl=music.match(new RegExp(`CREATE TABLE public\\."${table}" \\([\\s\\S]*?\\n\\);`))?.[0];
   if(!ddl)throw Error('Missing real music DDL');await db().$executeRawUnsafe(ddl.replaceAll('public.',''));
  }
  await db().$executeRawUnsafe('CREATE UNIQUE INDEX item_music_slot ON "CourseMusicLessonAssignment" ("storeId","cardId","customerId",period,ordinal) WHERE kind=\'REGULAR\' AND "releasedAt" IS NULL');
  const usage=readFileSync('prisma/migrations/20261003105340_course_companion_booking/migration.sql','utf8').match(/ALTER TABLE "CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_values" CHECK \([\s\S]*?\n\);/)?.[0];
  if(!usage)throw Error('Missing real ledger constraint');await db().$executeRawUnsafe(usage);
 },30000);
 afterAll(async()=>{if(created)await db().$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await course?.$disconnect();await beauty?.$disconnect();});

 it.each(['sports','music'] as const)('%s: arrange unpaid → purchase twice → aggregate → legacy A2 binding → FIFO A1 → restore; no duplicate income',async kind=>{
  const storeId=`${kind}-${randomUUID()}`,customerId=randomUUID(),actor={storeId,userId:randomUUID(),name:'合成店長'};
  await db().$executeRaw`INSERT INTO "Store" VALUES (${storeId},'COURSE')`;
  await db().$executeRaw`INSERT INTO "Customer" VALUES (${customerId},${storeId},'合成學員','0900000000',NULL,NULL)`;
  await db().courseSettlementSetting.create({data:{storeId,profitEnabled:false}});
  await db().courseBookingRule.create({data:{storeId,selfBookingEnabled:false,assignedSchedulingEnabled:true}});
  const subject=await db().musicSubject.create({data:{storeId,name:'A'}});
  const template=await db().courseTemplate.create({data:{id:kind==='sports'?sportsTeachingTemplateId(storeId,subject.id):`teaching:${subject.id}`,storeId,musicSubjectId:subject.id,name:'A',durationMinutes:60,pointCost:1,capacity:8}});
  const old=await db().courseTemplate.create({data:{storeId,musicSubjectId:subject.id,name:'A legacy',durationMinutes:60,pointCost:1,capacity:8}});
  const room=await db().courseRoom.create({data:{storeId,name:'Room'}});
  const session=await db().courseSession.create({data:{storeId,templateId:template.id,roomId:room.id,coachId:'teacher',nameSnapshot:'A',startsAt:new Date('2099-01-01T01:00Z'),endsAt:new Date('2099-01-01T02:00Z'),pointCost:1,capacity:8,requestKey:randomUUID(),requestIndex:0,createdById:actor.userId}});
  if(kind==='sports')await db().$executeRaw`INSERT INTO "SportsStagingSessionRule" VALUES (${session.id},${storeId},'SINGLE','ASSIGNED',NULL,0,'{}')`;
  const booking=await courseRun(storeId,tx=>kind==='music'?reserveScheduledMusicLearner(tx,actor,{sessionId:session.id,customerId,cardId:null,requestKey:randomUUID()},null):reserveCourseInTransaction(tx,actor,{sessionId:session.id,customerId,cardId:null,deferredPayment:true,requestKey:randomUUID()},null));
  await expect(courseRun(storeId,tx=>settleCourseBooking(tx,actor,booking.id,'ATTENDED'))).rejects.toThrow(/繳費|有效方案/);
  expect(await db().courseBooking.findUnique({where:{id:booking.id}})).toMatchObject({status:'RESERVED',cardId:null});
  const purchases:CoursePurchase[]=[];
  for(const points of [10,20]){
   const plan=await db().coursePointPlan.create({data:{storeId,name:`A${points}`,unit:'SESSION',points,price:1000,validDays:365,templateIds:[points===10?old.id:template.id],...(kind==='music'?{musicTerms:1,musicTermSizes:[points]}:{sportsMode:'ASSIGNED',sportsSubjectId:subject.id,sportsCost:1})}});
   const data={planId:plan.id,customerId,expiresDate:'2099-12-31',requestKey:randomUUID(),expectedListPrice:1000,expectedStoreCost:0,revenueStaffId:'',discountKind:'AMOUNT' as const,discountValue:0,paymentMethod:'CARD' as const,transferLastFour:''};
   const order=await courseRun(storeId,tx=>assignCourseWithCheckout(tx,{...actor,music:kind==='music'},data));
   expect((await courseRun(storeId,tx=>assignCourseWithCheckout(tx,{...actor,music:kind==='music'},data))).id).toBe(order.id);
   purchases.push(order);
  }
  expect((await db().coursePointCard.aggregate({where:{storeId},_sum:{remaining:true}}))._sum.remaining).toBe(30);
  if(kind==='music')expect((await courseRun(storeId,tx=>readMusicItemBalances(tx,storeId,[customerId],session))).get(customerId)?.remaining).toBe(30);
  expect((await db().courseBooking.findUnique({where:{id:booking.id}}))?.status).toBe('RESERVED');
  // Historical fixture: the same booking was previously bound to A20.
  await courseRun(storeId,async tx=>{
   await tx.courseBooking.update({where:{id:booking.id},data:{cardId:purchases[1].cardId,bookingKind:'CARD',pointCost:1}});
   await tx.coursePointEntry.create({data:{storeId,cardId:purchases[1].cardId!,bookingId:booking.id,kind:'RESERVE',points:1,actorUserId:actor.userId}});
   if(kind==='music'){const card=await tx.coursePointCard.findUniqueOrThrow({where:{id:purchases[1].cardId!}});await bindMusicLesson(tx,storeId,{...booking,cardId:card.id},card);}
  });
  const history=await db().coursePointEntry.findMany({where:{storeId}});
  await courseRun(storeId,tx=>settleCourseBooking(tx,actor,booking.id,'ATTENDED'));
  await courseRun(storeId,tx=>settleCourseBooking(tx,actor,booking.id,'ATTENDED'));
  expect(await db().courseBooking.findUnique({where:{id:booking.id}})).toMatchObject({cardId:purchases[0].cardId,status:'ATTENDED'});
  expect((await db().coursePointCard.findUnique({where:{id:purchases[0].cardId!}}))?.remaining).toBe(9);
  expect((await db().coursePointCard.findUnique({where:{id:purchases[1].cardId!}}))?.remaining).toBe(20);
  for(const entry of history)expect(await db().coursePointEntry.findUnique({where:{id:entry.id}})).toEqual(entry);
  await courseRun(storeId,tx=>correctCourseAttendance(tx,actor,booking.id,'RESERVED','ATTENDED',{suppressNotice:true}));
  await courseRun(storeId,tx=>correctCourseAttendance(tx,actor,booking.id,'RESERVED','ATTENDED',{suppressNotice:true}));
  expect((await db().coursePointCard.aggregate({where:{storeId},_sum:{remaining:true}}))._sum.remaining).toBe(30);
  const income=await db().$queryRaw<Array<{amount:bigint}>>`SELECT sum(amount) AS amount FROM "CashbookEntry" WHERE "storeId"=${storeId}`;
  expect(Number(income[0].amount)).toBe(2000);
  expect(await db().coursePurchase.count({where:{storeId}})).toBe(2);
  if(kind==='music'){
   const slots=await db().$queryRaw<Array<{cardId:string}>>`SELECT "cardId" FROM "CourseMusicLessonAssignment" WHERE "bookingId"=${booking.id}`;
   expect(slots[0].cardId).toBe(purchases[0].cardId);
  }
  contexts.set(kind,{storeId,actor,sessionId:session.id});
 });

 it('beauty: actual service booking → unpaid guard → purchase → aggregate → old-card FIFO → restore without changing receipt history',async()=>{
  const storeId=`beauty-${randomUUID()}`,customerId=randomUUID(),actor={storeId,userId:randomUUID(),manager:true};
  await db().$executeRaw`INSERT INTO "Store" VALUES (${storeId},'BEAUTY')`;
  await db().$executeRaw`INSERT INTO "Customer" VALUES (${customerId},${storeId},'合成顧客','0900000000',NULL,NULL)`;
  const date=addTaiwanDuration(toLocalDateStr(),2,'DAY');
  const service=await bdb().beautyService.create({data:{storeId,name:'A',duration:60,price:1000,defaultRate:{mode:'PERCENT',value:50,base:'PAID'}}});
  const technician=await bdb().beautyTechnician.create({data:{storeId,name:'T',gender:'FEMALE',serviceIds:[service.id],weekly:{inheritStore:true}}});
  const room=await db().courseRoom.create({data:{storeId,name:'Room'}});
  await bdb().beautySetting.create({data:{storeId,backendNoticesEnabled:false,bookableDays:30}});
  for(let day=0;day<7;day++)await db().$executeRaw`INSERT INTO "BusinessHours" VALUES (${storeId},${day},true,'09:00','18:00',NULL,30,8)`;
  const intent={requestKey:randomUUID(),date,time:'09:00',policyRevision:0,contactName:'合成顧客',phone:'0900000000',isTrial:false,people:[{customerId,name:'合成顧客',phone:'0900000000',serviceId:service.id,serviceRevision:0,preference:'ANY' as const,specifiedTechnicianId:technician.id,specifiedLocationId:room.id,cardId:null,notes:''}]};
  const booked=await beautyRun(storeId,tx=>reserveParty(tx,actor,intent));const id=booked.ids[0];
  await expect(beautyRun(storeId,tx=>transition(tx,actor,{id,revision:0,target:'COMPLETED',reason:''}))).rejects.toThrow('請先繳費');
  const cards=[];
  for(const sessions of [10,20]){
   const plan=await bdb().beautyPlan.create({data:{storeId,name:`A${sessions}`,sessions,price:1000,validDays:365,serviceIds:[service.id]}});
   const input={requestKey:randomUUID(),planId:plan.id,customerId,memberIds:[],paid:1000,method:'CARD' as const};
   const result=await beautyRun(storeId,tx=>issueCard(tx,actor,input));
   expect(await beautyRun(storeId,tx=>issueCard(tx,actor,input))).toEqual(result);
   cards.push(await bdb().beautyCard.findFirstOrThrow({where:{storeId,planId:plan.id}}));
  }
  const total=()=>bdb().beautyCard.aggregate({where:{storeId},_sum:{remaining:true}});
  expect((await total())._sum.remaining).toBe(30);
  expect((await bdb().beautyAppointment.findUnique({where:{id}}))?.status).toBe('RESERVED');
  await bdb().beautyAppointment.update({where:{id},data:{cardId:cards[1].id}});
  await bdb().beautyLedger.create({data:{storeId,cardId:cards[1].id,appointmentId:id,kind:'RESERVE',delta:0,actorUserId:actor.userId}});
  const history=await bdb().beautyLedger.findMany({where:{storeId}});
  await beautyRun(storeId,tx=>transition(tx,actor,{id,revision:0,target:'COMPLETED',reason:''}));
  expect(await bdb().beautyAppointment.findUnique({where:{id}})).toMatchObject({cardId:cards[0].id,status:'COMPLETED',debit:true});
  expect((await total())._sum.remaining).toBe(29);
  for(const entry of history)expect(await bdb().beautyLedger.findUnique({where:{id:entry.id}})).toEqual(entry);
  expect(await bdb().beautyEvent.count({where:{storeId,appointmentId:id,kind:'RECONCILE_ITEM_CARD'}})).toBe(1);
  await beautyRun(storeId,tx=>transition(tx,actor,{id,revision:1,target:'RESERVED',reason:'恢復'}));
  await beautyRun(storeId,tx=>transition(tx,actor,{id,revision:2,target:'RESERVED',reason:'重送'}));
  expect((await total())._sum.remaining).toBe(30);
  expect(await bdb().beautyPayment.count({where:{storeId,kind:'SALE'}})).toBe(2);
  expect(sumItemBalances((await bdb().beautyCard.findMany({where:{storeId}})).map(card=>({id:card.id,remaining:card.remaining,available:card.remaining,cost:1,unit:'SESSION',planName:card.name})))[0].remaining).toBe(30);
  beautyContext={storeId,actor,serviceId:service.id,roomId:room.id,technicianId:technician.id};
 });

 it.each(['sports','music'] as const)('%s: compatibility rollback is atomic; cancelled history and source-bound rights stay unchanged',async kind=>{
  const context=contexts.get(kind)!;
  const {storeId,actor,sessionId}=context;
  const booking=await db().courseBooking.findFirstOrThrow({where:{storeId,sessionId}});
  const later=await db().coursePointCard.findFirstOrThrow({where:{storeId,remaining:20}});
  await db().courseBooking.update({where:{id:booking.id},data:{cardId:later.id}});
  const snapshot=await db().courseBooking.findUniqueOrThrow({where:{id:booking.id}});
  const history=await db().coursePointEntry.findMany({where:{storeId},orderBy:{id:'asc'}});
  await expect(courseRun(storeId,async tx=>{
   await reconcileCourseItemCard(tx,actor,booking.id,kind==='sports'?'SPORTS':'MUSIC');
   expect((await tx.courseBooking.findUniqueOrThrow({where:{id:booking.id}})).cardId).not.toBe(later.id);
   throw Error('Injected failure after reconciliation');
  })).rejects.toThrow('Injected failure');
  expect(await db().courseBooking.findUnique({where:{id:booking.id}})).toEqual(snapshot);
  expect(await db().coursePointEntry.findMany({where:{storeId},orderBy:{id:'asc'}})).toEqual(history);
  for(const status of ['CANCELLED','ATTENDED'] as const){
   await db().courseBooking.update({where:{id:booking.id},data:{status}});
   await courseRun(storeId,tx=>reconcileCourseItemCard(tx,actor,booking.id,kind==='sports'?'SPORTS':'MUSIC'));
   expect((await db().courseBooking.findUniqueOrThrow({where:{id:booking.id}})).cardId).toBe(later.id);
   expect(await db().coursePointEntry.findMany({where:{storeId},orderBy:{id:'asc'}})).toEqual(history);
  }
  await db().courseBooking.update({where:{id:booking.id},data:{status:'RESERVED'}});
  await db().coursePointCard.update({where:{id:later.id},data:{musicOpeningStateRequired:true}});
  await courseRun(storeId,tx=>reconcileCourseItemCard(tx,actor,booking.id,kind==='sports'?'SPORTS':'MUSIC'));
  expect((await db().courseBooking.findUniqueOrThrow({where:{id:booking.id}})).cardId).toBe(later.id);
  expect(await db().coursePointEntry.findMany({where:{storeId},orderBy:{id:'asc'}})).toEqual(history);
  await db().coursePointCard.update({where:{id:later.id},data:{musicOpeningStateRequired:false}});
 });

 it.runIf(process.env.ITEM_CORE_BROWSER_QA==='1')('real course roster and original purchase modal use actual database purchase, debit and restoration without navigation',async()=>{
  const results=[];
  for(const profile of ['sports','music'])for(const [width,height] of [[1366,900],[1024,768],[768,1024]]){
   const context=contexts.get(profile);if(!context)throw Error('Core service setup did not complete');
   const {storeId,actor}=context,customerId=randomUUID();
   await db().$executeRaw`INSERT INTO "Customer" VALUES (${customerId},${storeId},'驗收學員','0900000000',NULL,NULL)`;
   const original=await db().courseSession.findUniqueOrThrow({where:{id:context.sessionId}});
   const date=addTaiwanDuration(toLocalDateStr(),2,'DAY');
   const session=await db().courseSession.create({data:{storeId,templateId:original.templateId,roomId:original.roomId,coachId:original.coachId,nameSnapshot:'A',startsAt:new Date(`${date}T09:00:00+08:00`),endsAt:new Date(`${date}T10:00:00+08:00`),pointCost:1,capacity:8,requestKey:randomUUID(),requestIndex:0,createdById:actor.userId}});
   if(profile==='sports')await db().$executeRaw`INSERT INTO "SportsStagingSessionRule" VALUES (${session.id},${storeId},'SINGLE','ASSIGNED',NULL,0,'{}')`;
   const booking=await courseRun(storeId,tx=>reserveCourseInTransaction(tx,actor,{sessionId:session.id,customerId,cardId:null,deferredPayment:true,requestKey:randomUUID()},null));
   const plan=await db().coursePointPlan.findFirstOrThrow({where:{storeId,points:10}});
   const detail=async()=>{
    const current=await db().courseBooking.findUniqueOrThrow({where:{id:booking.id}});
    const balances=await courseRun(storeId,tx=>profile==='sports'?readSportsRosterBalances(storeId,session.id,[customerId],tx):readMusicItemBalances(tx,storeId,[customerId],session));
    const balance=balances.get(customerId);
    const row={...current,customerName:'驗收學員',customerPhone:'0900000000',unit:'SESSION',sharedCard:false,canAddCompanion:false,bookingSource:'店長建立',cardRemaining:balance?.remaining??null,available:balance?.available??0,sportsBalance:balance??null,sportsFixed:profile==='sports',termIndex:null,termCount:0,termNumber:null,termLessons:[],termPrivateLeaves:[],termMakeups:[],termLeaveCount:0,termNoShowCount:0,termClosedBeforeCutoff:0,termUnscheduledOrdinals:[],bonusLessons:0,nextPaidLessons:null,termPayment:null,nextTerm:null,absenceCount:0,absenceHistory:[],trialPayments:[],openingImported:false,openingIssue:null,openingTuition:null,planName:'A',serviceNote:''};
    return {success:true,data:{session:{templateId:session.templateId,startsAt:session.startsAt.toISOString(),pointCost:1,teacherNote:'',teacherAttendance:'SCHEDULED',teacherAttendanceReason:'',teacherMakeupForSessionId:null,waitlistStopMinutes:0,waitlistEnabled:false},roster:[row],cards:[],customers:[{id:customerId,name:'驗收學員',phone:'0900000000'}],canPurchase:true,sharedCardState:'ENABLED',waitlist:[],pendingMakeups:[],trial:null}};
   };
   const handle=async(name:string,args:unknown[])=>{
    if(name==='loadCourseSessionDetail'||name==='loadCourseRosterQuick')return detail();
    if(name==='readCustomerLabels')return {success:true,labels:[]};
    if(name==='loadCourseStudentPurchase')return {success:true,data:{customerId,customerName:'驗收學員',music:profile==='music',canDiscount:false,plans:[plan]}};
    if(name==='assignCoursePointCard'){
     const input=args[0] as Parameters<typeof assignCourseWithCheckout>[2];
     if(input.customerId!==customerId||input.planId!==plan.id)throw Error('Wrong test purchase scope');
     await courseRun(storeId,tx=>assignCourseWithCheckout(tx,{...actor,music:profile==='music'},input));return {success:true};
    }
    if(name==='updateCourseBookingStatus'){
     const input=args[0] as {bookingId:string;status:'ATTENDED'};if(input.bookingId!==booking.id)throw Error('Wrong booking');
     await courseRun(storeId,tx=>settleCourseBooking(tx,actor,booking.id,input.status));return {success:true};
    }
    if(name==='updateCourseRosterBatch'||name==='correctMusicRosterAttendance'){
     await courseRun(storeId,tx=>correctCourseAttendance(tx,actor,booking.id,'RESERVED','ATTENDED',{suppressNotice:true}));return {success:true};
    }
    throw Error(`Unexpected test action: ${name}`);
   };
   results.push(await verifyItemDatabaseUi(handle,profile,width,height));
   expect((await db().courseBooking.findUnique({where:{id:booking.id}}))?.status).toBe('RESERVED');
   expect((await db().coursePointCard.aggregate({where:{storeId,members:{some:{customerId}}},_sum:{remaining:true}}))._sum.remaining).toBe(10);
   expect(await db().coursePurchase.count({where:{storeId,customerId}})).toBe(1);
  }
  mkdirSync('artifacts/item-core-compat',{recursive:true});writeFileSync('artifacts/item-core-compat/database-browser-results.json',JSON.stringify(results,null,2));
 },240000);

 it.runIf(process.env.ITEM_CORE_BROWSER_QA==='1')('beauty original roster → original checkout → actual PostgreSQL → attendance → restore without navigation',async()=>{
  if(!beautyContext)throw Error('Beauty setup failed');
  const {storeId,actor,serviceId,roomId,technicianId}=beautyContext,results=[];
  for(const [index,[width,height]] of [[1366,900],[1024,768],[768,1024]].entries()){
   const customerId=randomUUID(),date=addTaiwanDuration(toLocalDateStr(),3+index,'DAY');
   await db().$executeRaw`INSERT INTO "Customer" VALUES (${customerId},${storeId},'驗收顧客','0900000000',NULL,NULL)`;
   const booked=await beautyRun(storeId,tx=>reserveParty(tx,actor,{requestKey:randomUUID(),date,time:'09:00',policyRevision:0,contactName:'驗收顧客',phone:'0900000000',isTrial:false,people:[{customerId,name:'驗收顧客',phone:'0900000000',serviceId,serviceRevision:0,preference:'ANY',specifiedTechnicianId:technicianId,specifiedLocationId:roomId,cardId:null,notes:''}]}));
   const bookingId=booked.ids[0],plan=await bdb().beautyPlan.findFirstOrThrow({where:{storeId,sessions:10}});
   const ctx={a:actor,u:{role:'OWNER',staffId:null},customerAccess:true,cardAccess:true,financeAccess:true} as unknown as BeautyRosterContext;
   const roster=async()=>loadBeautyRoster(ctx,{groupId:booked.groupId},String(Date.now()));
   const snapshot=async()=>{
    const [read,cards,services,techs,locations,policy]=await Promise.all([roster(),bdb().beautyCard.findMany({where:{storeId,memberIds:{has:customerId}}}),bdb().beautyService.findMany({where:{storeId}}),bdb().beautyTechnician.findMany({where:{storeId}}),db().courseRoom.findMany({where:{storeId}}),bdb().beautySetting.findUniqueOrThrow({where:{storeId}})]);
    const withHeld=await Promise.all(cards.map(async card=>({...card,expiresAt:card.expiresAt.toISOString(),closedAt:card.closedAt?.toISOString()??null,held:await bdb().beautyAppointment.count({where:{storeId,cardId:card.id,status:'RESERVED'}})})));
    return {bookingId,customerId,roster:read.data,dashboard:{storeId,date,now:Date.now(),policy,services,plans:[plan],planSaleCosts:{},cards:withHeld,assignmentStaff:[],techs,locations,customers:[{id:customerId,name:'驗收顧客',phone:'0900000000',lineName:null,_count:{sponsoredCustomers:0}}],access:{financeAccess:true,planAccess:true,customerAccess:true,writeAccess:true},manage:{card:true,collect:true,discount:true,members:true,update:true},customerHealthEnabled:false}};
   };
   const handle=async(name:string,args:unknown[])=>{
    if(name==='beautySnapshot')return snapshot();
    if(name==='beautyRoster')return {...await roster(),version:String(Date.now()),unchanged:false};
    if(name==='readCustomerLabels')return {success:true,labels:[]};
    if(name==='beautyCustomerRead'){
     const input=args[0] as {operation:string;store:string};if(input.store!==storeId)throw Error('Wrong customer read scope');
     if(input.operation==='support')return {success:false,error:'進階顧客資料不在本次驗收範圍'};
     if(input.operation==='cash')return {success:true,status:'OPEN'};
     return {success:true,rows:[],data:[],totals:[],hasMore:false};
    }
    if(name==='assignBeautyNativeCard'){
     const input=args[0] as {customerId:string;planId:string;expectedStoreId:string;requestKey:string;expectedListPrice:number;discountKind:'AMOUNT'|'PERCENT';discountValue:number;paymentMethod:'CARD';expiresDate:string};
     if(input.customerId!==customerId||input.planId!==`plan:${plan.id}`||input.expectedStoreId!==storeId)throw Error('Wrong beauty scope');
     const paid=calculateCourseCheckout(input.expectedListPrice,input.discountKind,input.discountValue).paid;
     const data=await beautyRun(storeId,tx=>issueCard(tx,actor,{customerId,planId:plan.id,requestKey:input.requestKey,memberIds:[],paid,method:input.paymentMethod},undefined,{expiresDate:input.expiresDate,expectedListPrice:input.expectedListPrice}));
     return {success:true,data};
    }
    if(name==='beautyAttendance'){
     const input=args[0] as {id:string;revision:number;choice:string};if(input.id!==bookingId||!['ATTENDED','PENDING'].includes(input.choice))throw Error('Wrong beauty attendance');
     await beautyRun(storeId,tx=>transition(tx,actor,{id:bookingId,revision:input.revision,target:input.choice==='ATTENDED'?'COMPLETED':'RESERVED',reason:'隔離驗收'}));return {success:true};
    }
    throw Error(`Unexpected beauty action ${name}`);
   };
   results.push(await verifyItemDatabaseUi(handle,'beauty',width,height));
   expect((await bdb().beautyAppointment.findUniqueOrThrow({where:{id:bookingId}})).status).toBe('RESERVED');
   expect((await bdb().beautyCard.aggregate({where:{storeId,memberIds:{has:customerId}},_sum:{remaining:true}}))._sum.remaining).toBe(10);
   const owned=await bdb().beautyCard.findMany({where:{storeId,memberIds:{has:customerId}},select:{id:true}});
   expect(await bdb().beautyPayment.count({where:{storeId,cardId:{in:owned.map(card=>card.id)},kind:'SALE'}})).toBe(1);
  }
  writeFileSync('artifacts/item-core-compat/beauty-database-browser-results.json',JSON.stringify(results,null,2));
 },240000);
});
