import { installAuditOutboxTestSchema } from "./helpers/audit-outbox-test-schema";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaClient, type Prisma, type CourseSession } from "../../generated/course-client";
import { COURSE_SELF_BOOKING_DISABLED_MESSAGE } from "@/lib/course-self-booking";
import { resolveBookingConcurrencyTestDatabaseUrl } from "./helpers/booking-concurrency-test-db";

const mocks = vi.hoisted(() => ({ member: vi.fn(), transaction: vi.fn(), limits: vi.fn() }));
vi.mock("@/server/services/course-access", () => ({ courseMember: mocks.member, courseTransaction: mocks.transaction }));
vi.mock("@/lib/feature-gate", () => ({ getStoreLimitsByStoreId: mocks.limits }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: {} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// External notifications are deliberately excluded from this database test.
vi.mock("next/server", () => ({ after: vi.fn() }));
import { confirmMemberCourseTrial, rescheduleMemberCourseBooking } from "@/server/actions/course-booking-notification";
import { reserveCourseInTransaction } from "@/server/services/course-booking";
import { lockCourseStore } from "@/server/services/course-store-lock";

const databaseUrl = resolveBookingConcurrencyTestDatabaseUrl(process.env);
const schema = `course_notification_${randomUUID().replaceAll("-", "")}`;
const url = databaseUrl ? new URL(databaseUrl) : null;
url?.searchParams.set("schema", schema);
const db = url ? new PrismaClient({ datasourceUrl: url.toString() }) : null;

(databaseUrl ? describe : describe.skip)("course notification actions — real PostgreSQL", () => {
  let created = false;
  const fixtureStoreIds = new Set<string>();
  beforeAll(async () => {
    await db!.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    await installAuditOutboxTestSchema(databaseUrl!, db!);
    const ddl = execFileSync("node_modules/.bin/prisma", ["migrate", "diff", "--from-empty", "--to-schema-datamodel", "course-prisma/schema.prisma", "--script"], { encoding: "utf8" });
    for (const sql of ddl.split(";").map(s => s.trim()).filter(Boolean)) await db!.$executeRawUnsafe(sql);
    for (const sql of [
      'CREATE TABLE "Store" (id text PRIMARY KEY,"industryModule" text)',
      'CREATE TABLE "Customer" (id text PRIMARY KEY,"storeId" text,name text,"mergedIntoCustomerId" text)',
      'CREATE TABLE "StoreFeatureEntitlement" ("storeId" text,"featureKey" text,status text)',
      'CREATE TABLE "SpecialBusinessDay" ("storeId" text,date date,type text)',
      'CREATE TABLE "BusinessHours" ("storeId" text,"dayOfWeek" int,"isOpen" boolean)',
      'CREATE TABLE "ShopConfig" ("storeId" text,"bookableUntilDate" date,"bookingOpensAt" timestamptz,"bookingWindowDays" int)',
      'CREATE TABLE "AuditLog" (id text PRIMARY KEY,"actorUserId" text,"actorNameSnapshot" text,"storeId" text,module text,summary text,"targetType" text,"targetId" text,action text,"beforeJson" jsonb,"afterJson" jsonb,"createdAt" timestamptz)',
    ]) await db!.$executeRawUnsafe(sql);
  }, 30000);
  afterAll(async () => {
    vi.useRealTimers();
    for (const storeId of fixtureStoreIds) await db!.$executeRaw`DELETE FROM public."OperationAuditOutbox" WHERE payload->>'storeId'=${storeId}`;
    if (created) await db!.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await db?.$disconnect();
  });

  async function fixture(trial = false) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-10T00:00:00Z"));
    const storeId = randomUUID(), customerId = randomUUID(), userId = randomUUID();
    fixtureStoreIds.add(storeId);
    await db!.$executeRaw`INSERT INTO "Store" VALUES (${storeId},'COURSE')`;
    await db!.$executeRaw`INSERT INTO "Customer" VALUES (${customerId},${storeId},'驗收學員',NULL)`;
    const transact = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => db!.$transaction(async tx => { await lockCourseStore(tx, storeId); return work(tx); });
    mocks.member.mockResolvedValue({ user: { id: userId }, storeId, customer: { id: customerId, name: "驗收學員" } });
    mocks.transaction.mockImplementation((_store, work) => transact(work));
    mocks.limits.mockResolvedValue({ maxMonthlyBookings: 100 });
    const room = await db!.courseRoom.create({ data: { storeId, name: "驗收教室" } });
    const template = await db!.courseTemplate.create({ data: { storeId, name: "自由約課", durationMinutes: 60, pointCost: 1, capacity: 1, visibility: "PUBLIC" } });
    const plan = await db!.coursePointPlan.create({ data: { storeId, name: "驗收方案", points: 4, price: 1000, validDays: 365 } });
    const card = await db!.coursePointCard.create({ data: { storeId, planId: plan.id, nameSnapshot: plan.name, remaining: 4, expiresAt: new Date("2031-01-01"), requestKey: randomUUID() } });
    await db!.courseCardMember.create({ data: { storeId, cardId: card.id, customerId } });
    const sessions: CourseSession[] = [];
    for (const day of ["2030-01-11", "2030-01-12"]) sessions.push(await db!.courseSession.create({ data: { storeId, templateId: template.id, roomId: room.id, coachId: "coach", nameSnapshot: template.name, startsAt: new Date(`${day}T10:00:00Z`), endsAt: new Date(`${day}T11:00:00Z`), pointCost: 1, capacity: 1, requestKey: randomUUID(), requestIndex: 0, createdById: userId } }));
    const actor = { storeId, userId, name: "驗收學員", ...(trial ? {} : { customerId }) };
    const original = await transact(tx => reserveCourseInTransaction(tx, actor, { sessionId: sessions[0].id, cardId: trial ? null : card.id, customerId, ...(trial ? { trialPrice: 350 } : {}), requestKey: randomUUID() }, 100));
    return { storeId, customerId, userId, card, original, sessions };
  }
  async function held(cardId: string) {
    return (await db!.courseBooking.aggregate({ where: { cardId, status: "RESERVED" }, _sum: { pointCost: true } }))._sum.pointCost ?? 0;
  }
  it("moves one reservation atomically and repeated requests do not reserve twice", async () => {
    const f = await fixture();
    const input = { bookingId: f.original.id, sessionId: f.sessions[1].id };
    const result = await rescheduleMemberCourseBooking(input);
    expect(result).toMatchObject({ success: true });
    expect(await rescheduleMemberCourseBooking(input)).toEqual(result);
    expect(await db!.courseBooking.findUnique({ where: { id: f.original.id } })).toMatchObject({ status: "CANCELLED" });
    expect(await db!.courseBooking.count({ where: { storeId: f.storeId, status: "RESERVED" } })).toBe(1);
    expect(await held(f.card.id)).toBe(1);
    expect(await db!.coursePointCard.findUnique({ where: { id: f.card.id } })).toMatchObject({ remaining: 4 });
    expect(await db!.coursePointEntry.count({ where: { storeId: f.storeId, kind: "DEBIT" } })).toBe(0);
  });
  it("a full target rolls back cancellation and preserves the original reserve entry", async () => {
    const f = await fixture();
    await db!.courseBooking.create({ data: { storeId: f.storeId, sessionId: f.sessions[1].id, operatorUserId: f.userId, operatorName: "店長", customerName: "其他學員", pointCost: 0, requestKey: randomUUID() } });
    expect(await rescheduleMemberCourseBooking({ bookingId: f.original.id, sessionId: f.sessions[1].id })).toMatchObject({ success: false });
    expect(await db!.courseBooking.findUnique({ where: { id: f.original.id } })).toMatchObject({ status: "RESERVED" });
    expect(await held(f.card.id)).toBe(1);
    expect(await db!.coursePointEntry.count({ where: { bookingId: f.original.id, kind: "RELEASE" } })).toBe(0);
  });
  it("an uncovered lesson date rolls back cancellation and all ledger writes", async () => {
    const f = await fixture();
    await db!.coursePointCard.update({ where: { id: f.card.id }, data: { expiresAt: f.sessions[0].endsAt } });
    expect(await rescheduleMemberCourseBooking({ bookingId: f.original.id, sessionId: f.sessions[1].id })).toMatchObject({ success: false });
    expect(await db!.courseBooking.findUnique({ where: { id: f.original.id } })).toMatchObject({ status: "RESERVED" });
    expect(await db!.courseBooking.count({ where: { storeId: f.storeId } })).toBe(1);
    expect(await held(f.card.id)).toBe(1);
    expect(await db!.coursePointEntry.count({ where: { storeId: f.storeId } })).toBe(1);
  });
  it("trial confirmation changes no attendance or receipt; rescheduling moves the same receipt", async () => {
    const f = await fixture(true);
    const receipt = await db!.courseTrialPayment.create({ data: { storeId: f.storeId, bookingId: f.original.id, amount: 350, paymentMethod: "CASH", requestKey: randomUUID(), actorUserId: f.userId } });
    expect(await confirmMemberCourseTrial(f.original.id)).toMatchObject({ success: true });
    expect(await confirmMemberCourseTrial(f.original.id)).toMatchObject({ success: true });
    expect(await db!.courseBooking.findUnique({ where: { id: f.original.id } })).toMatchObject({ status: "RESERVED", checkedInAt: null });
    expect(await db!.courseTrialPayment.findUnique({ where: { id: receipt.id } })).toEqual(receipt);
    const result = await rescheduleMemberCourseBooking({ bookingId: f.original.id, sessionId: f.sessions[1].id });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    if (!("bookingId" in result)) throw new Error("Missing rescheduled booking ID");
    expect(await db!.courseTrialPayment.findUnique({ where: { id: receipt.id } })).toEqual({ ...receipt, bookingId: result.bookingId });
    expect(await db!.courseTrialPayment.count({ where: { storeId: f.storeId } })).toBe(1);
    expect(await db!.coursePointEntry.count({ where: { storeId: f.storeId } })).toBe(0);
    const confirmations = await db!.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM "AuditLog" WHERE "storeId"=${f.storeId} AND action='COURSE_TRIAL_CONFIRM'`;
    expect(Number(confirmations[0].count)).toBe(1);
  });
  it.each([false, true])("disabled self-booking preserves every original reservation and payment row before card/trial reschedule (trial=%s)", async trial => {
    const f = await fixture(trial);
    if (trial) await db!.courseTrialPayment.create({data: {storeId: f.storeId, bookingId: f.original.id, amount: 350, paymentMethod: "CASH", requestKey: randomUUID(), actorUserId: f.userId}});
    await db!.$transaction(async tx => {
      await lockCourseStore(tx, f.storeId);
      await tx.courseBookingRule.create({data: {storeId: f.storeId, selfBookingEnabled: false, selfBookingRevision: 1}});
    });
    const before = {
      bookings: await db!.courseBooking.findMany({where: {storeId: f.storeId}}),
      ledger: await db!.coursePointEntry.findMany({where: {storeId: f.storeId}}),
      receipts: await db!.courseTrialPayment.findMany({where: {storeId: f.storeId}}),
      card: await db!.coursePointCard.findUniqueOrThrow({where: {id: f.card.id}}),
    };
    const input = {bookingId: f.original.id, sessionId: f.sessions[1].id};
    expect(await rescheduleMemberCourseBooking(input)).toMatchObject({success: false, error: COURSE_SELF_BOOKING_DISABLED_MESSAGE});
    expect(await rescheduleMemberCourseBooking(input)).toMatchObject({success: false, error: COURSE_SELF_BOOKING_DISABLED_MESSAGE});
    expect(await db!.courseBooking.findMany({where: {storeId: f.storeId}})).toEqual(before.bookings);
    expect(await db!.coursePointEntry.findMany({where: {storeId: f.storeId}})).toEqual(before.ledger);
    expect(await db!.courseTrialPayment.findMany({where: {storeId: f.storeId}})).toEqual(before.receipts);
    expect(await db!.coursePointCard.findUniqueOrThrow({where: {id: f.card.id}})).toEqual(before.card);
    const audit = await db!.$queryRaw<Array<{count: bigint}>>`SELECT count(*) FROM "AuditLog" WHERE "storeId"=${f.storeId} AND action='COURSE_MEMBER_RESCHEDULE'`;
    expect(Number(audit[0].count)).toBe(0);
    expect(await held(f.card.id)).toBe(trial ? 0 : 1);
    if (trial) expect(await confirmMemberCourseTrial(f.original.id)).toMatchObject({success: true});
    await db!.$transaction(async tx => {
      await lockCourseStore(tx, f.storeId);
      await tx.courseBookingRule.update({where: {storeId: f.storeId}, data: {selfBookingEnabled: true, selfBookingRevision: {increment: 1}}});
    });
    const resumed = await rescheduleMemberCourseBooking(input);
    expect(resumed).toMatchObject({success: true});
    if (!resumed.success || !("bookingId" in resumed)) throw new Error("Re-enabled reschedule did not create a replacement");
    expect(await rescheduleMemberCourseBooking(input)).toEqual(resumed);
    expect(await db!.courseBooking.findUnique({where: {id: f.original.id}})).toMatchObject({status: "CANCELLED"});
    expect(await db!.courseBooking.findUnique({where: {id: resumed.bookingId}})).toMatchObject({status: "RESERVED", sessionId: f.sessions[1].id, bookingKind: trial ? "TRIAL" : f.original.bookingKind});
    expect(await db!.courseBooking.count({where: {storeId: f.storeId, status: "RESERVED"}})).toBe(1);
    expect(await db!.coursePointCard.findUniqueOrThrow({where: {id: f.card.id}})).toEqual(before.card);
    expect(await held(f.card.id)).toBe(trial ? 0 : 1);
    expect(await db!.coursePointEntry.count({where: {storeId: f.storeId, kind: {in: ["DEBIT", "REFUND"]}}})).toBe(0);
    expect(await db!.courseTrialPayment.findMany({where: {storeId: f.storeId}})).toEqual(before.receipts.map(receipt => ({...receipt, bookingId: resumed.bookingId})));
  });

});
