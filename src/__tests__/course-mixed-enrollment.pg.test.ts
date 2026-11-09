import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {PrismaClient,Prisma} from "../../generated/course-client";
import {resolveBookingConcurrencyTestDatabaseUrl} from "./helpers/booking-concurrency-test-db";
import {installAuditOutboxTestSchema} from "./helpers/audit-outbox-test-schema";

// Only session authorization, deployment readiness and external delivery are
// replaced. Scheduling, roster, entitlement, ledger, waitlist and locks use PG.
const boundary=vi.hoisted(()=>({client:null as PrismaClient|null,storeId:"",userId:"qa-owner"}));
vi.mock("@/lib/course-db",()=>({coursePrisma:new Proxy({},{get:(_target,key)=>{
 const value=Reflect.get(boundary.client!,key);return typeof value==="function"?value.bind(boundary.client):value;
}})}));
vi.mock("@/lib/db",()=>({prisma:{
 storeFeatureEntitlement:{findFirst:async({where}:{where:{storeId:string;featureKey:string}})=>(await boundary.client!.$queryRaw<Array<{storeId:string}>>`SELECT "storeId" FROM "StoreFeatureEntitlement" WHERE "storeId"=${where.storeId} AND "featureKey"=${where.featureKey} AND status='ENABLED'`)[0]??null},
 customer:{count:async({where}:{where:{storeId:string;id:{in:string[]}}})=>Number((await boundary.client!.$queryRaw<Array<{count:bigint}>>`SELECT count(*) FROM "Customer" WHERE "storeId"=${where.storeId} AND id=ANY(${where.id.in}::text[]) AND "mergedIntoCustomerId" IS NULL`)[0].count)},
}}));
vi.mock("@/server/services/course-access",()=>({
 courseManager:async()=>({storeId:boundary.storeId,user:{id:boundary.userId,role:"OWNER",staffId:null,name:"隔離店長"}}),
 courseTransaction:async<T,>(storeId:string,work:(tx:Prisma.TransactionClient)=>Promise<T>)=>boundary.client!.$transaction(async tx=>{await lockCourseStore(tx,storeId);return work(tx);},{timeout:20000}),
}));
vi.mock("@/lib/manager-visibility",()=>({getManagerCustomerWhere:(_role:string,_staff:unknown,storeId:string)=>({storeId})}));
vi.mock("@/lib/sports-native-preview",()=>({sportsNativePreview:(id:string)=>id.startsWith("sports-")}));
vi.mock("@/lib/sports-staging",()=>({sportsStagingEnabled:(id:string)=>id.startsWith("sports-"),requireSportsStaging:vi.fn()}));
vi.mock("@/server/services/sports-production-readiness",()=>({sportsRulesAvailable:async()=>true,assertSportsProductionReady:vi.fn(),assertSportsBookingReadReady:vi.fn()}));
vi.mock("@/server/services/music-native-workflow",()=>({musicNativeWorkflowEnabled:(id:string)=>id.startsWith("music-")}));
vi.mock("@/server/services/course-coach-notification-kick",()=>({kickCoachNotifications:vi.fn()}));
vi.mock("@/lib/feature-gate",()=>({getStoreLimitsByStoreId:async()=>({maxMonthlyBookings:null,maxCustomers:null}),hasStoreFeature:async()=>true}));
vi.mock("@/lib/shop-config",()=>({resolveCustomerBookingWindow:()=>({opensAt:null,closesAt:new Date("2100-01-01")})}));
vi.mock("@/lib/subscription-guard",()=>({assertStoreSubscriptionWritable:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("next/server",()=>({after:vi.fn()}));
vi.mock("@/lib/sports-series-storage",()=>({sportsSeriesTable:()=>Prisma.raw(`"${schema}"."SportsScheduleSeries"`),assertSportsPermanentCreationAllowed:vi.fn()}));

import {createCourseSchedule} from "@/server/actions/course";
import {lockCourseStore} from "@/server/services/course-store-lock";
import {reserveCourseInTransaction,settleCourseBooking,correctCourseAttendance} from "@/server/services/course-booking";
import {joinCourseWaitlist,promoteCourseWaitlistForSession} from "@/server/services/course-waitlist";
import {materializeSportsMonth} from "@/server/services/sports-permanent-series";
import {materializeCourseScheduleSeries} from "@/server/services/course-schedule-series";
import {sportsTeachingTemplateId} from "@/server/services/sports-teaching-rule";
import {readSportsRosterBalances} from "@/server/services/sports-roster-balance";
import {readMusicItemBalances} from "@/server/services/music-item-cards";
import type {CourseScheduleInput} from "@/lib/course-scheduling";

const url=resolveBookingConcurrencyTestDatabaseUrl(process.env),schema=`mixed_${randomUUID().replaceAll("-","")}`;
const scoped=url?new URL(url):null;scoped?.searchParams.set("schema",schema);
const client=scoped?new PrismaClient({datasourceUrl:scoped.toString()}):null;
boundary.client=client;
const db=()=>{if(!client)throw Error("Explicit disposable loopback test database required");return client;};
const run=<T,>(storeId:string,work:(tx:Prisma.TransactionClient)=>Promise<T>)=>db().$transaction(async tx=>{await lockCourseStore(tx,storeId);return work(tx);},{timeout:20000});
type Kind="sports"|"music";
let created=false;

(url?describe:describe.skip)("mixed enrollment — isolated PostgreSQL transactions",()=>{
 beforeAll(async()=>{
  await db().$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;
  await installAuditOutboxTestSchema(url!,db());
  const ddl=execFileSync("node_modules/.bin/prisma",["migrate","diff","--from-empty","--to-schema-datamodel","course-prisma/schema.prisma","--script"],{encoding:"utf8"});
  for(const sql of ddl.split(";").map(s=>s.trim()).filter(Boolean))await db().$executeRawUnsafe(sql);
  await db().$executeRawUnsafe(`CREATE TABLE "Store" (id text PRIMARY KEY,"industryModule" text DEFAULT 'COURSE',"operatingStatus" text DEFAULT 'ACTIVE')`);
  await db().$executeRawUnsafe(`CREATE TABLE "Customer" (id text PRIMARY KEY,"storeId" text,name text,phone text,"assignedStaffId" text,"mergedIntoCustomerId" text,UNIQUE(id,"storeId"))`);
  await db().$executeRawUnsafe(`CREATE TABLE "Staff" (id text PRIMARY KEY,"storeId" text,status text,"displayName" text,"courseCoachEnabled" boolean,"courseQualificationsConfirmed" boolean,"courseQualifiedTemplateIds" text[])`);
  await db().$executeRawUnsafe(`CREATE TABLE "StoreFeatureEntitlement" (id text DEFAULT gen_random_uuid()::text,"storeId" text,"featureKey" text,status text,"startsAt" timestamptz,"expiresAt" timestamptz)`);
  await db().$executeRawUnsafe(`CREATE TABLE "ShopConfig" ("storeId" text PRIMARY KEY,"dutySchedulingEnabled" boolean DEFAULT false,"bookableUntilDate" date,"bookingOpensAt" timestamptz,"bookingWindowDays" integer)`);
  await db().$executeRawUnsafe(`CREATE TABLE "BusinessHours" ("storeId" text,"dayOfWeek" int,"isOpen" boolean,"openTime" text,"closeTime" text,segments jsonb,"slotInterval" int,"defaultCapacity" int)`);
  await db().$executeRawUnsafe(`CREATE TABLE "SpecialBusinessDay" ("storeId" text,date date,type text)`);
  await db().$executeRawUnsafe(`CREATE TABLE "CourseStaffAvailability" ("storeId" text,"staffId" text,"dayOfWeek" int,segments jsonb)`);
  await db().$executeRawUnsafe(`CREATE TABLE "CourseStaffAvailabilityException" ("storeId" text,"staffId" text,date date,type text,segments jsonb)`);
  await db().$executeRawUnsafe(`CREATE TABLE "AuditLog" (id text PRIMARY KEY,"actorUserId" text,"actorNameSnapshot" text,"storeId" text,module text,summary text,"targetType" text,"targetId" text,action text,"beforeJson" jsonb,"afterJson" jsonb,"createdAt" timestamptz)`);
  await db().$executeRawUnsafe(`CREATE TABLE "SportsStagingSessionRule" ("sessionId" text PRIMARY KEY,"storeId" text,frequency text,enrollment text,"planId" text,"trialPrice" int,payload jsonb)`);
  await db().$executeRawUnsafe(`CREATE TABLE "SportsScheduleSeries" (LIKE "CourseScheduleSeries" INCLUDING ALL)`);
  const music=readFileSync("scripts/music-production-expand.sql","utf8");
  for(const table of ["CourseMusicTuition","CourseMusicReceipt","CourseMusicLessonAssignment"]){
   const sql=music.match(new RegExp(`CREATE TABLE public\\."${table}" \\([\\s\\S]*?\\n\\);`))?.[0];
   if(!sql)throw Error("Missing real music ledger DDL");await db().$executeRawUnsafe(sql.replaceAll("public.",""));
  }
  await db().$executeRawUnsafe(`CREATE UNIQUE INDEX mixed_music_slot ON "CourseMusicLessonAssignment" ("storeId","cardId","customerId",period,ordinal) WHERE kind='REGULAR' AND "releasedAt" IS NULL`);
  const ledger=readFileSync("prisma/migrations/20261003105340_course_companion_booking/migration.sql","utf8").match(/ALTER TABLE "CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_values" CHECK \([\s\S]*?\n\);/)?.[0];
  if(!ledger)throw Error("Missing actual ledger constraint");await db().$executeRawUnsafe(ledger);
  await db().$executeRawUnsafe(`CREATE SEQUENCE mixed_insert_probe`);
  await db().$executeRawUnsafe(`CREATE FUNCTION reject_probe_learner() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM nextval('mixed_insert_probe'); IF NEW."customerId" LIKE 'reject-%' THEN RAISE EXCEPTION 'isolated rollback probe'; END IF; RETURN NEW; END $$`);
  await db().$executeRawUnsafe(`CREATE TRIGGER mixed_rollback_probe BEFORE INSERT ON "CourseBooking" FOR EACH ROW EXECUTE FUNCTION reject_probe_learner()`);
 },30000);
 afterAll(async()=>{vi.useRealTimers();if(created)await db().$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await client?.$disconnect();});

 async function fixture(kind:Kind,capacity=2){
  const storeId=`${kind}-${randomUUID()}`,coachId=randomUUID(),fixed=randomUUID(),free=randomUUID(),waiting=randomUUID();
  boundary.storeId=storeId;
  const actor={storeId,userId:boundary.userId,name:"隔離店長"};
  await db().$executeRaw`INSERT INTO "Store" (id) VALUES (${storeId})`;
  await db().$executeRaw`INSERT INTO "StoreFeatureEntitlement" ("storeId","featureKey",status) VALUES (${storeId},${kind==="music"?"business.music":"business.fitness"},'ENABLED')`;
  await db().$executeRaw`INSERT INTO "ShopConfig" ("storeId") VALUES (${storeId})`;
  for(const customerId of [fixed,free,waiting])await db().$executeRaw`INSERT INTO "Customer" (id,"storeId",name,phone) VALUES (${customerId},${storeId},'合成學員','0900000000')`;
  const subject=await db().musicSubject.create({data:{storeId,name:"合成教學項目"}});
  const template=await db().courseTemplate.create({data:{id:kind==="sports"?sportsTeachingTemplateId(storeId,subject.id):randomUUID(),storeId,musicSubjectId:subject.id,name:"合成混合課",durationMinutes:60,pointCost:3,capacity:8,waitlistEnabled:true,waitlistLimit:5}});
  await db().$executeRaw`INSERT INTO "Staff" VALUES (${coachId},${storeId},'ACTIVE','合成教師',true,true,ARRAY[${template.id}])`;
  const room=await db().courseRoom.create({data:{storeId,name:"隔離教室",capacity:8}});
  await db().courseBookingRule.create({data:{storeId,selfBookingEnabled:true,assignedSchedulingEnabled:true}});
  await db().courseWaitlistSetting.create({data:{storeId,enabled:true,defaultLimit:5,autoPromoteStopMinutes:0}});
  const input:CourseScheduleInput&{learners?:Array<{customerId:string;cardId:null}>}={templateId:template.id,roomId:room.id,coachId,date:"2099-01-01",time:"09:00",durationMinutes:60,capacity,requestKey:randomUUID(),...(kind==="music"?{enrollmentMode:"OPEN",scheduleType:"SINGLE",learners:[{customerId:fixed,cardId:null}]}:{sportsStaging:{frequency:"SINGLE",enrollment:"OPEN",planId:null,students:[{customerId:fixed,cardId:null}],trialPrice:0,waitlist:{limit:5,stopMinutes:0}}})};
  const create=async()=>{boundary.storeId=storeId;const result=await createCourseSchedule(input);expect(result).toMatchObject({success:true});return db().courseSession.findFirstOrThrow({where:{storeId,requestKey:input.requestKey}});};
  const member=(customerId:string)=>({...actor,userId:`member:${customerId}`,customerId});
  const card=async(customerId:string,assigned=false,remaining=20)=>{
   const rights=kind==="sports"?{sportsMode:assigned?"ASSIGNED":"OPEN",sportsSubjectId:assigned?subject.id:null,sportsCost:assigned?2:null}:{};
   const plan=await db().coursePointPlan.create({data:{storeId,name:"合成方案"+randomUUID(),unit:kind==="music"?"SESSION":"POINT",points:20,price:1000,validDays:365,templateIds:kind==="music"?[template.id]:[],...rights,...(kind==="music"?{musicTerms:1,musicTermSizes:[20]}:{})}});
   return db().coursePointCard.create({data:{storeId,planId:plan.id,nameSnapshot:plan.name,unit:plan.unit,templateIds:plan.templateIds,remaining,expiresAt:new Date("2100-01-01"),requestKey:randomUUID(),...rights,...(kind==="music"?{musicTermSizes:[20]}:{}),members:{create:{customerId}},entries:{create:{kind:"GRANT",points:20,actorUserId:actor.userId}}}});
  };
  const reserve=(sessionId:string,customerId:string,cardId:string,requestKey=randomUUID())=>run(storeId,tx=>reserveCourseInTransaction(tx,member(customerId),{sessionId,customerId,cardId,requestKey},null));
  return {kind,storeId,fixed,free,waiting,actor,member,template,input,create,card,reserve};
 }

 for(const kind of ["sports","music"] as const){
  it.each(["OPEN","ASSIGNED","MIXED"] as const)(`${kind}: regular single classes ignore charge selection even with configured fees (%s)`,async mode=>{
   const f=await fixture(kind,3);
   await db().coursePointPlan.create({data:{storeId:f.storeId,name:"已設定的單次收費",unit:"SESSION",points:1,price:800,validDays:30,templateIds:[f.template.id],...(kind==="sports"?{sportsMode:mode==="ASSIGNED"?"ASSIGNED":"OPEN",sportsSubjectId:f.template.musicSubjectId}:{}),chargeSettings:{kind:"single",durationMinutes:90,trialPrice:300,trialDuration:30,providerIds:[f.input.coachId]}}});
   if(kind==="music"){
    f.input.enrollmentMode=mode==="ASSIGNED"?"ASSIGNED":"OPEN";
    if(mode==="OPEN")f.input.learners=[];
   }else{
    f.input.sportsStaging={...f.input.sportsStaging!,enrollment:mode==="ASSIGNED"?"ASSIGNED":"OPEN",students:mode==="OPEN"?[]:f.input.sportsStaging!.students,...(mode==="ASSIGNED"?{waitlist:undefined}:{})};
   }
   const session=await f.create();
   expect(session.chargeSnapshot).toBeNull();
   expect(+session.endsAt-+session.startsAt).toBe(60*60_000);
   expect(await db().courseBooking.count({where:{sessionId:session.id}})).toBe(mode==="OPEN"?0:1);
   expect(await db().coursePurchase.count({where:{storeId:f.storeId}})).toBe(0);
  });
  it(`${kind}: action creates one public class, reserves fixed seats, replays once and rejects changed intent`,async()=>{
   const f=await fixture(kind,3),s=await f.create();await f.create();
   expect(await db().courseSession.count({where:{storeId:f.storeId}})).toBe(1);
   expect(await db().courseBooking.findMany({where:{sessionId:s.id}})).toMatchObject([{customerId:f.fixed,cardId:null,pointCost:0,bookingKind:"UNPAID"}]);
   expect(s.capacity).toBe(3);expect(s.bookingAudience).toBe("OPEN");
   const changed={...f.input,capacity:4};expect((await createCourseSchedule(changed)).success).toBe(false);
   expect(await db().coursePointEntry.count({where:{storeId:f.storeId}})).toBe(0);
  });
  it(`${kind}: two members race for the last seat without overselling or duplicate holds`,async()=>{
   const f=await fixture(kind),s=await f.create(),a=await f.card(f.free),b=await f.card(f.waiting);
   const attempts=await Promise.allSettled([f.reserve(s.id,f.free,a.id),f.reserve(s.id,f.waiting,b.id)]);
   expect(attempts.filter(result=>result.status==="fulfilled")).toHaveLength(1);
   expect(await db().courseBooking.count({where:{sessionId:s.id,status:{not:"CANCELLED"}}})).toBe(2);
   expect(await db().coursePointEntry.count({where:{storeId:f.storeId,kind:"RESERVE"}})).toBe(1);
  });
  it(`${kind}: fixed leave keeps class open; waitlist promotes once, then attendance and correction debit/restore once`,async()=>{
   const f=await fixture(kind,1),s=await f.create(),card=await f.card(f.waiting),requestKey=randomUUID();
   const input={sessionId:s.id,customerIds:[f.waiting],cardId:card.id,requestKey};
   const joined=await joinCourseWaitlist(f.member(f.waiting),input);expect(joined.position).toBe(1);
   await joinCourseWaitlist(f.member(f.waiting),input);expect(await db().courseWaitlistEntry.count({where:{sessionId:s.id}})).toBe(1);
   const fixed=await db().courseBooking.findFirstOrThrow({where:{sessionId:s.id,customerId:f.fixed}});
   await run(f.storeId,tx=>settleCourseBooking(tx,f.member(f.fixed),fixed.id,"STUDENT_LEAVE",undefined,{suppressNotice:true}));
   expect(await db().courseSession.findUnique({where:{id:s.id}})).toMatchObject({releasedAt:null});
   const promoted=await run(f.storeId,tx=>promoteCourseWaitlistForSession(tx,f.storeId,s.id));expect(promoted).toHaveLength(1);
   expect(await run(f.storeId,tx=>promoteCourseWaitlistForSession(tx,f.storeId,s.id))).toHaveLength(0);
   const id=promoted[0].bookingId,cost=kind==="sports"?3:1;
   await run(f.storeId,tx=>settleCourseBooking(tx,f.actor,id,"ATTENDED"));await run(f.storeId,tx=>settleCourseBooking(tx,f.actor,id,"ATTENDED"));
   expect(await db().coursePointCard.findUnique({where:{id:card.id}})).toMatchObject({remaining:20-cost});
   expect(await db().coursePointEntry.count({where:{bookingId:id,kind:"DEBIT"}})).toBe(1);
   await run(f.storeId,tx=>correctCourseAttendance(tx,f.actor,id,"RESERVED","ATTENDED",{suppressNotice:true}));
   await run(f.storeId,tx=>correctCourseAttendance(tx,f.actor,id,"RESERVED","ATTENDED",{suppressNotice:true}));
   expect(await db().coursePointCard.findUnique({where:{id:card.id}})).toMatchObject({remaining:20});
   expect(await db().courseBooking.count({where:{sessionId:s.id,status:"RESERVED"}})).toBe(1);
  });
  it(`${kind}: fixed and free seats use their own plan costs; a failed debit rolls back its binding`,async()=>{
   const f=await fixture(kind),s=await f.create(),fixedCard=await f.card(f.fixed,true),freeCard=await f.card(f.free);
   const fixed=await db().courseBooking.findFirstOrThrow({where:{sessionId:s.id,customerId:f.fixed}}),free=await f.reserve(s.id,f.free,freeCard.id);
   const balances=await run(f.storeId,async tx=>kind==="sports"?readSportsRosterBalances(f.storeId,s.id,[f.fixed,f.free],tx,undefined,await tx.courseBooking.findMany({where:{sessionId:s.id},include:{session:true}})):readMusicItemBalances(tx,f.storeId,[f.fixed,f.free],s));
   expect(balances.get(f.fixed)).toMatchObject({remaining:20,cost:kind==="sports"?2:1});
   expect(balances.get(f.free)).toMatchObject({remaining:20,available:kind==="sports"?17:19,cost:kind==="sports"?3:1});
   await Promise.all([run(f.storeId,tx=>settleCourseBooking(tx,f.actor,fixed.id,"ATTENDED")),run(f.storeId,tx=>settleCourseBooking(tx,f.actor,fixed.id,"ATTENDED"))]);
   expect(await db().coursePointEntry.count({where:{bookingId:fixed.id,kind:"DEBIT"}})).toBe(1);
   await run(f.storeId,tx=>settleCourseBooking(tx,f.actor,free.id,"ATTENDED"));
   expect(await db().coursePointCard.findUnique({where:{id:fixedCard.id}})).toMatchObject({remaining:kind==="sports"?18:19});
   expect(await db().coursePointCard.findUnique({where:{id:freeCard.id}})).toMatchObject({remaining:kind==="sports"?17:19});
   const poor=await fixture(kind),session=await poor.create();await poor.card(poor.fixed,true,0);
   const booking=await db().courseBooking.findFirstOrThrow({where:{sessionId:session.id}});
   await expect(run(poor.storeId,tx=>settleCourseBooking(tx,poor.actor,booking.id,"ATTENDED"))).rejects.toThrow(/足額|繳費|方案/);
   expect(await db().courseBooking.findUnique({where:{id:booking.id}})).toMatchObject({status:"RESERVED",cardId:null,pointCost:0});
  });
  it(`${kind}: a later database failure rolls back the class, every learner and audit intent`,async()=>{
   const f=await fixture(kind,3),reject=`reject-${randomUUID()}`;
   await db().$executeRaw`INSERT INTO "Customer" (id,"storeId",name) VALUES (${reject},${f.storeId},'隔離回滾探針')`;
   const input=kind==="music"?{...f.input,learners:[{customerId:f.fixed,cardId:null},{customerId:reject,cardId:null}]}:{...f.input,sportsStaging:{...f.input.sportsStaging!,students:[{customerId:f.fixed,cardId:null},{customerId:reject,cardId:null}]}};
   const before=await db().$queryRawUnsafe<Array<{last_value:bigint;is_called:boolean}>>(`SELECT last_value,is_called FROM mixed_insert_probe`);
   expect((await createCourseSchedule(input)).success).toBe(false);
   const after=await db().$queryRawUnsafe<Array<{last_value:bigint}>>(`SELECT last_value FROM mixed_insert_probe`);
   expect(Number(after[0].last_value)-(before[0].is_called?Number(before[0].last_value):0)).toBe(2);
   expect(await db().courseSession.count({where:{storeId:f.storeId}})).toBe(0);expect(await db().courseBooking.count({where:{storeId:f.storeId}})).toBe(0);
   const audits=await db().$queryRaw<Array<{count:bigint}>>`SELECT count(*) FROM public."OperationAuditOutbox" WHERE payload->>'storeId'=${f.storeId}`;expect(Number(audits[0].count)).toBe(0);
  });
  it.each(["overcapacity","duplicate"])(`${kind}: invalid fixed roster is rejected without partial classes (%s)`,async issue=>{
   const f=await fixture(kind,1),students=[{customerId:f.fixed,cardId:null},{customerId:issue==="duplicate"?f.fixed:f.free,cardId:null}];
   const input=kind==="music"?{...f.input,capacity:issue==="duplicate"?2:1,learners:students}:{...f.input,capacity:issue==="duplicate"?2:1,sportsStaging:{...f.input.sportsStaging!,students}};
   expect(await createCourseSchedule(input)).toMatchObject({success:false,error:expect.stringMatching(issue==="duplicate"?/重複/:/超過/)});
   expect(await db().courseSession.count({where:{storeId:f.storeId}})).toBe(0);expect(await db().courseBooking.count({where:{storeId:f.storeId}})).toBe(0);
  });
  it.each(["assignedSchedulingEnabled","selfBookingEnabled"] as const)(`${kind}: a closed mode blocks new mixed classes but not existing fixed attendance (%s)`,async mode=>{
   const f=await fixture(kind),s=await f.create();await f.card(f.fixed,true);
   await db().courseBookingRule.update({where:{storeId:f.storeId},data:{[mode]:false}});
   expect((await createCourseSchedule({...f.input,requestKey:randomUUID(),time:"11:00"})).success).toBe(false);
   const fixed=await db().courseBooking.findFirstOrThrow({where:{sessionId:s.id}});await run(f.storeId,tx=>settleCourseBooking(tx,f.actor,fixed.id,"ATTENDED"));
   expect(await db().courseSession.count({where:{storeId:f.storeId}})).toBe(1);
  });
  it(`${kind}: closing public selection pauses the existing queue without skipping it`,async()=>{
   const f=await fixture(kind,1),s=await f.create(),card=await f.card(f.waiting);
   await joinCourseWaitlist(f.member(f.waiting),{sessionId:s.id,customerIds:[f.waiting],cardId:card.id,requestKey:randomUUID()});
   await db().courseBookingRule.update({where:{storeId:f.storeId},data:{selfBookingEnabled:false}});
   const fixed=await db().courseBooking.findFirstOrThrow({where:{sessionId:s.id}});
   await run(f.storeId,tx=>settleCourseBooking(tx,f.actor,fixed.id,"STUDENT_LEAVE",undefined,{suppressNotice:true}));
   expect(await run(f.storeId,tx=>promoteCourseWaitlistForSession(tx,f.storeId,s.id))).toHaveLength(0);
   expect(await db().courseWaitlistEntry.findMany({where:{sessionId:s.id}})).toMatchObject([{status:"WAITING"}]);
   await db().courseBookingRule.update({where:{storeId:f.storeId},data:{selfBookingEnabled:true}});
   expect(await run(f.storeId,tx=>promoteCourseWaitlistForSession(tx,f.storeId,s.id))).toHaveLength(1);
  });
 }
 it("sports: a cancelled fixed learner rejoining publicly needs an open card, including at attendance",async()=>{
  const f=await fixture("sports",1),s=await f.create(),assigned=await f.card(f.fixed,true),open=await f.card(f.fixed);
  const original=await db().courseBooking.findFirstOrThrow({where:{sessionId:s.id}});
  await run(f.storeId,tx=>settleCourseBooking(tx,f.member(f.fixed),original.id,"STUDENT_LEAVE",undefined,{suppressNotice:true}));
  await expect(f.reserve(s.id,f.fixed,assigned.id)).rejects.toThrow("指定學員方案");
  const joined=await f.reserve(s.id,f.fixed,open.id);await run(f.storeId,tx=>settleCourseBooking(tx,f.actor,joined.id,"ATTENDED"));
  expect(await db().coursePointCard.findUnique({where:{id:assigned.id}})).toMatchObject({remaining:20});
  expect(await db().coursePointCard.findUnique({where:{id:open.id}})).toMatchObject({remaining:17});
 });
 it("sports: permanent mixed series materializes the fixed roster but keeps public seats empty",async()=>{
  const f=await fixture("sports",3);f.input.sportsStaging={...f.input.sportsStaging!,perpetual:true,frequency:"WEEKLY"};
  await f.create();await run(f.storeId,tx=>materializeSportsMonth(tx,f.actor,"2099-01-08","2099-01-15"));
  const sessions=await db().courseSession.findMany({where:{storeId:f.storeId},include:{bookings:true}});expect(sessions).toHaveLength(3);
  for(const s of sessions){expect(s.capacity).toBe(3);expect(s.bookings).toMatchObject([{customerId:f.fixed,bookingKind:"UNPAID"}]);}
 });
 it("music: fixed mixed series carries its roster into subsequent generated lessons",async()=>{
  const f=await fixture("music",3);Object.assign(f.input,{scheduleType:"FIXED",scheduleFrequency:"WEEKLY"});await f.create();
  try{vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2099-01-02T00:00Z"));await materializeCourseScheduleSeries();}finally{vi.useRealTimers();}
  const sessions=await db().courseSession.findMany({where:{storeId:f.storeId},include:{bookings:true}});expect(sessions).toHaveLength(5);
  for(const s of sessions){expect(s.capacity).toBe(3);expect(s.bookingAudience).toBe("OPEN");expect(s.bookings).toMatchObject([{customerId:f.fixed,bookingKind:"UNPAID"}]);}
 });
});
