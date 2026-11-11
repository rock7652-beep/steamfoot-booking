import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { PrismaClient, type Prisma } from "../../generated/course-client";
import { resolveBookingConcurrencyTestDatabaseUrl } from "./helpers/booking-concurrency-test-db";
import { installAuditOutboxTestSchema } from "./helpers/audit-outbox-test-schema";
import { sportsTeachingTemplateId, saveSportsTeachingRule, readSportsTeachingRule } from "@/server/services/sports-teaching-rule";
import { findSportsCard } from "@/server/services/sports-card-selection";
import { attachSportsSessionRules } from "@/server/services/sports-staging-schedule";
import { addSportsFixedLearners } from "@/server/services/sports-permanent-series";
import { correctCourseAttendance, reserveCourse, reserveCourseInTransaction, settleCourseBooking } from "@/server/services/course-booking";
import {courseTransaction} from "@/server/services/course-access";
import { lockCourseStore } from "@/server/services/course-store-lock";

// Authorization/environment boundary only: business reads/writes and store locks use PostgreSQL.
vi.mock("@/server/services/plan-activation-enqueue",()=>({enqueuePlanActivation:vi.fn()}));
vi.mock("@/server/services/plan-activation-notification-kick",()=>({kickPlanActivationNotifications:vi.fn()}));
vi.mock("@/server/services/course-sale-allocation",()=>({courseSaleSnapshot:async()=>({storeCostSnapshot:0,developerProfitSnapshot:0,developerNameSnapshot:null,revenueStaffId:null})}));
vi.mock("@/lib/sports-native-preview", () => ({ sportsNativePreview: () => true }));
vi.mock("@/lib/sports-staging", () => ({ requireSportsStaging: vi.fn(), sportsStagingEnabled: () => true }));
vi.mock("@/server/services/sports-production-readiness", () => ({ sportsRulesAvailable: async () => true, assertSportsProductionReady: vi.fn(), assertSportsBookingReadReady: vi.fn() }));
vi.mock("@/lib/feature-gate", () => ({ getStoreLimitsByStoreId: async () => ({ maxMonthlyBookings: null }) }));
vi.mock("@/server/services/course-business-profile", () => ({ isMusicCourseStore: async () => false }));
vi.mock("@/server/services/course-access", () => ({ courseTransaction: vi.fn() }));

const url = resolveBookingConcurrencyTestDatabaseUrl(process.env);
const schema = `sports_cards_${randomUUID().replaceAll("-", "")}`;
const scoped = url ? new URL(url) : null;
scoped?.searchParams.set("schema", schema);
const db = scoped ? new PrismaClient({ datasourceUrl: scoped.toString() }) : null;
const database = () => { if (!db) throw new Error("Explicit isolated database required"); return db; };

