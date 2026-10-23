/**
 * Real Prisma/SQL services against an explicitly disposable loopback PostgreSQL.
 * Authentication and Next refresh are stubbed; database writes are not mocked.
 * The local PGlite TCP runner is single-connection and does not prove races.
 */
import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
const access=vi.hoisted(()=>({manager:vi.fn(),transaction:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseManager:access.manager,courseTransaction:access.transaction}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{}}));
vi.mock("@/lib/db",()=>({prisma:{}}));
vi.mock("@/lib/auth",()=>({auth:vi.fn()}));
vi.mock("@/lib/feature-gate",()=>({getStoreLimitsByStoreId:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn(),unstable_cache:(fn:unknown)=>fn}));
vi.mock("next/server",()=>({after:vi.fn()}));
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {PrismaClient,type Prisma} from "../../generated/course-client";
import {resolveBookingConcurrencyTestDatabaseUrl} from "./helpers/booking-concurrency-test-db";
import {syntheticOpeningRecord} from "./fixtures/music-opening";
import {planMusicOpeningBatch,type MusicOpeningScope} from "@/lib/music-opening-state";
import {settleCourseBooking,correctCourseAttendance} from "@/server/services/course-booking";
import {markCourseTeacherAttendance} from "@/server/actions/course-members";
import {lockCourseStore} from "@/server/services/course-store-lock";
const databaseUrl=resolveBookingConcurrencyTestDatabaseUrl(process.env);
const schema=`opening_transactions_${randomUUID().replaceAll("-","")}`;
const url=databaseUrl?new URL(databaseUrl):null;
url?.searchParams.set("schema",schema);url?.searchParams.set("connection_limit","1");
const db=url?new PrismaClient({datasourceUrl:url.toString()}):null;
const database=()=>{if(!db)throw new Error("Explicit disposable database required");return db;};
const transact=<T>(storeId:string,work:(tx:Prisma.TransactionClient)=>Promise<T>)=>database().$transaction(async tx=>{
  await lockCourseStore(tx,storeId);return work(tx);
},{timeout:15000});

