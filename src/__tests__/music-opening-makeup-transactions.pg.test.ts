/**
 * Actual importer and lifecycle service, Prisma transactions and SQL constraints.
 * Requires an explicit disposable LOOPBACK PostgreSQL *_test database. No remote
 * fallback and no PGlite claims about concurrent transactions. No real records.
 * Real coach-notification functions/triggers run with enabled CHANGE/TRIAL settings;
 * a rolled-back native positive control proves they enqueue. No delivery worker runs.
 * Auth/feature boundary stubs do not replace transaction writes. Native card debit
 * and compensation/payroll capture integration are outside this suite's scope.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/course-db", () => ({ coursePrisma: {} }));
vi.mock("@/lib/feature-gate", () => ({ getStoreLimitsByStoreId: vi.fn() }));
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { PrismaClient, type Prisma } from "../../generated/course-client";
import { resolveBookingConcurrencyTestDatabaseUrl } from "./helpers/booking-concurrency-test-db";
import { makeupBatch, makeupRecord, makeupVerification } from "./fixtures/music-opening-makeup";
import { changeOpeningMakeupInTransaction, type OpeningMakeupCommand } from "@/server/services/music-opening-makeup";
import { importOpeningMakeupInTransaction } from "@/server/services/music-opening-makeup-import";
import { summarizeMusicOpeningMakeupRights } from "@/lib/music-opening-makeup";
const priorBookingValues = readFileSync("prisma/migrations/20260925191000_course_music_absence/migration.sql", "utf8")
  .match(/ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_values" CHECK \([\s\S]*?\n\);/)?.[0];
const priorAbsenceKinds = readFileSync("prisma/migrations/20261001093000_course_teacher_absence_refund/migration.sql", "utf8")
  .match(/ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_absence_kind_check"[\s\S]*?;/)?.[0];
if (!priorBookingValues || !priorAbsenceKinds) throw new Error("Reviewed prior booking constraints missing");
const databaseUrl = resolveBookingConcurrencyTestDatabaseUrl(process.env);
const schema = `opening_makeup_${randomUUID().replaceAll("-", "")}`;
const url = databaseUrl ? new URL(databaseUrl) : null;
url?.searchParams.set("schema", schema); url?.searchParams.set("connection_limit", "5");
const db = url ? new PrismaClient({ datasourceUrl: url.toString() }) : null;
const database = () => { if (!db) throw new Error("Explicit disposable loopback database required"); return db; };
const transact = <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) => database().$transaction(async tx => {
  await tx.$executeRawUnsafe(`SET LOCAL search_path = "${schema}"`);
  return run(tx);
}, { timeout: 20000, maxWait: 20000 });
/** Preserve dollar-quoted PL/pgSQL bodies while separating ordinary statements. */
function statements(sql: string) {
  const result: string[] = []; let start = 0, single = false, double = false, dollar = "", comment = false;
  for (let i = 0; i < sql.length; i++) {
    if (comment) { if (sql[i] === "\n") comment = false; continue; }
    if (dollar) { if (sql.startsWith(dollar, i)) { i += dollar.length - 1; dollar = ""; } continue; }
    if (single) { if (sql[i] === "'") { if (sql[i + 1] === "'") i++; else single = false; } continue; }
    if (double) { if (sql[i] === '"') { if (sql[i + 1] === '"') i++; else double = false; } continue; }
    if (sql.startsWith("--", i)) { comment = true; i++; continue; }
    if (sql[i] === "'") { single = true; continue; }
    if (sql[i] === '"') { double = true; continue; }
    if (sql[i] === "$") { const match = sql.slice(i).match(/^\$[a-zA-Z_0-9]*\$/); if (match) { dollar = match[0]; i += dollar.length - 1; continue; } }
    if (sql[i] === ";") { const part = sql.slice(start, i).trim(); if (part) result.push(part); start = i + 1; }
  }
  const tail = sql.slice(start).trim(); if (tail && tail.replace(/--[^\n]*/g, "").trim()) result.push(tail);
  return result;
}
(databaseUrl ? describe : describe.skip)("opening make-up actual PostgreSQL service transactions", () => {
  let created = false;
  beforeAll(async () => {
    await database().$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
    const ddl = execFileSync("node_modules/.bin/prisma", ["migrate", "diff", "--from-empty", "--to-schema-datamodel", "course-prisma/schema.prisma", "--script"], { encoding: "utf8" });
    await transact(async tx => {
      for (const statement of statements(ddl)) await tx.$executeRawUnsafe(statement);
      for (const statement of [
        'ALTER TABLE "CourseBooking" DROP COLUMN "musicOpeningMakeupEntitlementId" CASCADE',
        'DROP TABLE "CourseMusicOpeningMakeupEntitlement" CASCADE',
        'CREATE TABLE "Store"(id text PRIMARY KEY,slug text,"industryModule" text)',
        'CREATE TABLE "Customer"(id text PRIMARY KEY,"storeId" text NOT NULL,name text,"mergedIntoCustomerId" text,UNIQUE(id,"storeId"))',
        'CREATE TABLE "StoreFeatureEntitlement"("storeId" text,"featureKey" text,status text)',
        'CREATE TABLE "SpecialBusinessDay"("storeId" text,date date,type text)',
        'CREATE TABLE "BusinessHours"("storeId" text,"dayOfWeek" int,"isOpen" boolean)',
        'CREATE TABLE "AuditLog"(id text PRIMARY KEY,"actorUserId" text,"actorNameSnapshot" text,"storeId" text,module text,summary text,"targetType" text,"targetId" text,action text,"beforeJson" jsonb,"afterJson" jsonb,"createdAt" timestamptz)',
        'CREATE TABLE "Staff"(id text PRIMARY KEY,"storeId" text NOT NULL)',
        'CREATE TABLE "MessageTemplate"(id text PRIMARY KEY,"storeId" text NOT NULL,body text)',
        'CREATE TABLE "OperationAuditOutbox"(id text PRIMARY KEY,payload jsonb)',
      ]) await tx.$executeRawUnsafe(statement);
      await tx.$executeRawUnsafe(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$`);
      await tx.$executeRawUnsafe(`INSERT INTO "Store" VALUES('store-lubymusic','lubymusic','COURSE')`);
      const notifications = readFileSync("supabase/migrations/20261002093141_course_coach_notifications.sql", "utf8")
        .replaceAll("public.", `"${schema}".`).replaceAll("search_path=public", `search_path="${schema}"`);
      for (const statement of statements(notifications)) await tx.$executeRawUnsafe(statement);
      await tx.$executeRawUnsafe(priorBookingValues);
      await tx.$executeRawUnsafe(priorAbsenceKinds);
      const draft = readFileSync("docs/sql/music-opening-makeup-20261008.sql", "utf8")
        .replaceAll("public.", `"${schema}".`).replaceAll("table_schema='public'", `table_schema='${schema}'`);
      for (const statement of statements(draft)) {
        const executable = statement.replace(/--[^\n]*/g, "").trim();
        if (executable === "BEGIN" || executable === "COMMIT") continue;
        await tx.$executeRawUnsafe(statement);
      }
    });
  }, 40000);
  afterAll(async () => {
    vi.useRealTimers();
    try { if (created) await database().$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); }
    finally { await db?.$disconnect(); }
  });
  async function fixture(importNow = true) {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-08T00:02:00Z"));
    const storeId = randomUUID(), customerId = randomUUID(), coachId = randomUUID();
    const actor = { storeId, userId: "synthetic-manager", name: "Synthetic manager" };
    const data = await transact(async tx => {
      await tx.$executeRaw`INSERT INTO "Store" VALUES(${storeId},NULL,'COURSE')`;
      await tx.$executeRaw`INSERT INTO "Staff" VALUES(${coachId},${storeId})`;
      await tx.$executeRaw`INSERT INTO "MessageTemplate" VALUES(${`course-coach-change:${storeId}`},${storeId},'enabled'),(${`course-coach-trial:${storeId}`},${storeId},'enabled')`;
      await tx.$executeRaw`INSERT INTO "Customer" VALUES(${customerId},${storeId},'Synthetic student',NULL)`;
      await tx.$executeRaw`INSERT INTO "StoreFeatureEntitlement" VALUES(${storeId},'business.music','ENABLED')`;
      const room = await tx.courseRoom.create({ data: { storeId, name: "Synthetic room" } });
      const template = await tx.courseTemplate.create({ data: { storeId, name: "Synthetic piano", durationMinutes: 60, pointCost: 1, capacity: 2, classType: "PRIVATE" } });
      const plan = await tx.coursePointPlan.create({ data: { storeId, name: "Paid sentinel", points: 10, price: 11000, validDays: 365, unit: "SESSION" } });
      const card = await tx.coursePointCard.create({ data: { storeId, planId: plan.id, nameSnapshot: plan.name, unit: "SESSION", remaining: 7, expiresAt: new Date("2027-01-01T00:00:00Z"), requestKey: randomUUID() } });
      await tx.courseCardMember.create({ data: { cardId: card.id, storeId, customerId } });
      const sessions = [];
      for (const date of ["2026-10-15", "2026-10-16"]) sessions.push(await tx.courseSession.create({ data: { storeId, templateId: template.id, roomId: room.id,
        coachId, nameSnapshot: "Synthetic future lesson", startsAt: new Date(`${date}T02:00:00Z`), endsAt: new Date(`${date}T03:00:00Z`),
        pointCost: 1, capacity: 2, requestKey: randomUUID(), requestIndex: 0, createdById: actor.userId } }));
      return { template, card, sessions };
    });
    const record = makeupRecord(); record.scope.targetStoreId = storeId; record.mapping.customerId = customerId; record.mapping.templateId = data.template.id;
    const batch = makeupBatch([record]); batch.scope = record.scope; batch.manifest.cutoffCoverage[0].customerId = customerId;
    const verification = makeupVerification(batch);
    let entitlementId = "";
    if (importNow) entitlementId = (await transact(tx => importOpeningMakeupInTransaction(tx, actor, batch, verification))).entitlementIds[0];
    const reserve: OpeningMakeupCommand = { entitlementId, expectedVersion: 0, requestKey: randomUUID(), action: "RESERVE", sessionId: data.sessions[0].id,
      bookingId: null, expectedStatus: null, actualAttendance: false, reason: "" };
    const run = (command: OpeningMakeupCommand, maxMonthlyBookings: number | null = null) => transact(tx => changeOpeningMakeupInTransaction(tx, actor, command, maxMonthlyBookings));
    return { ...data, actor, storeId, customerId, record, batch, verification, entitlementId, reserve, run };
  }
  function follow(f: Awaited<ReturnType<typeof fixture>>, bookingId: string, expectedVersion: number, action: OpeningMakeupCommand["action"], expectedStatus: "RESERVED" | "ATTENDED" = "RESERVED"): OpeningMakeupCommand {
    return { ...f.reserve, bookingId, sessionId: null, expectedVersion, action, expectedStatus, actualAttendance: action === "ATTEND", reason: "Synthetic verified correction", requestKey: randomUUID() };
  }
  async function unchanged(f: Awaited<ReturnType<typeof fixture>>) {
    expect(await database().coursePointCard.findUnique({ where: { id: f.card.id } })).toEqual(f.card);
    for (const model of [database().coursePointEntry, database().coursePurchase, database().courseFeePayment, database().courseCompensationSnapshot, database().courseWaitlistEntry]) {
      expect(await (model as { count(args: { where: { storeId: string } }): Promise<number> }).count({ where: { storeId: f.storeId } })).toBe(0);
    }
    expect(await transact(tx => tx.$queryRaw`SELECT count(*)::int n FROM "CourseCoachNotification" WHERE "storeId"=${f.storeId}`)).toEqual([{ n: 0 }]);
    expect(await transact(tx => tx.$queryRaw`SELECT count(*)::int n FROM "OperationAuditOutbox" WHERE payload->>'storeId'=${f.storeId}`)).toEqual([{ n: 0 }]);
  }
  it("imports once under concurrent exact replay without resetting lifecycle", async () => {
    const f = await fixture(false);
    // Verify real hooks first, then rollback both their native booking and queues.
    await expect(transact(async tx => {
      await tx.courseSession.update({ where: { id: f.sessions[0].id }, data: {
        startsAt: new Date("2099-10-15T02:00:00Z"), endsAt: new Date("2099-10-15T03:00:00Z"),
      } });
      await tx.courseBooking.create({ data: {
        storeId: f.storeId, sessionId: f.sessions[0].id, customerId: f.customerId,
        bookingKind: "TRIAL", cardId: null, pointCost: 0, trialPrice: 100,
        operatorUserId: f.actor.userId, operatorName: f.actor.name, customerName: "Synthetic native control", requestKey: randomUUID(),
      } });
      expect(await tx.$queryRaw`SELECT kind,count(*)::int n FROM "CourseCoachNotification" WHERE "storeId"=${f.storeId} GROUP BY kind ORDER BY kind`)
        .toEqual([{ kind: "CHANGE", n: 1 }, { kind: "TRIAL", n: 1 }]);
      throw new Error("ROLLBACK_NATIVE_TRIGGER_PROOF");
    })).rejects.toThrow("ROLLBACK_NATIVE_TRIGGER_PROOF");
    const imports = await Promise.all([transact(tx => importOpeningMakeupInTransaction(tx, f.actor, f.batch, f.verification)), transact(tx => importOpeningMakeupInTransaction(tx, f.actor, f.batch, f.verification))]);
    expect(imports[0].entitlementIds).toEqual(imports[1].entitlementIds);
    f.entitlementId = imports[0].entitlementIds[0]; f.reserve.entitlementId = f.entitlementId;
    await f.run(f.reserve);
    await transact(tx => importOpeningMakeupInTransaction(tx, f.actor, f.batch, f.verification));
    expect(await database().courseMusicOpeningMakeupEntitlement.findUnique({ where: { id: f.entitlementId } })).toMatchObject({ version: 1 });
    expect(await transact(tx => tx.$queryRaw`SELECT count(*)::int n FROM "AuditLog" WHERE "storeId"=${f.storeId} AND action='OPENING_MAKEUP_DISPOSITION'`)).toEqual([{ n: 1 }]);
    await unchanged(f);
  });
  it("two independently requested reservations cannot spend one right twice", async () => {
    const f = await fixture();
    const outcomes = await Promise.allSettled([f.run(f.reserve), f.run({ ...f.reserve, sessionId: f.sessions[1].id, requestKey: randomUUID() })]);
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(outcomes.filter(r => r.status === "rejected")).toHaveLength(1);
    expect(await database().courseBooking.count({ where: { storeId: f.storeId, musicOpeningMakeupEntitlementId: f.entitlementId, status: { not: "CANCELLED" } } })).toBe(1);
    await unchanged(f);
  });
  it("concurrent same-request retry returns the original result with one operation audit", async () => {
    const f = await fixture(); const [a, b] = await Promise.all([f.run(f.reserve), f.run(f.reserve)]); expect(a).toEqual(b);
    expect(await transact(tx => tx.$queryRaw`SELECT count(*)::int n FROM "AuditLog" WHERE "storeId"=${f.storeId} AND action='OPENING_MAKEUP_OPERATION'`)).toEqual([{ n: 1 }]);
    await expect(f.run({ ...f.reserve, sessionId: f.sessions[1].id })).rejects.toThrow("操作編號"); await unchanged(f);
  });
  it("check-in stays outstanding; actual attendance redeems and an audited correction restores", async () => {
    const f = await fixture(), reserved = await f.run(f.reserve);
    await f.run(follow(f, reserved.bookingId, 1, "CHECK_IN"));
    let rights = await database().courseMusicOpeningMakeupEntitlement.findMany({ where: { storeId: f.storeId }, include: { bookings: true } });
    expect(summarizeMusicOpeningMakeupRights(rights)).toMatchObject({ outstanding: 1, reserved: 1, redeemed: 0 });
    await expect(f.run({ ...follow(f, reserved.bookingId, 2, "ATTEND"), actualAttendance: false })).rejects.toThrow();
    vi.setSystemTime(new Date("2026-10-15T04:00:00Z")); await f.run(follow(f, reserved.bookingId, 2, "ATTEND"));
    rights = await database().courseMusicOpeningMakeupEntitlement.findMany({ where: { storeId: f.storeId }, include: { bookings: true } });
    expect(summarizeMusicOpeningMakeupRights(rights)).toMatchObject({ outstanding: 0, redeemed: 1 });
    await f.run(follow(f, reserved.bookingId, 3, "CORRECT_TO_RESERVED", "ATTENDED"));
    await expect(f.run(follow(f, reserved.bookingId, 2, "ATTEND"))).rejects.toThrow("另一個操作");
    await unchanged(f);
  });
  it("cancel then rebook uses the same right and keeps cancelled history", async () => {
    const f = await fixture(), a = await f.run(f.reserve);
    await f.run(follow(f, a.bookingId, 1, "TEACHER_ABSENT"));
    const b = await f.run({ ...f.reserve, expectedVersion: 2, sessionId: f.sessions[1].id, requestKey: randomUUID() });
    expect(a.bookingId).not.toBe(b.bookingId);
    expect(await database().courseBooking.findUnique({ where: { id: a.bookingId } })).toMatchObject({ status: "CANCELLED", absenceKind: "TEACHER_ABSENT" });
    expect(await database().courseMusicOpeningMakeupEntitlement.count({ where: { storeId: f.storeId } })).toBe(1); await unchanged(f);
  });
  it("concurrent cancel/rebook serializes without losing or duplicating the right", async () => {
    const f = await fixture(), a = await f.run(f.reserve);
    const outcomes = await Promise.allSettled([f.run(follow(f, a.bookingId, 1, "CANCEL")), f.run({ ...f.reserve, expectedVersion: 2, sessionId: f.sessions[1].id, requestKey: randomUUID() })]);
    expect(outcomes[0].status).toBe("fulfilled");
    expect(await database().courseBooking.count({ where: { storeId: f.storeId, status: { not: "CANCELLED" } } })).toBeLessThanOrEqual(1);
    const rights = await database().courseMusicOpeningMakeupEntitlement.findMany({ where: { storeId: f.storeId }, include: { bookings: true } });
    expect(summarizeMusicOpeningMakeupRights(rights).outstanding).toBe(1); await unchanged(f);
  });
  it("concurrent attend/correct cannot evade expected versions", async () => {
    const f = await fixture(), a = await f.run(f.reserve); vi.setSystemTime(new Date("2026-10-15T04:00:00Z"));
    const outcomes = await Promise.allSettled([f.run(follow(f, a.bookingId, 1, "ATTEND")), f.run(follow(f, a.bookingId, 2, "CORRECT_TO_RESERVED", "ATTENDED"))]);
    expect(outcomes[0].status).toBe("fulfilled");
    const row = await database().courseMusicOpeningMakeupEntitlement.findUniqueOrThrow({ where: { id: f.entitlementId } });
    expect(row.version).toBe(outcomes[1].status === "fulfilled" ? 3 : 2); await unchanged(f);
  });
  it("a failed operation audit rolls back booking and lifecycle update", async () => {
    const f = await fixture(); const constraint = `reject_${randomUUID().replaceAll("-", "")}`;
    await transact(tx => tx.$executeRawUnsafe(`ALTER TABLE "AuditLog" ADD CONSTRAINT "${constraint}" CHECK ("storeId"<>'${f.storeId}' OR action<>'OPENING_MAKEUP_OPERATION') NOT VALID`));
    try { await expect(f.run(f.reserve)).rejects.toThrow(); } finally { await transact(tx => tx.$executeRawUnsafe(`ALTER TABLE "AuditLog" DROP CONSTRAINT "${constraint}"`)); }
    expect(await database().courseBooking.count({ where: { storeId: f.storeId } })).toBe(0);
    expect(await database().courseMusicOpeningMakeupEntitlement.findUnique({ where: { id: f.entitlementId } })).toMatchObject({ version: 0 }); await unchanged(f);
  });
  it.each(["COMPLETED", "NO_SHOW"] as const)("changed cutoff or renamed lesson cannot hide prior %s exclusions", async disposition => {
    const f = await fixture(false);
    const record = structuredClone(f.record);
    record.sourceStatus = disposition;
    if (disposition === "NO_SHOW") record.type = "NO_SHOW";
    else record.completedPair = { sourceMakeupLessonKey: "synthetic-actual-completion", attendance: "ATTENDED" };
    const excluded = makeupBatch([record]); excluded.scope = record.scope;
    await transact(tx => importOpeningMakeupInTransaction(tx, f.actor, excluded, makeupVerification(excluded)));
    for (const change of ["cutoff", "renamed", "both"]) {
      const relabeled = structuredClone(f.record);
      if (change !== "renamed") relabeled.scope.cutoffBusinessDate = "2026-10-02";
      if (change !== "cutoff") relabeled.sourceLessonKey = "renamed-source-lesson";
      const attempt = makeupBatch([relabeled]); attempt.scope = relabeled.scope;
      attempt.manifest.cutoffCoverage[0].customerId = f.customerId;
      await expect(transact(tx => importOpeningMakeupInTransaction(tx, f.actor, attempt, makeupVerification(attempt)))).rejects.toThrow();
    }
    expect(await database().courseMusicOpeningMakeupEntitlement.count({ where: { storeId: f.storeId } })).toBe(0);
    expect(await transact(tx => tx.$queryRaw`SELECT count(*)::int n FROM "AuditLog" WHERE "storeId"=${f.storeId} AND action='OPENING_MAKEUP_DISPOSITION'`)).toEqual([{ n: 1 }]);
    await unchanged(f);
  });
  it("a failed disposition audit rolls back the whole import", async () => {
    const f = await fixture(false); const constraint = `reject_${randomUUID().replaceAll("-", "")}`;
    await transact(tx => tx.$executeRawUnsafe(`ALTER TABLE "AuditLog" ADD CONSTRAINT "${constraint}" CHECK ("storeId"<>'${f.storeId}') NOT VALID`));
    try { await expect(transact(tx => importOpeningMakeupInTransaction(tx, f.actor, f.batch, f.verification))).rejects.toThrow(); } finally { await transact(tx => tx.$executeRawUnsafe(`ALTER TABLE "AuditLog" DROP CONSTRAINT "${constraint}"`)); }
    expect(await database().courseMusicOpeningMakeupEntitlement.count({ where: { storeId: f.storeId } })).toBe(0); await unchanged(f);
  });
  it("tenant, quota and DB immutable-source constraints reject without side effects", async () => {
    const f = await fixture(), other = await fixture();
    await expect(transact(tx => changeOpeningMakeupInTransaction(tx, other.actor, f.reserve, null))).rejects.toThrow();
    await expect(f.run(f.reserve, 0)).rejects.toThrow("額度上限");
    await expect(database().courseMusicOpeningMakeupEntitlement.update({ where: { id: f.entitlementId }, data: { snapshot: {} } })).rejects.toThrow("immutable");
    await expect(database().courseMusicOpeningMakeupEntitlement.delete({ where: { id: f.entitlementId } })).rejects.toThrow("deletion");
    await unchanged(f); await unchanged(other);
  });
});