(url ? describe : describe.skip)("sports card modes — isolated PostgreSQL", () => {
  let migrationAccessBefore:unknown;
  const migrationAccess=()=>database().$queryRawUnsafe(`SELECT relname,relrowsecurity,relforcerowsecurity,relacl::text FROM pg_class WHERE relnamespace='${schema}'::regnamespace AND relname IN ('CoursePointPlan','CoursePointCard','CoursePurchase') ORDER BY relname`);
  beforeAll(async () => {
    vi.mocked(courseTransaction).mockImplementation(async(storeId,work)=>database().$transaction(async tx=>{await lockCourseStore(tx,storeId);return work(tx);}));
    await database().$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await installAuditOutboxTestSchema(url!, database());
    const ddl = execFileSync("node_modules/.bin/prisma", ["migrate", "diff", "--from-empty", "--to-schema-datamodel", "course-prisma/schema.prisma", "--script"], { encoding: "utf8" });
    for (const sql of ddl.split(";").map(s => s.trim()).filter(Boolean)) await database().$executeRawUnsafe(sql);
    // Rehearse the exact additive candidate against the complete generated schema.
    await database().$transaction(async tx=>{
      for(const table of ["CoursePointPlan","CoursePurchase","CoursePointCard"])await tx.$executeRawUnsafe(`ALTER TABLE "${table}" DROP COLUMN "sportsMode", DROP COLUMN "sportsSubjectId", DROP COLUMN "sportsCost", DROP COLUMN "sportsSubjectIds"`);
      const candidate=readFileSync("scripts/sql/sports-entitlement-candidate.sql","utf8").replace(/^--.*$/gm,"").replaceAll("public.",`"${schema}".`);
      for(const sql of candidate.split(";").map(s=>s.trim()).filter(s=>s&&s!=="BEGIN"&&s!=="COMMIT"))await tx.$executeRawUnsafe(sql);
    });
    // Rehearse the new additive migration with populated old snapshots, no conversion.
    await database().$executeRawUnsafe(`INSERT INTO "CoursePointPlan" (id,"storeId",name,points,"validDays","sportsMode","sportsSubjectId","sportsCost") VALUES ('migration-plan','migration-store','Old scoped plan',20,90,'ASSIGNED','old-A',2)`);
    await database().$executeRawUnsafe(`INSERT INTO "CoursePointCard" (id,"storeId","planId","nameSnapshot",remaining,"expiresAt","requestKey","sportsMode") VALUES ('migration-card','migration-store','migration-plan','Old unscoped card',19,'2099-02-08','old-purchase','OPEN')`);
    await database().$executeRawUnsafe(`INSERT INTO "CoursePurchase" (id,"storeId","customerId","planId",name,unit,points,price,"validDays","templateIds","transferLastFive","requestKey") VALUES ('migration-order','migration-store','old-learner','migration-plan','Old purchase','POINT',20,8550,90,ARRAY[]::text[],'','old-order')`);
    for(const table of ['CoursePointPlan','CoursePointCard','CoursePurchase'])await database().$executeRawUnsafe(`ALTER TABLE \"${table}\" ENABLE ROW LEVEL SECURITY`);
    migrationAccessBefore=await migrationAccess();
    const migration=readFileSync('supabase/migrations/20261111050549_course_multi_subject_entitlements.sql','utf8').replace(/^--.*$/gm,'').replaceAll('public.',`"${schema}".`);
    await database().$transaction(async tx=>{for(const sql of migration.split(';').map(s=>s.trim()).filter(s=>s&&s!=='BEGIN'&&s!=='COMMIT'))await tx.$executeRawUnsafe(sql);});
    await database().$executeRawUnsafe('CREATE TABLE "Store" (id text PRIMARY KEY,"industryModule" text NOT NULL DEFAULT \'COURSE\',"operatingStatus" text NOT NULL DEFAULT \'ACTIVE\')');
    await database().$executeRawUnsafe('CREATE TABLE "Customer" (id text PRIMARY KEY,"storeId" text,name text,"mergedIntoCustomerId" text)');
    await database().$executeRawUnsafe('CREATE TABLE "Staff" (id text PRIMARY KEY,"storeId" text,status text,"displayName" text,"courseCoachEnabled" boolean,"courseQualificationsConfirmed" boolean,"courseQualifiedTemplateIds" text[],"updatedAt" timestamptz DEFAULT now())');
    await database().$executeRawUnsafe('CREATE TABLE "AuditLog" (id text PRIMARY KEY,"actorUserId" text,"actorNameSnapshot" text,"storeId" text,module text,summary text,"targetType" text,"targetId" text,action text,"beforeJson" jsonb,"afterJson" jsonb,"createdAt" timestamptz)');
    await database().$executeRawUnsafe('CREATE TABLE "BusinessHours" ("storeId" text,"dayOfWeek" integer,"isOpen" boolean)');
    await database().$executeRawUnsafe('CREATE TABLE "SpecialBusinessDay" ("storeId" text,date date,type text)');
    await database().$executeRawUnsafe('CREATE TABLE "SportsStagingSessionRule" ("sessionId" text PRIMARY KEY,"storeId" text,frequency text,enrollment text,"planId" text,"trialPrice" integer,payload jsonb)');
  }, 30000);
  afterAll(async () => { if (db) { await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); await db.$disconnect(); } });

  async function fixture() {
    const storeId = randomUUID(), coachId = randomUUID(), learner = randomUUID(), other = randomUUID();
    await database().$executeRaw`INSERT INTO "Store" (id) VALUES (${storeId})`;
    for (const id of [learner, other]) await database().$executeRaw`INSERT INTO "Customer" VALUES (${id},${storeId},'合成學員',NULL)`;
    await database().$executeRaw`INSERT INTO "Staff" (id,"storeId",status,"courseCoachEnabled","courseQualifiedTemplateIds") VALUES (${coachId},${storeId},'ACTIVE',true,ARRAY[]::text[])`;
    const subject = await database().musicSubject.create({ data: { storeId, name: "合成項目" } });
    const template = await database().courseTemplate.create({ data: { id: sportsTeachingTemplateId(storeId, subject.id), storeId, musicSubjectId: subject.id, name: "合成課程", durationMinutes: 60, pointCost: 3, capacity: 8 } });
    const room = await database().courseRoom.create({ data: { storeId, name: "隔離空間" } });
    const actor = { storeId, userId: storeId, name: "合成店長" };
    const run = <T,>(work: (tx: Prisma.TransactionClient) => Promise<T>) => database().$transaction(async tx => { await lockCourseStore(tx, storeId); return work(tx); });
    const session = (index: number, cost = 3, templateId = template.id, capacity = 8) => database().courseSession.create({ data: {
      storeId, templateId, roomId: room.id, coachId, nameSnapshot: "合成課程", pointCost: cost, capacity,
      startsAt: new Date(Date.UTC(2099, 0, 1 + index * 7, 1)), endsAt: new Date(Date.UTC(2099, 0, 1 + index * 7, 2)), requestKey: "schedule", requestIndex: index, createdById: storeId,
    } });
    const card = async (customerId = learner, mode = "ASSIGNED", cost = 2, remaining = 10, expiresAt = new Date("2099-12-31")) => {
      const rights = { sportsMode: mode, sportsSubjectId: mode === "ASSIGNED" ? subject.id : null, sportsCost: mode === "ASSIGNED" ? cost : null };
      const plan = await database().coursePointPlan.create({ data: { storeId, name: randomUUID(), points: remaining, validDays: 90, ...rights } });
      return database().coursePointCard.create({ data: { storeId, planId: plan.id, nameSnapshot: plan.name, remaining, expiresAt, requestKey: randomUUID(), ...rights, members: { create: { customerId } } } });
    };
    const rule = { enrollment: "ASSIGNED" as const, frequency: "WEEKLY" as const, planId: null, students: [{ customerId: learner, cardId: null }], trialPrice: 0 };
    return { storeId, coachId, learner, other, subject, template, actor, run, session, card, rule };
  }

  it("retains an already-bound old OPEN card and its original cost without granting new cross-subject use",async()=>{
    const f=await fixture(),old=await f.card(f.learner,'OPEN',1,10),newer=await f.card(f.learner,'ASSIGNED',1,20),session=await f.session(0);
    await database().$executeRaw`INSERT INTO "SportsStagingSessionRule" VALUES (${session.id},${f.storeId},'SINGLE','OPEN',NULL,0,'{}')`;
    const booking=await database().courseBooking.create({data:{storeId:f.storeId,sessionId:session.id,cardId:old.id,customerId:f.learner,customerName:'合成舊預約',operatorName:'合成店長',operatorUserId:f.actor.userId,pointCost:2,requestKey:randomUUID()}});
    await database().coursePointEntry.create({data:{storeId:f.storeId,bookingId:booking.id,cardId:old.id,kind:'RESERVE',points:2,actorUserId:f.actor.userId}});
    await f.run(tx=>settleCourseBooking(tx,f.actor,booking.id,'ATTENDED'));
    await f.run(tx=>settleCourseBooking(tx,f.actor,booking.id,'ATTENDED'));
    expect(await database().courseBooking.findUniqueOrThrow({where:{id:booking.id}})).toMatchObject({cardId:old.id,pointCost:2,status:'ATTENDED'});
    expect((await database().coursePointCard.findUniqueOrThrow({where:{id:old.id}})).remaining).toBe(8);
    expect((await database().coursePointCard.findUniqueOrThrow({where:{id:newer.id}})).remaining).toBe(20);
    expect(await database().coursePointEntry.count({where:{bookingId:booking.id,kind:'DEBIT'}})).toBe(1);
  });

  it("old-card confirmation is atomic, idempotent, and preserves paid balances and expiry",async()=>{
    const {readSubjectReviewCard,cardSubjectRevision,confirmCardSubject}=await import('@/server/services/course-card-subject');
    const f=await fixture(),old=await f.card(f.learner,'OPEN',1,19);
    const before=await f.run(tx=>readSubjectReviewCard(tx,f.storeId,old.id));
    const input={cardId:old.id,customerId:f.learner,subjectId:f.subject.id,cost:1,expectedRevision:cardSubjectRevision(before),requestKey:randomUUID()};
    await expect(f.run(async tx=>{await confirmCardSubject(tx,f.actor,input);throw new Error('forced rollback');})).rejects.toThrow('forced rollback');
    expect(await database().coursePointCard.findUniqueOrThrow({where:{id:old.id}})).toEqual(old);
    await f.run(tx=>confirmCardSubject(tx,f.actor,input));await f.run(tx=>confirmCardSubject(tx,f.actor,input));
    const after=await database().coursePointCard.findUniqueOrThrow({where:{id:old.id}});
    expect(after).toMatchObject({remaining:old.remaining,expiresAt:old.expiresAt,sportsMode:'ASSIGNED',sportsSubjectId:f.subject.id,sportsCost:1});
    expect(await database().coursePointEntry.count({where:{cardId:old.id}})).toBe(0);
    const audit=await database().$queryRaw<Array<{count:bigint}>>`SELECT COUNT(*) AS count FROM "AuditLog" WHERE "targetId"=${old.id} AND action='CONFIRM_CARD_SUBJECT'`;
    expect(Number(audit[0].count)).toBe(1);
  });

  it("finite scheduling uses each learner's purchase cost and preserves snapshots after edits", async () => {
    const f = await fixture(), a = await f.card(), b = await f.card(f.other, "ASSIGNED", 4);
    const sessions = [await f.session(0), await f.session(1)];
    await f.run(tx => attachSportsSessionRules(tx, f.actor, "schedule", { ...f.rule, students: [...f.rule.students, { customerId: f.other, cardId: null }] }));
    const bookings = await database().courseBooking.findMany({ where: { storeId: f.storeId }, orderBy: { pointCost: "asc" } });
    expect(bookings.map(b => b.pointCost)).toEqual([0, 0, 0, 0]);
    await database().coursePointPlan.update({ where: { id: a.planId }, data: { sportsCost: 9 } });
    expect(await database().coursePointCard.findUnique({ where: { id: a.id } })).toMatchObject({ sportsCost: 2, remaining: 10 });
    for (const card of [a, b]) {
      const booking = bookings.find(row => row.customerId === (card.id===a.id?f.learner:f.other) && row.sessionId === sessions[0].id)!;
      await f.run(tx => settleCourseBooking(tx, f.actor, booking.id, "ATTENDED"));
      await f.run(tx => settleCourseBooking(tx, f.actor, booking.id, "ATTENDED"));
      expect(await database().coursePointCard.findUnique({ where: { id: card.id } })).toMatchObject({ remaining: 10 - (card.id===a.id?2:4) });
      expect(await database().coursePointEntry.count({ where: { bookingId: booking.id, kind: "DEBIT" } })).toBe(1);
      await f.run(tx=>correctCourseAttendance(tx,f.actor,booking.id,"RESERVED","ATTENDED",{suppressNotice:true}));
      await f.run(tx=>correctCourseAttendance(tx,f.actor,booking.id,"RESERVED","ATTENDED",{suppressNotice:true}));
      await f.run(tx=>settleCourseBooking(tx,f.actor,booking.id,"CANCELLED"));
      expect(await database().coursePointCard.findUnique({where:{id:card.id}})).toMatchObject({remaining:10});
    }
  });

  it("same-subject cards work in both enrollment modes while unscoped and B/C cards cannot fund A", async () => {
    const f=await fixture(),old=await f.card(f.learner,"OPEN"),a=await f.card(f.learner,"ASSIGNED",2,10);
    const other=await database().musicSubject.create({data:{storeId:f.storeId,name:'B'}});
    const b=await f.card(f.learner,"ASSIGNED",1,20);
    await database().coursePointCard.update({where:{id:b.id},data:{sportsSubjectId:other.id}});
    for(const [index,enrollment] of ['OPEN','ASSIGNED'].entries()){
      const session=await f.session(index);
      await f.run(tx=>attachSportsSessionRules(tx,f.actor,'schedule',{...f.rule,enrollment:enrollment as 'OPEN'|'ASSIGNED',students:[]},[session.id]));
      for(const [cardId,message] of [[old.id,'科目待核對'],[b.id,'科目不符']])await expect(f.run(tx=>reserveCourseInTransaction(tx,f.actor,{sessionId:session.id,cardId,customerId:f.learner,requestKey:randomUUID()},null))).rejects.toThrow(message);
      const booking=await f.run(tx=>reserveCourseInTransaction(tx,f.actor,{sessionId:session.id,cardId:a.id,customerId:f.learner,requestKey:randomUUID()},null));
      await f.run(tx=>settleCourseBooking(tx,f.actor,booking.id,'ATTENDED'));
      await f.run(tx=>settleCourseBooking(tx,f.actor,booking.id,'ATTENDED'));
      expect(await database().coursePointEntry.count({where:{bookingId:booking.id,kind:'DEBIT'}})).toBe(1);
    }
    expect((await database().coursePointCard.findUniqueOrThrow({where:{id:a.id}})).remaining).toBe(6);
    expect((await database().coursePointCard.findUniqueOrThrow({where:{id:b.id}})).remaining).toBe(20);
  });

  it("fixed places reserve no money; attendance skips insufficient and expired cards and debits once", async () => {
    const f = await fixture(), s = await f.session(0);
    await f.card(f.learner, "ASSIGNED", 2, 1, new Date("2099-01-15"));
    await f.card(f.learner, "ASSIGNED", 2, 20, new Date("2020-01-01"));
    const usable = await f.card(f.learner, "ASSIGNED", 4, 10, new Date("2099-02-01"));
    await f.card(f.learner, "ASSIGNED", 2, 10);
    await database().$executeRaw`INSERT INTO "SportsStagingSessionRule" VALUES (${s.id},${f.storeId},'WEEKLY','ASSIGNED',NULL,0,'{}')`;
    await f.run(tx => addSportsFixedLearners(tx, f.actor, s, { ...f.rule, perpetual: true }));
    const booking = await database().courseBooking.findFirstOrThrow({ where: { sessionId: s.id } });
    expect(booking).toMatchObject({ cardId: null, pointCost: 0, bookingKind: "UNPAID" });
    expect(await database().coursePointEntry.count({ where: { storeId: f.storeId } })).toBe(0);
    await f.run(tx => settleCourseBooking(tx, f.actor, booking.id, "ATTENDED"));
    await f.run(tx => settleCourseBooking(tx, f.actor, booking.id, "ATTENDED"));
    expect(await database().courseBooking.findUnique({ where: { id: booking.id } })).toMatchObject({ cardId: usable.id, pointCost: 4, status: "ATTENDED" });
    expect(await database().coursePointCard.findUnique({ where: { id: usable.id } })).toMatchObject({ remaining: 6 });
    expect(await database().coursePointEntry.count({ where: { bookingId: booking.id, kind: "DEBIT" } })).toBe(1);
  });

  it("finite batches may be arranged before payment; insufficient attendance never succeeds", async () => {
    const f = await fixture();
    await f.card(f.learner, "ASSIGNED", 4, 5);
    await f.session(0); await f.session(1);
    await f.run(tx => attachSportsSessionRules(tx, f.actor, "schedule", f.rule));
    const rows=await database().courseBooking.findMany({where:{storeId:f.storeId},orderBy:{createdAt:"asc"}});
    expect(rows).toHaveLength(2);
    expect(rows.every(b=>b.cardId===null&&b.pointCost===0)).toBe(true);
    expect(await database().coursePointEntry.count({ where: { storeId: f.storeId } })).toBe(0);
    await f.run(tx=>settleCourseBooking(tx,f.actor,rows[0].id,"ATTENDED"));
    await expect(f.run(tx=>settleCourseBooking(tx,f.actor,rows[1].id,"ATTENDED"))).rejects.toThrow("足額");
    expect(await database().courseBooking.findUnique({where:{id:rows[1].id}})).toMatchObject({status:"RESERVED",cardId:null});
  });

  it.each(["ASSIGNED","OPEN"] as const)("concurrent %s enrollment follows the class seat policy without overspending cards", async mode => {
    const f = await fixture(), s = await f.session(0, 3, f.template.id, 1);
    await f.card(f.learner,"ASSIGNED"); await f.card(f.other,"ASSIGNED");
    await database().$executeRaw`INSERT INTO "SportsStagingSessionRule" VALUES (${s.id},${f.storeId},'SINGLE',${mode},NULL,0,'{}')`;
    const rule={...f.rule,enrollment:mode,students:mode==="OPEN"?[]:f.rule.students};
    const attempts = await Promise.allSettled([f.learner, f.other].map(customerId => f.run(async tx => {
      const picked = await findSportsCard(tx, f.storeId, customerId, [s], rule);
      return reserveCourseInTransaction(tx, f.actor, { sessionId: s.id, cardId: picked!.card.id, customerId, requestKey: randomUUID() }, null);
    })));
    const expected=mode==="ASSIGNED"?2:1;
    expect(attempts.filter(r => r.status === "fulfilled")).toHaveLength(expected);
    expect(await database().courseBooking.count({ where: { sessionId: s.id } })).toBe(expected);
    expect(await database().coursePointEntry.count({ where: { storeId: f.storeId, kind: "RESERVE" } })).toBe(expected);
  });

  it("automatic single-booking retries keep the original card after its balance or expiry changes",async()=>{
    const f=await fixture(),s=await f.session(0),first=await f.card(f.learner,"ASSIGNED",2,10,new Date("2099-02-01"));
    await f.card();
    await database().$executeRaw`INSERT INTO "SportsStagingSessionRule" VALUES (${s.id},${f.storeId},'SINGLE','ASSIGNED',NULL,0,'{}')`;
    const input={sessionId:s.id,customerId:f.learner,autoCard:true,requestKey:randomUUID()};
    const booked=await reserveCourse(f.actor,input);
    expect(booked.cardId).toBeNull();
    await database().coursePointCard.update({where:{id:first.id},data:{remaining:0,expiresAt:new Date("2020-01-01")}});
    expect(await reserveCourse(f.actor,input)).toMatchObject({id:booked.id,cardId:null,pointCost:0});
    expect(await database().courseBooking.count({where:{storeId:f.storeId}})).toBe(1);
    expect(await database().coursePointEntry.count({where:{storeId:f.storeId,kind:"RESERVE"}})).toBe(0);
  });

  it("teaching-item rules share staff qualifications and reject stale changes or removing an occupied coach", async () => {
    const f = await fixture();
    const first = { pointCost: 3, coachIds: [f.coachId], expectedCoachIds: [], compensation: { mode: "SHARE" as const, value: 60 }, expectedCompensation: null };
    await f.run(tx => saveSportsTeachingRule(tx, f.storeId, f.subject, first));
    const read = await f.run(tx => readSportsTeachingRule(tx, f.storeId, f.subject.id));
    expect(read).toMatchObject({ pointCost: 3, coachIds: [f.coachId] });
    const s = await f.session(0);
    await f.run(tx => saveSportsTeachingRule(tx, f.storeId, f.subject, { ...read!, pointCost: 5 }));
    expect(await database().courseSession.findUnique({ where: { id: s.id } })).toMatchObject({ pointCost: 3 });
    await expect(f.run(tx => saveSportsTeachingRule(tx, f.storeId, f.subject, { ...first, pointCost: 7 }))).rejects.toThrow("已有更新");
    const otherCoach = randomUUID();
    await database().$executeRaw`INSERT INTO "Staff" (id,"storeId",status,"courseCoachEnabled","courseQualifiedTemplateIds") VALUES (${otherCoach},${f.storeId},'ACTIVE',true,ARRAY[]::text[])`;
    await expect(f.run(tx => saveSportsTeachingRule(tx, f.storeId, f.subject, { ...read!, coachIds: [otherCoach] }))).rejects.toThrow("未結束課次");
  });
  it("same teaching item accepts legacy ten-lesson and assigned twenty-lesson packages, then corrects attendance without double debit",async()=>{
    const f=await fixture();
    const old=await database().courseTemplate.create({data:{storeId:f.storeId,musicSubjectId:f.subject.id,name:"舊常態收費項目",durationMinutes:90,pointCost:1,capacity:8}});
    const ten=await f.card(f.learner,"LEGACY",1,10),twenty=await f.card(f.other,"ASSIGNED",1,20);
    for(const c of [ten,twenty]){
      await database().coursePointPlan.update({where:{id:c.planId},data:{unit:"SESSION"}});
      await database().coursePointCard.update({where:{id:c.id},data:{unit:"SESSION",templateIds:[c.id===ten.id?old.id:f.template.id]}});
    }
    const session=await f.session(0);
    await f.run(tx=>attachSportsSessionRules(tx,f.actor,"schedule",{...f.rule,students:[{customerId:f.learner,cardId:null},{customerId:f.other,cardId:null}]}));
    const bookings=await database().courseBooking.findMany({where:{storeId:f.storeId,sessionId:session.id}});
    expect(bookings.map(b=>b.pointCost)).toEqual([0,0]);
    for(const b of bookings)await f.run(tx=>settleCourseBooking(tx,f.actor,b.id,"ATTENDED"));
    expect((await database().coursePointCard.findUnique({where:{id:ten.id}}))?.remaining).toBe(9);
    expect((await database().coursePointCard.findUnique({where:{id:twenty.id}}))?.remaining).toBe(19);
    const a=bookings.find(b=>b.customerId===f.learner)!,b=bookings.find(b=>b.customerId===f.other)!;
    await f.run(tx=>correctCourseAttendance(tx,f.actor,a.id,"CANCELLED","ATTENDED",{waiveAbsence:true}));
    expect((await database().coursePointCard.findUnique({where:{id:ten.id}}))?.remaining).toBe(10);
    expect(await database().courseBooking.findUnique({where:{id:a.id}})).toMatchObject({status:"CANCELLED",absenceKind:"STUDENT_LEAVE"});
    await f.run(tx=>correctCourseAttendance(tx,f.actor,b.id,"NO_SHOW","ATTENDED"));
    expect((await database().coursePointCard.findUnique({where:{id:twenty.id}}))?.remaining).toBe(19);
    expect(await database().coursePointCard.findUnique({where:{id:ten.id}})).toMatchObject({sportsMode:"LEGACY",templateIds:[old.id]});
  });

  it("existing valid booking keeps its original twenty-lesson card and ledger",async()=>{
    const f=await fixture(),session=await f.session(0);
    const old=await database().courseTemplate.create({data:{storeId:f.storeId,musicSubjectId:f.subject.id,name:'A legacy version',durationMinutes:60,pointCost:1,capacity:8}});
    const ten=await f.card(f.learner,'LEGACY',1,10),twenty=await f.card(f.learner,'ASSIGNED',1,20);
    await database().coursePointCard.update({where:{id:ten.id},data:{unit:'SESSION',templateIds:[old.id],createdAt:new Date('2025-01-01')}});
    await database().coursePointCard.update({where:{id:twenty.id},data:{unit:'SESSION',createdAt:new Date('2026-01-01')}});
    await database().$executeRaw`INSERT INTO "SportsStagingSessionRule" VALUES (${session.id},${f.storeId},'SINGLE','ASSIGNED',${twenty.planId},0,'{}')`;
    const booking=await f.run(tx=>reserveCourseInTransaction(tx,f.actor,{sessionId:session.id,cardId:twenty.id,customerId:f.learner,requestKey:randomUUID()},null));
    const original=await database().coursePointEntry.findMany({where:{bookingId:booking.id}});
    await f.run(tx=>settleCourseBooking(tx,f.actor,booking.id,'ATTENDED'));
    expect(await database().courseBooking.findUnique({where:{id:booking.id}})).toMatchObject({cardId:twenty.id,status:'ATTENDED',pointCost:1});
    expect((await database().coursePointCard.findUnique({where:{id:ten.id}}))?.remaining).toBe(10);
    expect((await database().coursePointCard.findUnique({where:{id:twenty.id}}))?.remaining).toBe(19);
    for(const entry of original)expect(await database().coursePointEntry.findUnique({where:{id:entry.id}})).toEqual(entry);
    expect(await database().coursePointEntry.findMany({where:{bookingId:booking.id,kind:{startsWith:'RELEASE:USAGE:'}}})).toHaveLength(0);
    const audit=await database().$queryRaw<Array<{payload:{beforeJson:{cardId:string};afterJson:{cardId:string}}}>>`SELECT payload FROM public."OperationAuditOutbox" WHERE payload->>'targetId'=${booking.id} AND payload->>'action'='RECONCILE_ITEM_CARD'`;
    expect(audit).toHaveLength(0);
    await f.run(tx=>correctCourseAttendance(tx,f.actor,booking.id,'RESERVED','ATTENDED',{suppressNotice:true}));
    await f.run(tx=>correctCourseAttendance(tx,f.actor,booking.id,'RESERVED','ATTENDED',{suppressNotice:true}));
    expect((await database().coursePointCard.findUnique({where:{id:ten.id}}))?.remaining).toBe(10);
    expect((await database().coursePointCard.findUnique({where:{id:twenty.id}}))?.remaining).toBe(20);
  });

  it("purchase FIFO survives opposite expiry order and two concurrent attendance commands; correction returns the original card",async()=>{
    const f=await fixture();
    const first=await f.card(f.learner,"ASSIGNED",1,1,new Date("2099-12-31"));
    const second=await f.card(f.learner,"ASSIGNED",1,10,new Date("2099-06-01"));
    for(const [card,date] of [[first,"2025-01-01"],[second,"2026-01-01"]] as const){
      await database().coursePointCard.update({where:{id:card.id},data:{unit:"SESSION",createdAt:new Date(card.id===first.id?"2026-10-01":"2024-01-01")}});
      await database().coursePurchase.create({data:{storeId:f.storeId,customerId:f.learner,planId:card.planId,cardId:card.id,name:"A",unit:"SESSION",points:card.remaining,price:100,validDays:365,templateIds:[f.template.id],status:"CONFIRMED",transferLastFive:"",requestKey:randomUUID(),createdAt:new Date(date),confirmedAt:new Date(date)}});
    }
    await f.session(0);await f.session(1);
    await f.run(tx=>attachSportsSessionRules(tx,f.actor,"schedule",f.rule));
    const rows=await database().courseBooking.findMany({where:{storeId:f.storeId}});
    await Promise.all(rows.map(row=>f.run(tx=>settleCourseBooking(tx,f.actor,row.id,"ATTENDED"))));
    const used=await database().courseBooking.findMany({where:{storeId:f.storeId}});
    expect(used.filter(row=>row.cardId===first.id)).toHaveLength(1);
    expect(used.filter(row=>row.cardId===second.id)).toHaveLength(1);
    expect((await database().coursePointCard.findUnique({where:{id:first.id}}))?.remaining).toBe(0);
    expect((await database().coursePointCard.findUnique({where:{id:second.id}}))?.remaining).toBe(9);
    const original=used.find(row=>row.cardId===first.id)!;
    await f.run(tx=>correctCourseAttendance(tx,f.actor,original.id,"RESERVED","ATTENDED",{suppressNotice:true}));
    await f.run(tx=>correctCourseAttendance(tx,f.actor,original.id,"RESERVED","ATTENDED",{suppressNotice:true}));
    expect((await database().coursePointCard.findUnique({where:{id:first.id}}))?.remaining).toBe(1);
    expect((await database().coursePointCard.findUnique({where:{id:second.id}}))?.remaining).toBe(9);
    expect(await database().coursePointEntry.count({where:{storeId:f.storeId,kind:"DEBIT"}})).toBe(2);
  });
  async function multiFixture(remaining=10,cost=2) {
    const f=await fixture();
    const makeSubject=async(name:string)=>{
      const subject=await database().musicSubject.create({data:{storeId:f.storeId,name}});
      const template=await database().courseTemplate.create({data:{id:sportsTeachingTemplateId(f.storeId,subject.id),storeId:f.storeId,musicSubjectId:subject.id,name,durationMinutes:60,pointCost:7,capacity:8}});
      return {subject,template};
    };
    const b=await makeSubject('B'),c=await makeSubject('C'),initial=await f.card(f.learner,'ASSIGNED',cost,remaining);
    const rights={sportsMode:'SUBJECTS',sportsSubjectId:null,sportsSubjectIds:[f.subject.id,b.subject.id].sort(),sportsCost:cost,templateIds:[f.template.id,b.template.id]};
    await database().coursePointPlan.update({where:{id:initial.planId},data:rights});
    const card=await database().coursePointCard.update({where:{id:initial.id},data:rights});
    const lesson=async(index:number,templateId=f.template.id,enrollment='OPEN')=>{
      const session=await f.session(index,7,templateId);
      await database().$executeRaw`INSERT INTO "SportsStagingSessionRule" VALUES (${session.id},${f.storeId},'SINGLE',${enrollment},NULL,0,'{}')`;
      return session;
    };
    const reserve=(sessionId:string,customerId=f.learner,cardId=card.id)=>f.run(tx=>reserveCourseInTransaction(tx,f.actor,{sessionId,customerId,cardId,requestKey:randomUUID()},null));
    return {...f,b,c,createCard:f.card,card,rights,lesson,reserve};
  }

  it('multi-subject migration preserves populated legacy, assigned and old OPEN snapshots',async()=>{
    expect(await migrationAccess()).toEqual(migrationAccessBefore);
    expect(await database().coursePointPlan.findUniqueOrThrow({where:{id:'migration-plan'}})).toMatchObject({sportsMode:'ASSIGNED',sportsSubjectId:'old-A',sportsCost:2,points:20,sportsSubjectIds:[]});
    expect(await database().coursePointCard.findUniqueOrThrow({where:{id:'migration-card'}})).toMatchObject({sportsMode:'OPEN',remaining:19,expiresAt:new Date('2099-02-08'),sportsSubjectIds:[]});
    expect(await database().coursePurchase.findUniqueOrThrow({where:{id:'migration-order'}})).toMatchObject({sportsMode:'LEGACY',points:20,price:8550,sportsSubjectIds:[]});
    for(const table of ['CoursePointPlan','CoursePointCard','CoursePurchase']){
      const target=table==='CoursePointPlan'?'migration-plan':table==='CoursePointCard'?'migration-card':'migration-order';
      await expect(database().$executeRawUnsafe(`UPDATE "${table}" SET "sportsMode"='SUBJECTS',"sportsSubjectId"=NULL,"sportsCost"=1,"sportsSubjectIds"=ARRAY[]::text[] WHERE id='${target}'`)).rejects.toThrow();
      await expect(database().$executeRawUnsafe(`UPDATE "${table}" SET "sportsSubjectIds"=ARRAY['hidden-A'] WHERE id='${target}'`)).rejects.toThrow();
    }
  });

  it.each(['OPEN','ASSIGNED'])('multi-subject A+B card spends the same balance in %s lessons, with its persisted point cost',async enrollment=>{
    const f=await multiFixture();
    for(const [index,template] of [f.template,f.b.template].entries()){
      const session=await f.lesson(index,template.id,enrollment),booking=await f.reserve(session.id);
      await f.run(tx=>settleCourseBooking(tx,f.actor,booking.id,'ATTENDED'));
      await f.run(tx=>settleCourseBooking(tx,f.actor,booking.id,'ATTENDED'));
      expect(await database().courseBooking.findUniqueOrThrow({where:{id:booking.id}})).toMatchObject({cardId:f.card.id,pointCost:2,status:'ATTENDED'});
      expect(await database().coursePointEntry.count({where:{bookingId:booking.id,kind:'DEBIT'}})).toBe(1);
    }
    expect((await database().coursePointCard.findUniqueOrThrow({where:{id:f.card.id}})).remaining).toBe(6);
  });

  it('multi-subject C, foreign store and nonmember requests cannot spend A+B',async()=>{
    const f=await multiFixture(),c=await f.lesson(0,f.c.template.id),a=await f.lesson(1),foreign=await fixture(),outside=await foreign.session(0);
    await expect(f.reserve(c.id)).rejects.toThrow('科目不符');
    await expect(f.reserve(a.id,f.other)).rejects.toThrow();
    await expect(f.reserve(outside.id)).rejects.toThrow();
    expect(await database().coursePointEntry.count({where:{cardId:f.card.id}})).toBe(0);
    expect((await database().coursePointCard.findUniqueOrThrow({where:{id:f.card.id}})).remaining).toBe(10);
  });

  it('one remaining shared balance cannot be reserved simultaneously in A and B',async()=>{
    const f=await multiFixture(2),a=await f.lesson(0),b=await f.lesson(1,f.b.template.id);
    await database().courseCardMember.create({data:{cardId:f.card.id,storeId:f.storeId,customerId:f.other}});
    const results=await Promise.allSettled([f.reserve(a.id),f.reserve(b.id,f.other)]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(await database().courseBooking.count({where:{cardId:f.card.id,status:'RESERVED'}})).toBe(1);
    const booking=await database().courseBooking.findFirstOrThrow({where:{cardId:f.card.id}});
    await f.run(tx=>settleCourseBooking(tx,f.actor,booking.id,'ATTENDED'));
    expect((await database().coursePointCard.findUniqueOrThrow({where:{id:f.card.id}})).remaining).toBe(0);
  });

  it('multi-subject correction and cancellation restore only the original shared card once',async()=>{
    const f=await multiFixture(),a=await f.lesson(0),b=await f.lesson(1,f.b.template.id);
    const first=await f.reserve(a.id),second=await f.reserve(b.id);
    await f.run(tx=>settleCourseBooking(tx,f.actor,first.id,'ATTENDED'));
    await f.run(tx=>correctCourseAttendance(tx,f.actor,first.id,'RESERVED','ATTENDED',{suppressNotice:true}));
    await f.run(tx=>correctCourseAttendance(tx,f.actor,first.id,'RESERVED','ATTENDED',{suppressNotice:true}));
    for(const booking of [first,second])await f.run(tx=>settleCourseBooking(tx,f.actor,booking.id,'CANCELLED'));
    expect((await database().coursePointCard.findUniqueOrThrow({where:{id:f.card.id}})).remaining).toBe(10);
    expect(await database().courseBooking.count({where:{cardId:f.card.id,status:'RESERVED'}})).toBe(0);
  });

  it('multi-subject batch selection checks every lesson, including a disallowed later C',async()=>{
    const f=await multiFixture(),a=await f.lesson(0),b=await f.lesson(1,f.b.template.id),c=await f.lesson(2,f.c.template.id);
    expect((await f.run(tx=>findSportsCard(tx,f.storeId,f.learner,[a,b],{enrollment:'OPEN',planId:null},f.card.id)))?.card.id).toBe(f.card.id);
    expect(await f.run(tx=>findSportsCard(tx,f.storeId,f.learner,[a,c],{enrollment:'OPEN',planId:null},f.card.id))).toBeNull();
  });

  it('old OPEN card can be explicitly reviewed for multiple subjects without changing paid balance or expiry',async()=>{
    const {readSubjectReviewCard,cardSubjectRevision,confirmCardSubject}=await import('@/server/services/course-card-subject');
    const f=await multiFixture(),old=await f.createCard(f.learner,'OPEN',1,19),before=await f.run(tx=>readSubjectReviewCard(tx,f.storeId,old.id));
    const input={cardId:old.id,customerId:f.learner,subjectIds:f.rights.sportsSubjectIds,cost:1,expectedRevision:cardSubjectRevision(before),requestKey:randomUUID()};
    const foreign=await fixture();
    await expect(f.run(tx=>confirmCardSubject(tx,f.actor,{...input,subjectIds:[f.subject.id,foreign.subject.id]}))).rejects.toThrow('本店有效科目');
    await f.run(tx=>confirmCardSubject(tx,f.actor,input));await f.run(tx=>confirmCardSubject(tx,f.actor,input));
    expect(await database().coursePointCard.findUniqueOrThrow({where:{id:old.id}})).toMatchObject({sportsMode:'SUBJECTS',sportsSubjectIds:f.rights.sportsSubjectIds,remaining:19,expiresAt:old.expiresAt});
    expect(await database().coursePointEntry.count({where:{cardId:old.id}})).toBe(0);
  });

  it('multi-subject checkout snapshots survive later product edits and do not acquire newly selected C',async()=>{
    const {assignCourseWithCheckout}=await import('@/server/services/course-assignment-checkout');
    const f=await multiFixture();
    const purchase=await f.run(tx=>assignCourseWithCheckout(tx,f.actor,{planId:f.card.planId,customerId:f.learner,expiresDate:'2099-12-31',requestKey:randomUUID(),expectedListPrice:0,expectedStoreCost:0,revenueStaffId:'',discountKind:'AMOUNT',discountValue:0,paymentMethod:'OTHER',transferLastFour:''}));
    expect(purchase).toMatchObject({sportsMode:'SUBJECTS',sportsSubjectIds:f.rights.sportsSubjectIds});
    await database().coursePointPlan.update({where:{id:f.card.planId},data:{sportsSubjectIds:[f.subject.id,f.c.subject.id],templateIds:[f.template.id,f.c.template.id]}});
    const issued=await database().coursePointCard.findUniqueOrThrow({where:{id:purchase.cardId!}});
    expect(issued).toMatchObject({sportsSubjectIds:f.rights.sportsSubjectIds,remaining:10});
    const b=await f.lesson(0,f.b.template.id),c=await f.lesson(1,f.c.template.id);
    await f.reserve(b.id,f.learner,issued.id);
    await expect(f.reserve(c.id,f.learner,issued.id)).rejects.toThrow('科目不符');
    expect((await database().coursePurchase.findUniqueOrThrow({where:{id:purchase.id}})).sportsSubjectIds).toEqual(f.rights.sportsSubjectIds);
  });

  it('multi-subject fee teacher union never substitutes for the actual lesson qualification',async()=>{
    const {resolveScheduleCharge,assertChargeProviders}=await import('@/server/services/course-charge');
    const f=await multiFixture(),teacherA=randomUUID();
    await database().$executeRaw`UPDATE "Staff" SET "courseQualificationsConfirmed"=true,"courseQualifiedTemplateIds"=${[f.template.id,f.b.template.id]}::text[] WHERE id=${f.coachId}`;
    await database().$executeRaw`INSERT INTO "Staff" (id,"storeId",status,"courseCoachEnabled","courseQualificationsConfirmed","courseQualifiedTemplateIds") VALUES (${teacherA},${f.storeId},'ACTIVE',true,true,${[f.template.id]}::text[])`;
    const settings={kind:'plan' as const,durationMinutes:60,trialPrice:null,trialDuration:null,providerIds:[f.coachId,teacherA]};
    await database().coursePointPlan.update({where:{id:f.card.planId},data:{chargeSettings:settings}});
    await expect(f.run(tx=>assertChargeProviders(tx,f.storeId,f.rights.templateIds,settings))).resolves.toBeUndefined();
    const input={chargePlanId:f.card.planId,templateId:f.b.template.id,coachId:f.coachId,isTrial:false,open:true,defaultTrialPrice:0,durationMinutes:60,sports:true};
    expect(await f.run(tx=>resolveScheduleCharge(tx,f.storeId,input))).toMatchObject({snapshot:{planId:f.card.planId}});
    await expect(f.run(tx=>resolveScheduleCharge(tx,f.storeId,{...input,coachId:teacherA}))).rejects.toThrow('具教學項目資格');
    await expect(f.run(tx=>resolveScheduleCharge(tx,f.storeId,{...input,templateId:f.c.template.id}))).rejects.toThrow('不適用');
  });

});
