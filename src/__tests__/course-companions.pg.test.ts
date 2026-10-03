import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { PrismaClient, type Prisma } from "../../generated/course-client";
import { resolveBookingConcurrencyTestDatabaseUrl } from "./helpers/booking-concurrency-test-db";
import { lockCourseStore } from "@/server/services/course-store-lock";

const mocks = vi.hoisted(() => ({transaction: vi.fn(), limits: vi.fn(), feature: vi.fn(), window: vi.fn(), db: {} as Record<string, unknown>}));
vi.mock("@/server/services/course-access", () => ({courseTransaction: mocks.transaction}));
vi.mock("@/lib/feature-gate", () => ({getStoreLimitsByStoreId: mocks.limits, hasStoreFeature: mocks.feature}));
vi.mock("@/lib/shop-config", () => ({resolveCustomerBookingWindow: mocks.window}));
vi.mock("@/lib/course-db", () => ({coursePrisma: new Proxy({}, {get: (_target, key) => mocks.db[key as string]})}));
vi.mock("@/lib/db", () => ({prisma: {}}));
import { reserveCourseMembers, settleCourseBooking } from "@/server/services/course-booking";
import { changeCompanionUsage } from "@/server/services/course-companions";
import { joinCourseWaitlist, promoteCourseWaitlistForSession } from "@/server/services/course-waitlist";

const url = resolveBookingConcurrencyTestDatabaseUrl(process.env);
const schema = `companion_${randomUUID().replaceAll("-", "")}`;
const scopedUrl = url ? new URL(url) : null;
scopedUrl?.searchParams.set("schema", schema);
scopedUrl?.searchParams.set("connection_limit", "1");
const db = scopedUrl ? new PrismaClient({datasourceUrl: scopedUrl.toString()}) : null;
const database = () => {if (!db) throw new Error("Disposable loopback test database required"); return db;};
const transaction = <T>(storeId: string, work: (tx: Prisma.TransactionClient) => Promise<T>) => database().$transaction(async tx => {await lockCourseStore(tx, storeId); return work(tx);});