(databaseUrl?describe:describe.skip)("music opening — actual PostgreSQL transactions",()=>{
  let created=false;
  beforeAll(async()=>{
    await database().$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;
    await database().$executeRawUnsafe(`SET search_path TO "${schema}"`);
    const ddl=execFileSync("node_modules/.bin/prisma",["migrate","diff","--from-empty","--to-schema-datamodel","course-prisma/schema.prisma","--script"],{encoding:"utf8"});
    for(const sql of ddl.split(";").map(s=>s.trim()).filter(Boolean))await database().$executeRawUnsafe(sql);
    for(const sql of [
      'CREATE TABLE "Store"(id text PRIMARY KEY,"industryModule" text)',
      'CREATE TABLE "Staff"(id text PRIMARY KEY,"storeId" text,"courseDefaultClassFee" numeric)',
      'CREATE TABLE "MessageTemplate"(id text PRIMARY KEY,"storeId" text,body text)',
      'CREATE TABLE "StoreFeatureEntitlement"("storeId" text,"featureKey" text,status text)',
      'CREATE TABLE "CourseTeacherCompensationSetting"("storeId" text,"staffId" text,"defaultRatio" double precision,"subjectRules" jsonb,revision integer)',
      'CREATE TABLE "AuditLog"(id text PRIMARY KEY,"actorUserId" text,"actorNameSnapshot" text,"storeId" text,module text,summary text,"targetType" text,"targetId" text,action text,"beforeJson" jsonb,"afterJson" jsonb,"createdAt" timestamptz)',
    ])await database().$executeRawUnsafe(sql);
    // Roles already exist on native test PostgreSQL CI; create only in disposable DB if absent.
    await database().$executeRawUnsafe(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$`);
    const adapt=(sql:string)=>sql.replaceAll("public.",`"${schema}".`).replaceAll("search_path=public",`search_path="${schema}"`).replaceAll("search_path = public",`search_path = "${schema}"`);
    // Keep each complete PL/pgSQL function intact, preserving migration order.
    const notification=readFileSync("supabase/migrations/20261002093141_course_coach_notifications.sql","utf8");
    for(const chunk of notification.split(/(CREATE FUNCTION[\s\S]*?END \$\$;)/g)){
      const statements=chunk.startsWith("CREATE FUNCTION")?[chunk]:chunk.split(";");
      for(const sql of statements.map(s=>s.trim()).filter(Boolean))await database().$executeRawUnsafe(adapt(sql));
    }
    const compensation=readFileSync("prisma/migrations/20260929140000_course_staff_person_link/migration.sql","utf8").match(/CREATE OR REPLACE FUNCTION course_capture_compensation\(\)[\s\S]*?END \$\$;/)?.[0];
    if(!compensation)throw new Error("Actual compensation trigger definition missing");
    await database().$executeRawUnsafe(adapt(compensation));
    await database().$executeRawUnsafe('CREATE TRIGGER capture_compensation AFTER INSERT OR UPDATE ON "CourseSession" FOR EACH ROW EXECUTE FUNCTION course_capture_compensation()');
    access.transaction.mockImplementation(transact);
  },30000);
  afterAll(async()=>{
    try{if(created)await database().$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);}
    finally{await db?.$disconnect();}
  });

  async function fixture(classType="PRIVATE",learners=1){
    const storeId=randomUUID(),coachId=randomUUID(),otherCoachId=randomUUID();
    await database().$executeRaw`INSERT INTO "Store" VALUES(${storeId},'COURSE')`;
    await database().$executeRaw`INSERT INTO "Staff" VALUES(${coachId},${storeId},NULL),(${otherCoachId},${storeId},NULL)`;
    await database().$executeRaw`INSERT INTO "StoreFeatureEntitlement" VALUES(${storeId},'business.music','ENABLED')`;
    const room=await database().courseRoom.create({data:{storeId,name:"Synthetic room"}});
    const template=await database().courseTemplate.create({data:{storeId,name:"Synthetic template",durationMinutes:60,pointCost:1,capacity:learners,classType,musicTermLessons:4,musicPricePerLesson:800,musicTeacherShare:0.6,waitlistEnabled:false}});
    const plan=await database().coursePointPlan.create({data:{storeId,name:"Synthetic plan",points:4,price:3200,validDays:35,unit:"SESSION",templateIds:[template.id],musicTerms:1,lowBalanceEnabled:false}});
    const session=await database().courseSession.create({data:{storeId,templateId:template.id,roomId:room.id,coachId,nameSnapshot:"Synthetic opening lesson",startsAt:new Date("2026-10-01T02:00:00Z"),endsAt:new Date("2026-10-01T03:00:00Z"),pointCost:1,capacity:learners,requestKey:randomUUID(),requestIndex:0,createdById:"synthetic-actor"}});
    const cards=[],bookings=[];
    for(let n=0;n<learners;n++){
      const customerId=randomUUID(),record=syntheticOpeningRecord();record.sourceRecordKey=customerId;record.sourceStudentKey=customerId;
      const scope:MusicOpeningScope={version:1,targetStoreId:storeId,sourceSystem:"YINJIAOYUN",sourceTenantKey:"synthetic-pg",timeZone:"Asia/Taipei",cutoffBusinessDate:"2026-10-01"};
      const batch=planMusicOpeningBatch({scope,batchId:"synthetic-pg-batch",records:[record]},[]);if(batch.status!=="READY")throw new Error("Invalid synthetic record");
      const card=await database().coursePointCard.create({data:{storeId,planId:plan.id,nameSnapshot:plan.name,unit:"SESSION",templateIds:[template.id],remaining:2,expiresAt:new Date(record.expiresAt!),musicActivatedAt:new Date(record.activatedAt!),musicValidityDays:35,musicTermSizes:[4],musicOpeningStateRequired:true,requestKey:randomUUID()}});
      await database().courseCardMember.create({data:{storeId,cardId:card.id,customerId}});
      await database().courseMusicOpeningState.create({data:{storeId,cardId:card.id,customerId,sourceKey:batch.entries[0].key,contentHash:batch.entries[0].contentHash,snapshot:JSON.parse(JSON.stringify({scope,record})),appliedBatchId:"synthetic-pg-batch",teacherFeePolicy:"UNVERIFIED"}});
      const booking=await database().courseBooking.create({data:{storeId,sessionId:session.id,cardId:card.id,customerId,operatorUserId:"synthetic-actor",operatorName:"Synthetic actor",customerName:`Synthetic learner ${n}`,pointCost:1,requestKey:randomUUID(),musicOpeningTermKey:"synthetic-term-7",musicOpeningLessonOrdinal:3,musicOpeningSourceLessonKey:`synthetic-lesson-${n}`}});
      cards.push(card);bookings.push(booking);
    }
    access.manager.mockResolvedValue({storeId,user:{id:"synthetic-actor",name:"Synthetic actor"}});
    return {storeId,cards,bookings,session,coachId,otherCoachId,actor:{storeId,userId:"synthetic-actor",name:"Synthetic actor"}};
  }
  async function assertRestored(f:Awaited<ReturnType<typeof fixture>>){
    for(const original of f.cards){const card=await database().coursePointCard.findUniqueOrThrow({where:{id:original.id}});expect(card.remaining).toBe(2);expect(card.musicActivatedAt).toEqual(original.musicActivatedAt);expect(card.expiresAt).toEqual(original.expiresAt);}
    for(const b of f.bookings)expect(await database().courseBooking.findUnique({where:{id:b.id}})).toMatchObject({status:"RESERVED",absenceKind:null,musicOpeningLessonOrdinal:3});
    expect(await database().coursePurchase.count({where:{storeId:f.storeId}})).toBe(0);
    expect(await database().courseFeePayment.count({where:{storeId:f.storeId}})).toBe(0);
    expect(await database().courseWaitlistEntry.count({where:{storeId:f.storeId}})).toBe(0);
    expect(await database().$queryRaw`SELECT count(*)::int n FROM "CourseCoachNotification" WHERE "storeId"=${f.storeId}`).toEqual([{n:0}]);
  }
  it.each(["PRIVATE","GROUP"])("%s leave, repeat and restore preserve original term/dates",async classType=>{
    const f=await fixture(classType),b=f.bookings[0];
    await database().$executeRaw`INSERT INTO "MessageTemplate" VALUES(${`course-coach-change:${f.storeId}`},${f.storeId},'enabled'),(${`course-coach-trial:${f.storeId}`},${f.storeId},'enabled')`;
    await transact(f.storeId,tx=>settleCourseBooking(tx,f.actor,b.id,"STUDENT_LEAVE"));
    await transact(f.storeId,tx=>settleCourseBooking(tx,f.actor,b.id,"STUDENT_LEAVE"));
    expect(await database().coursePointCard.findUnique({where:{id:f.cards[0].id}})).toMatchObject({remaining:classType==="GROUP"?1:2});
    expect(await database().courseBooking.findUnique({where:{id:b.id}})).toMatchObject({status:"CANCELLED",absenceKind:classType==="GROUP"?"GROUP_LEAVE_FORFEITED":"STUDENT_LEAVE"});
    await transact(f.storeId,tx=>correctCourseAttendance(tx,f.actor,b.id,"RESERVED","CANCELLED"));
    await assertRestored(f);
  });
  it("NO_SHOW consumes once, blocks makeup coupon, rejects stale correction, then restores",async()=>{
    const f=await fixture(),b=f.bookings[0];
    await expect(transact(f.storeId,tx=>settleCourseBooking(tx,f.actor,b.id,"NO_SHOW","DEDUCTED_WITH_MAKEUP"))).rejects.toThrow("不發補課券");
    await transact(f.storeId,tx=>settleCourseBooking(tx,f.actor,b.id,"NO_SHOW"));
    await transact(f.storeId,tx=>settleCourseBooking(tx,f.actor,b.id,"NO_SHOW"));
    expect(await database().coursePointCard.findUnique({where:{id:f.cards[0].id}})).toMatchObject({remaining:1});
    expect(await database().coursePointEntry.count({where:{bookingId:b.id,kind:"DEBIT"}})).toBe(1);
    await expect(transact(f.storeId,tx=>correctCourseAttendance(tx,f.actor,b.id,"RESERVED","ATTENDED"))).rejects.toThrow("另一位人員");
    await transact(f.storeId,tx=>correctCourseAttendance(tx,f.actor,b.id,"RESERVED","NO_SHOW"));
    expect(await database().coursePointCard.count({where:{storeId:f.storeId}})).toBe(1);
    await assertRestored(f);
  });
  it.each(["LEAVE","NO_SHOW"])("teacher %s action refunds only debits and restores mixed learners",async status=>{
    const f=await fixture("GROUP",2);
    await transact(f.storeId,tx=>settleCourseBooking(tx,f.actor,f.bookings[0].id,"ATTENDED"));
    expect(await markCourseTeacherAttendance({sessionId:f.session.id,status,expectedStatus:"SCHEDULED"})).toMatchObject({success:true});
    expect(await database().courseBooking.count({where:{sessionId:f.session.id,status:"CANCELLED",absenceKind:"TEACHER_ABSENT"}})).toBe(2);
    expect(await markCourseTeacherAttendance({sessionId:f.session.id,status:"SCHEDULED",expectedStatus:status})).toMatchObject({success:true});
    await assertRestored(f);
  });
  it("invalid second opening rolls back teacher status, audit and first learner atomically",async()=>{
    const f=await fixture("GROUP",2);
    await transact(f.storeId,tx=>settleCourseBooking(tx,f.actor,f.bookings[0].id,"ATTENDED"));
    await database().courseMusicOpeningState.update({where:{cardId_storeId:{cardId:f.cards[1].id,storeId:f.storeId}},data:{contentHash:"0".repeat(64)}});
    const before=await database().coursePointEntry.count({where:{storeId:f.storeId}});
    expect(await markCourseTeacherAttendance({sessionId:f.session.id,status:"LEAVE",expectedStatus:"SCHEDULED"})).toMatchObject({success:false});
    expect(await database().courseSession.findUnique({where:{id:f.session.id}})).toMatchObject({teacherAttendance:"SCHEDULED"});
    expect(await database().coursePointCard.findUnique({where:{id:f.cards[0].id}})).toMatchObject({remaining:1});
    expect(await database().courseBooking.findUnique({where:{id:f.bookings[0].id}})).toMatchObject({status:"ATTENDED"});
    expect(await database().coursePointEntry.count({where:{storeId:f.storeId}})).toBe(before);
    expect(await database().$queryRaw`SELECT count(*)::int n FROM "AuditLog" WHERE "storeId"=${f.storeId}`).toEqual([{n:0}]);
  });
  it("real CHANGE trigger enqueues; a precommit assertion rolls back rather than deleting after commit",async()=>{
    const f=await fixture();
    await database().$executeRaw`INSERT INTO "MessageTemplate" VALUES(${`course-coach-change:${f.storeId}`},${f.storeId},'enabled')`;
    await expect(transact(f.storeId,async tx=>{
      await tx.courseSession.update({where:{id:f.session.id},data:{teacherAttendance:"LEAVE"}});
      const queued=await tx.$queryRaw<Array<{n:number}>>`SELECT count(*)::int n FROM "CourseCoachNotification" WHERE "storeId"=${f.storeId}`;
      expect(queued[0].n).toBe(1);throw new Error("Synthetic acceptance prohibits queued notifications");
    })).rejects.toThrow("prohibits queued");
    expect(await database().courseSession.findUnique({where:{id:f.session.id}})).toMatchObject({teacherAttendance:"SCHEDULED"});
    await assertRestored(f);
  });
  it("database locks past teacher identity and captures future reassignment in rollback",async()=>{
    const f=await fixture();
    await expect(transact(f.storeId,tx=>tx.courseSession.update({where:{id:f.session.id},data:{coachId:f.otherCoachId}}))).rejects.toThrow("started course");
    const start=new Date(Date.now()+7*86400000),end=new Date(start.getTime()+3600000);
    const future=await database().courseSession.create({data:{storeId:f.storeId,templateId:f.session.templateId,roomId:f.session.roomId,coachId:f.coachId,nameSnapshot:"Synthetic future",startsAt:start,endsAt:end,pointCost:1,capacity:1,requestKey:randomUUID(),requestIndex:0,createdById:"synthetic-actor"}});
    await expect(transact(f.storeId,async tx=>{
      await tx.courseSession.update({where:{id:future.id},data:{coachId:f.otherCoachId}});
      expect(await tx.courseCompensationSnapshot.findUnique({where:{sessionId:future.id}})).toMatchObject({staffId:f.otherCoachId});
      throw new Error("Always rollback teacher reassignment acceptance");
    })).rejects.toThrow("Always rollback");
    expect(await database().courseSession.findUnique({where:{id:future.id}})).toMatchObject({coachId:f.coachId});
    await assertRestored(f);
  });
});
