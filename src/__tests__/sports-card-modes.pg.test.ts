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
vi.mock("@/lib/sports-native-preview", () => ({ sportsNativePreview: () => true }));
vi.mock("@/lib/sports-staging", () => ({ requireSportsStaging: vi.fn(), sportsStagingEnabled: () => true }));
vi.mock("@/server/services/sports-production-readiness", () => ({ sportsRulesAvailable: async () => true, assertSportsProductionReady: vi.fn() }));
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
  beforeAll(async () => {
    vi.mocked(courseTransaction).mockImplementation(async(storeId,work)=>database().$transaction(async tx=>{await lockCourseStore(tx,storeId);return work(tx);}));
    await database().$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await installAuditOutboxTestSchema(url!, database());
    const ddl = execFileSync("node_modules/.bin/prisma", ["migrate", "diff", "--from-empty", "--to-schema-datamodel", "course-prisma/schema.prisma", "--script"], { encoding: "utf8" });
    for (const sql of ddl.split(";").map(s => s.trim()).filter(Boolean)) await database().$executeRawUnsafe(sql);
    // Rehearse the exact additive candidate against the complete generated schema.
    await database().$transaction(async tx=>{
      for(const table of ["CoursePointPlan","CoursePurchase","CoursePointCard"])await tx.$executeRawUnsafe(`ALTER TABLE "${table}" DROP COLUMN "sportsMode", DROP COLUMN "sportsSubjectId", DROP COLUMN "sportsCost"`);
      const candidate=readFileSync("scripts/sql/sports-entitlement-candidate.sql","utf8").replace(/^--.*$/gm,"").replaceAll("public.",`"${schema}".`);
      for(const sql of candidate.split(";").map(s=>s.trim()).filter(s=>s&&s!=="BEGIN"&&s!=="COMMIT"))await tx.$executeRawUnsafe(sql);
    });
    await database().$executeRawUnsafe('CREATE TABLE "Store" (id text PRIMARY KEY,"industryModule" text NOT NULL DEFAULT \'COURSE\')');
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

  it("finite scheduling uses each learner's purchase cost and preserves snapshots after edits", async () => {
    const f = await fixture(), a = await f.card(), b = await f.card(f.other, "ASSIGNED", 4);
    const sessions = [await f.session(0), await f.session(1)];
    await f.run(tx => attachSportsSessionRules(tx, f.actor, "schedule", { ...f.rule, students: [...f.rule.students, { customerId: f.other, cardId: null }] }));
    const bookings = await database().courseBooking.findMany({ where: { storeId: f.storeId }, orderBy: { pointCost: "asc" } });
    expect(bookings.map(b => b.pointCost)).toEqual([2, 2, 4, 4]);
    await database().coursePointPlan.update({ where: { id: a.planId }, data: { sportsCost: 9 } });
    expect(await database().coursePointCard.findUnique({ where: { id: a.id } })).toMatchObject({ sportsCost: 2, remaining: 10 });
    for (const card of [a, b]) {
      const booking = bookings.find(row => row.cardId === card.id && row.sessionId === sessions[0].id)!;
      await f.run(tx => settleCourseBooking(tx, f.actor, booking.id, "ATTENDED"));
      await f.run(tx => settleCourseBooking(tx, f.actor, booking.id, "ATTENDED"));
      expect(await database().coursePointCard.findUnique({ where: { id: card.id } })).toMatchObject({ remaining: 10 - booking.pointCost });
      expect(await database().coursePointEntry.count({ where: { bookingId: booking.id, kind: "DEBIT" } })).toBe(1);
      await f.run(tx=>correctCourseAttendance(tx,f.actor,booking.id,"RESERVED","ATTENDED",{suppressNotice:true}));
      await f.run(tx=>correctCourseAttendance(tx,f.actor,booking.id,"RESERVED","ATTENDED",{suppressNotice:true}));
      await f.run(tx=>settleCourseBooking(tx,f.actor,booking.id,"CANCELLED"));
      expect(await database().coursePointCard.findUnique({where:{id:card.id}})).toMatchObject({remaining:10});
    }
  });

  it("one universal card pays for two subjects by course rules and cannot pay for assigned classes", async () => {
    const f = await fixture(), card = await f.card(f.learner, "OPEN"), assigned = await f.card();
    const otherSubject = await database().musicSubject.create({ data: { storeId: f.storeId, name: "第二項目" } });
    const otherTemplate = await database().courseTemplate.create({ data: { id: sportsTeachingTemplateId(f.storeId, otherSubject.id), storeId: f.storeId, musicSubjectId: otherSubject.id, name: "第二課程", pointCost: 2, durationMinutes: 60, capacity: 8 } });
    const sessions = [await f.session(0), await f.session(1, 2, otherTemplate.id)];
    for (const s of sessions) {
      await f.run(tx => attachSportsSessionRules(tx, f.actor, "schedule", { ...f.rule, enrollment: "OPEN", students: [] }, [s.id]));
      const booking = await f.run(tx => reserveCourseInTransaction(tx, f.actor, { sessionId: s.id, cardId: card.id, customerId: f.learner, requestKey: randomUUID() }, null));
      await f.run(tx => settleCourseBooking(tx, f.actor, booking.id, "ATTENDED"));
      await expect(f.run(tx => reserveCourseInTransaction(tx, f.actor, { sessionId: s.id, cardId: assigned.id, customerId: f.learner, requestKey: randomUUID() }, null))).rejects.toThrow("指定學員方案");
    }
    expect(await database().coursePointCard.findUnique({ where: { id: card.id } })).toMatchObject({ remaining: 5 });
    const s = await f.session(2);
    await database().$executeRaw`INSERT INTO "SportsStagingSessionRule" VALUES (${s.id},${f.storeId},'SINGLE','ASSIGNED',NULL,0,'{}')`;
    await expect(f.run(tx => reserveCourseInTransaction(tx, f.actor, { sessionId: s.id, cardId: card.id, customerId: f.learner, requestKey: randomUUID() }, null))).rejects.toThrow("通用卡僅適用開放選課");
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

  it("insufficient finite batches roll back rules, reservations and entries together", async () => {
    const f = await fixture();
    await f.card(f.learner, "ASSIGNED", 4, 5);
    await f.session(0); await f.session(1);
    await expect(f.run(tx => attachSportsSessionRules(tx, f.actor, "schedule", f.rule))).rejects.toThrow("足夠");
    expect(await database().courseBooking.count({ where: { storeId: f.storeId } })).toBe(0);
    expect(await database().coursePointEntry.count({ where: { storeId: f.storeId } })).toBe(0);
    expect(await database().$queryRaw`SELECT "sessionId" FROM "SportsStagingSessionRule" WHERE "storeId"=${f.storeId}`).toEqual([]);
  });

  it("store locking prevents two automatic selections from overselling the final place", async () => {
    const f = await fixture(), s = await f.session(0, 3, f.template.id, 1);
    await f.card(); await f.card(f.other);
    await database().$executeRaw`INSERT INTO "SportsStagingSessionRule" VALUES (${s.id},${f.storeId},'SINGLE','ASSIGNED',NULL,0,'{}')`;
    const attempts = await Promise.allSettled([f.learner, f.other].map(customerId => f.run(async tx => {
      const picked = await findSportsCard(tx, f.storeId, customerId, [s], f.rule);
      return reserveCourseInTransaction(tx, f.actor, { sessionId: s.id, cardId: picked!.card.id, customerId, requestKey: randomUUID() }, null);
    })));
    expect(attempts.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await database().courseBooking.count({ where: { sessionId: s.id } })).toBe(1);
    expect(await database().coursePointEntry.count({ where: { storeId: f.storeId, kind: "RESERVE" } })).toBe(1);
  });

  it("automatic single-booking retries keep the original card after its balance or expiry changes",async()=>{
    const f=await fixture(),s=await f.session(0),first=await f.card(f.learner,"ASSIGNED",2,10,new Date("2099-02-01"));
    await f.card();
    await database().$executeRaw`INSERT INTO "SportsStagingSessionRule" VALUES (${s.id},${f.storeId},'SINGLE','ASSIGNED',NULL,0,'{}')`;
    const input={sessionId:s.id,customerId:f.learner,autoCard:true,requestKey:randomUUID()};
    const booked=await reserveCourse(f.actor,input);
    expect(booked.cardId).toBe(first.id);
    await database().coursePointCard.update({where:{id:first.id},data:{remaining:0,expiresAt:new Date("2020-01-01")}});
    expect(await reserveCourse(f.actor,input)).toMatchObject({id:booked.id,cardId:first.id,pointCost:2});
    expect(await database().courseBooking.count({where:{storeId:f.storeId}})).toBe(1);
    expect(await database().coursePointEntry.count({where:{storeId:f.storeId,kind:"RESERVE"}})).toBe(1);
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
    expect(bookings.map(b=>b.pointCost)).toEqual([1,1]);
    for(const b of bookings)await f.run(tx=>settleCourseBooking(tx,f.actor,b.id,"ATTENDED"));
    expect((await database().coursePointCard.findUnique({where:{id:ten.id}}))?.remaining).toBe(9);
    expect((await database().coursePointCard.findUnique({where:{id:twenty.id}}))?.remaining).toBe(19);
    const a=bookings.find(b=>b.cardId===ten.id)!,b=bookings.find(b=>b.cardId===twenty.id)!;
    await f.run(tx=>correctCourseAttendance(tx,f.actor,a.id,"CANCELLED","ATTENDED",{waiveAbsence:true}));
    expect((await database().coursePointCard.findUnique({where:{id:ten.id}}))?.remaining).toBe(10);
    expect(await database().courseBooking.findUnique({where:{id:a.id}})).toMatchObject({status:"CANCELLED",absenceKind:"STUDENT_LEAVE"});
    await f.run(tx=>correctCourseAttendance(tx,f.actor,b.id,"NO_SHOW","ATTENDED"));
    expect((await database().coursePointCard.findUnique({where:{id:twenty.id}}))?.remaining).toBe(19);
    expect(await database().coursePointCard.findUnique({where:{id:ten.id}})).toMatchObject({sportsMode:"LEGACY",templateIds:[old.id]});
  });

});