(url ? describe : describe.skip)("free-class companions — PostgreSQL", () => {
  beforeAll(async () => {
    await database().$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await database().$executeRawUnsafe(`SET search_path TO "${schema}"`);
    const ddl = execFileSync("node_modules/.bin/prisma", ["migrate", "diff", "--from-empty", "--to-schema-datamodel", "course-prisma/schema.prisma", "--script"], {encoding: "utf8"});
    for (const sql of ddl.split(";").map(s => s.trim()).filter(Boolean)) await database().$executeRawUnsafe(sql);
    // Apply the reviewed migration to the original booking/waitlist shape.
    for (const table of ["CourseBooking", "CourseWaitlistEntry"]) {
      await database().$executeRawUnsafe(`ALTER TABLE "${table}" DROP COLUMN "companionIndex", DROP COLUMN "reserverCustomerId", DROP COLUMN "reserverName", DROP COLUMN "reserverCardId", ALTER COLUMN "customerId" SET NOT NULL`);
    }
    await database().$executeRawUnsafe('ALTER TABLE "CourseBooking" DROP COLUMN "groupKey"');
    const migration = readFileSync("supabase/migrations/20261003105340_course_companion_booking.sql", "utf8");
    for (const sql of migration.split(";").map(s => s.trim()).filter(Boolean)) await database().$executeRawUnsafe(sql);
    for (const sql of [
      'CREATE TABLE "Store" (id text PRIMARY KEY, "industryModule" text)',
      'CREATE TABLE "Customer" (id text PRIMARY KEY, "storeId" text, name text, "mergedIntoCustomerId" text)',
      'CREATE TABLE "StoreFeatureEntitlement" ("storeId" text, "featureKey" text, status text)',
      'CREATE TABLE "ShopConfig" ("storeId" text, "bookableUntilDate" date, "bookingOpensAt" timestamptz, "bookingWindowDays" integer)',
      'CREATE TABLE "BusinessHours" ("storeId" text, "dayOfWeek" integer, "isOpen" boolean)',
      'CREATE TABLE "SpecialBusinessDay" ("storeId" text, date date, type text)',
      'CREATE TABLE "AuditLog" (id text PRIMARY KEY, "actorUserId" text, "actorNameSnapshot" text, "storeId" text, module text, "targetType" text, "targetId" text, action text, summary text, "beforeJson" jsonb, "afterJson" jsonb, "createdAt" timestamp)',
    ]) await database().$executeRawUnsafe(sql);
    mocks.transaction.mockImplementation((storeId, work) => transaction(storeId, work));
    mocks.limits.mockResolvedValue({maxMonthlyBookings: null}); mocks.feature.mockResolvedValue(true);
    mocks.window.mockReturnValue({closesAt: new Date("2099-12-31")});
    mocks.db.$transaction = database().$transaction.bind(database());
    for (const key of ["courseWaitlistSetting", "courseSession", "courseWaitlistEntry"] as const) mocks.db[key] = database()[key];
  }, 30000);
  afterAll(async () => {if (db) {await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); await db.$disconnect();}});

  async function fixture(capacity = 3, shared = true) {
    const storeId = randomUUID(), customerId = randomUUID(), bId = randomUUID();
    await database().$executeRaw`INSERT INTO "Store" VALUES (${storeId},'COURSE')`;
    await database().$executeRaw`INSERT INTO "Customer" VALUES (${customerId},${storeId},'A',NULL),(${bId},${storeId},'B',NULL)`;
    const plan = await database().coursePointPlan.create({data: {storeId, name: "自由選課", points: 10, price: 1000, validDays: 30, allowShared: shared}});
    const card = await database().coursePointCard.create({data: {storeId, planId: plan.id, nameSnapshot: "A 方案", remaining: 10, expiresAt: new Date("2099-12-31"), requestKey: randomUUID(), members: {create: {customerId}}}});
    const room = await database().courseRoom.create({data: {storeId, name: "教室", capacity}});
    const template = await database().courseTemplate.create({data: {storeId, name: "瑜珈", pointCost: 2, durationMinutes: 60, capacity, visibility: "PUBLIC", waitlistEnabled: true}});
    const session = await database().courseSession.create({data: {storeId, templateId: template.id, nameSnapshot: template.name, coachId: "coach", roomId: room.id, startsAt: new Date("2099-01-01T08:00:00Z"), endsAt: new Date("2099-01-01T09:00:00Z"), pointCost: 2, capacity, requestKey: randomUUID(), requestIndex: 0, createdById: "manager"}});
    const actor = {storeId, customerId, userId: "member", name: "A"};
    const manager = {storeId, userId: "manager", name: "店長"};
    const input = {sessionId: session.id, cardId: card.id, customerIds: [customerId], companionNames: ["", "朋友"], requestKey: randomUUID()};
    return {storeId, customerId, bId, card, plan, session, actor, manager, input};
  }

  it("reserves three separate seats and allowance without registering companions; retries are idempotent", async () => {
    const f = await fixture(); const rows = await reserveCourseMembers(f.actor, f.input);
    expect(rows.map(b => b.customerName)).toEqual(["A", "同行者 1", "朋友"]);
    expect(rows.map(b => b.customerId)).toEqual([f.customerId, null, null]);
    expect((await reserveCourseMembers(f.actor, f.input)).map(b => b.id)).toEqual(rows.map(b => b.id));
    expect(await database().courseBooking.count({where: {storeId: f.storeId}})).toBe(3);
    expect((await database().coursePointCard.findUniqueOrThrow({where: {id: f.card.id}})).remaining).toBe(10);
    expect((await database().courseBooking.aggregate({where: {cardId: f.card.id, status: "RESERVED"}, _sum: {pointCost: true}}))._sum.pointCost).toBe(6);
    expect(await database().courseCardMember.count({where: {cardId: f.card.id}})).toBe(1);
  });
  it("rolls back the entire group when capacity or plan sharing prevents companions", async () => {
    for (const f of [await fixture(2), await fixture(3, false)]) {
      await expect(reserveCourseMembers(f.actor, f.input)).rejects.toThrow();
      expect(await database().courseBooking.count({where: {storeId: f.storeId}})).toBe(0);
    }
  });
  it("keeps music and fixed-term bookings on their original named-member path", async () => {
    const f = await fixture();
    await database().$executeRaw`INSERT INTO "StoreFeatureEntitlement" VALUES (${f.storeId},'business.music','ENABLED')`;
    await expect(reserveCourseMembers(f.actor, f.input)).rejects.toThrow();
    await database().$executeRaw`DELETE FROM "StoreFeatureEntitlement" WHERE "storeId"=${f.storeId}`;
    await database().coursePointCard.update({where: {id: f.card.id}, data: {termSessionIds: [f.session.id]}});
    await expect(reserveCourseMembers(f.actor, f.input)).rejects.toThrow("同行預約");
    expect((await reserveCourseMembers(f.actor, {...f.input, companionNames: []})).length).toBe(1);
  });
  it("releases reserved allowance, refunds attended allowance once, and attaches B to the same seat", async () => {
    const f = await fixture(); const rows = await reserveCourseMembers(f.actor, f.input); let guest = rows[1];
    const attended = await transaction(f.storeId, tx => settleCourseBooking(tx, f.manager, guest.id, "ATTENDED"));
    const change = {bookingId: guest.id, mode: "TRIAL" as const, trialPrice: 300, expectedUpdatedAt: attended.updatedAt.toISOString(), requestKey: randomUUID()};
    guest = await transaction(f.storeId, tx => changeCompanionUsage(tx, f.manager, change));
    await transaction(f.storeId, tx => changeCompanionUsage(tx, f.manager, change));
    expect(guest).toMatchObject({id: rows[1].id, sessionId: f.session.id, status: "ATTENDED", bookingKind: "TRIAL", customerId: null, cardId: null});
    expect((await database().coursePointCard.findUniqueOrThrow({where: {id: f.card.id}})).remaining).toBe(10);
    const bCard = await database().coursePointCard.create({data: {storeId: f.storeId, planId: f.plan.id, nameSnapshot: "B 方案", remaining: 10, expiresAt: new Date("2099-12-31"), requestKey: randomUUID(), members: {create: {customerId: f.bId}}}});
    guest = await transaction(f.storeId, tx => changeCompanionUsage(tx, f.manager, {bookingId: guest.id, mode: "MEMBER", customerId: f.bId, cardId: bCard.id, expectedUpdatedAt: guest.updatedAt.toISOString(), requestKey: randomUUID()}));
    expect(guest).toMatchObject({id: rows[1].id, customerId: f.bId, status: "ATTENDED", cardId: bCard.id});
    expect((await database().coursePointCard.findUniqueOrThrow({where: {id: bCard.id}})).remaining).toBe(8);
    expect(await database().courseBooking.count({where: {storeId: f.storeId}})).toBe(3);
    const reserved = rows[2];
    await transaction(f.storeId, tx => changeCompanionUsage(tx, f.manager, {...change, bookingId: reserved.id, expectedUpdatedAt: reserved.updatedAt.toISOString(), requestKey: randomUUID()}));
    expect((await database().courseBooking.aggregate({where: {cardId: f.card.id, status: "RESERVED"}, _sum: {pointCost: true}}))._sum.pointCost).toBe(2);
  });
  it("rejects stale corrections and cancels one guest without cancelling the rest", async () => {
    const f = await fixture(); const rows = await reserveCourseMembers(f.actor, f.input);
    await transaction(f.storeId, tx => settleCourseBooking(tx, f.manager, rows[1].id, "ATTENDED"));
    await expect(transaction(f.storeId, tx => changeCompanionUsage(tx, f.manager, {bookingId: rows[1].id, mode: "TRIAL", trialPrice: 0, expectedUpdatedAt: rows[1].updatedAt.toISOString(), requestKey: randomUUID()}))).rejects.toThrow("預約已更新");
    await transaction(f.storeId, tx => settleCourseBooking(tx, f.actor, rows[2].id, "CANCELLED"));
    expect(await database().courseBooking.count({where: {storeId: f.storeId, status: {not: "CANCELLED"}}})).toBe(2);
  });
  it("waits and promotes all three companions together, retaining their names and reserver", async () => {
    const f = await fixture(3);
    await database().courseWaitlistSetting.create({data: {storeId: f.storeId, enabled: true}});
    await database().courseBooking.createMany({data: [1, 2].map(i => ({storeId: f.storeId, sessionId: f.session.id, cardId: null, bookingKind: "TRIAL", trialPrice: 0, customerId: `block-${i}`, customerName: "占位", operatorUserId: "manager", operatorName: "店長", pointCost: 0, requestKey: randomUUID()}))});
    const waiting = await joinCourseWaitlist(f.actor, f.input);
    expect(waiting.rows.length).toBe(3);
    expect((await joinCourseWaitlist(f.actor, f.input)).rows.map(b => b.id).sort()).toEqual(waiting.rows.map(b => b.id).sort());
    expect(await transaction(f.storeId, tx => promoteCourseWaitlistForSession(tx, f.storeId, f.session.id))).toEqual([]);
    await database().courseBooking.updateMany({where: {storeId: f.storeId}, data: {status: "CANCELLED"}});
    const promoted = await transaction(f.storeId, tx => promoteCourseWaitlistForSession(tx, f.storeId, f.session.id));
    expect(promoted.length).toBe(3); expect(promoted.every(b => b.customerId === f.customerId)).toBe(true);
    expect(await database().courseBooking.count({where: {storeId: f.storeId, status: "RESERVED", reserverCustomerId: f.customerId}})).toBe(3);
  });
});
