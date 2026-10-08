import { installAuditOutboxTestSchema } from "./helpers/audit-outbox-test-schema";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { PrismaClient, type Prisma } from "../../generated/course-client";
import { resolveBookingConcurrencyTestDatabaseUrl } from "./helpers/booking-concurrency-test-db";
import { lockCourseStore } from "@/server/services/course-store-lock";
import { COURSE_SELF_BOOKING_DISABLED_MESSAGE } from "@/lib/course-self-booking";
import { waitlistGroups } from "@/lib/course-waitlist";

const mocks = vi.hoisted(() => ({manager: vi.fn(), transaction: vi.fn(), limits: vi.fn(), feature: vi.fn(), window: vi.fn(), db: {} as Record<string, unknown>}));
vi.mock("@/server/services/course-access", () => ({courseManager: mocks.manager, courseTransaction: mocks.transaction}));
vi.mock("@/lib/feature-gate", () => ({getStoreLimitsByStoreId: mocks.limits, hasStoreFeature: mocks.feature}));
vi.mock("@/lib/shop-config", () => ({resolveCustomerBookingWindow: mocks.window}));
vi.mock("@/lib/course-db", () => ({coursePrisma: new Proxy({}, {get: (_target, key) => mocks.db[key as string]})}));
vi.mock("@/lib/db", () => ({prisma: {}}));
vi.mock("@/lib/subscription-guard", () => ({assertStoreSubscriptionWritable: vi.fn()}));
vi.mock("@/lib/revalidation", () => ({revalidateShopConfig: vi.fn()}));
vi.mock("@/server/actions/shop", () => ({updateShopBankInfo: vi.fn()}));
vi.mock("next/cache", () => ({revalidatePath: vi.fn()}));
import { saveCourseSelfBookingSettings } from "@/server/actions/course-settings";
import { reserveCourseInTransaction, reserveCourseMembers, reserveTrialCourse, settleCourseBooking } from "@/server/services/course-booking";
import { changeCompanionUsage } from "@/server/services/course-companions";
import { cancelMemberCourseWaitlist, joinCourseWaitlist, promoteCourseWaitlistForSession } from "@/server/services/course-waitlist";

const url = resolveBookingConcurrencyTestDatabaseUrl(process.env);
const fixtureStoreIds = new Set<string>();
let auditSchemaInstalled = false;
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
    await installAuditOutboxTestSchema(url!, database());
    auditSchemaInstalled = true;
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
      'CREATE TABLE "StoreFeatureEntitlement" ("storeId" text, "featureKey" text, status text, "startsAt" timestamptz, "expiresAt" timestamptz)',
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
  afterAll(async () => {
    if (db) {
      if (auditSchemaInstalled) for (const storeId of fixtureStoreIds) {
        await db.$executeRaw`DELETE FROM public."OperationAuditOutbox" WHERE payload->>'storeId'=${storeId}`;
      }
      await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await db.$disconnect();
    }
  });

  async function fixture(capacity = 3, shared = true, sharedCardEnabled = true) {
    const storeId = randomUUID(), customerId = randomUUID(), bId = randomUUID();
    fixtureStoreIds.add(storeId);
    await database().$executeRaw`INSERT INTO "Store" VALUES (${storeId},'COURSE')`;
    if (sharedCardEnabled) await database().$executeRaw`INSERT INTO "StoreFeatureEntitlement" ("storeId", "featureKey", status) VALUES (${storeId},'shared_card','ENABLED')`;
    await database().$executeRaw`INSERT INTO "Customer" VALUES (${customerId},${storeId},'A',NULL),(${bId},${storeId},'B',NULL)`;
    const plan = await database().coursePointPlan.create({data: {storeId, name: "自由選課", points: 10, price: 1000, validDays: 30, allowShared: shared}});
    const card = await database().coursePointCard.create({data: {storeId, planId: plan.id, nameSnapshot: "A 方案", remaining: 10, expiresAt: new Date("2099-12-31"), requestKey: randomUUID(), members: {create: {customerId}}}});
    const room = await database().courseRoom.create({data: {storeId, name: "教室", capacity}});
    const template = await database().courseTemplate.create({data: {storeId, name: "瑜珈", pointCost: 2, durationMinutes: 60, capacity, visibility: "PUBLIC", waitlistEnabled: true}});
    const session = await database().courseSession.create({data: {storeId, templateId: template.id, nameSnapshot: template.name, coachId: "coach", roomId: room.id, startsAt: new Date("2099-01-01T08:00:00Z"), endsAt: new Date("2099-01-01T09:00:00Z"), pointCost: 2, capacity, requestKey: randomUUID(), requestIndex: 0, createdById: "manager"}});
    const actor = {storeId, customerId, userId: "member", name: "A"};
    const manager = {storeId, userId: "manager", name: "店長"};
    mocks.manager.mockResolvedValue({storeId, user: {id: manager.userId, name: manager.name}});
    const input = {sessionId: session.id, cardId: card.id, customerIds: [customerId], companionNames: ["", "朋友"], requestKey: randomUUID()};
    return {storeId, customerId, bId, card, plan, session, actor, manager, input};
  }

  async function setSelfBooking(enabled: boolean) {
    const result = await saveCourseSelfBookingSettings({enabled});
    expect(result).toMatchObject({success: true, enabled});
    return result;
  }

  async function queuedFixture() {
    const f = await fixture(1);
    await database().courseWaitlistSetting.create({data: {storeId: f.storeId, enabled: true}});
    const blocker = await reserveTrialCourse(f.manager, {sessionId: f.session.id, customerId: f.bId, trialPrice: 0, requestKey: randomUUID()});
    const input = {...f.input, companionNames: []};
    const waiting = await joinCourseWaitlist(f.actor, input);
    await transaction(f.storeId, tx => settleCourseBooking(tx, f.manager, blocker.id, "CANCELLED"));
    return {...f, input, waiting};
  }

  async function queueSnapshot(storeId: string) {
    const rows = await database().courseWaitlistEntry.findMany({where: {storeId}, orderBy: [{createdAt: "asc"}, {id: "asc"}]});
    return {rows, positions: waitlistGroups(rows.filter(row => row.status === "WAITING")).map((group, index) => ({position: index + 1, ids: group.map(row => row.id)}))};
  }

  async function waitForStoreLock(waiterPid: number, holderPid: number) {
    // Observe PostgreSQL's actual lock wait rather than relying on a timed race.
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const [row] = await database().$queryRaw<Array<{blocked: boolean}>>`SELECT ${holderPid}::int = ANY(pg_blocking_pids(${waiterPid}::int)) AS blocked`;
      if (row.blocked) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error("Competing PostgreSQL connection never waited for the Store lock");
  }

  async function disableBeforeMutation<T>(storeId: string, work: (tx: Prisma.TransactionClient) => Promise<T>) {
    const toggleClient = new PrismaClient({datasourceUrl: scopedUrl!.toString()});
    const mutationClient = new PrismaClient({datasourceUrl: scopedUrl!.toString()});
    let releaseToggle!: () => void;
    const holdToggle = new Promise<void>(resolve => {releaseToggle = resolve;});
    let markToggleReady!: (pid: number) => void;
    const toggleReady = new Promise<number>(resolve => {markToggleReady = resolve;});
    let markMutationReady!: (pid: number) => void;
    const mutationReady = new Promise<number>(resolve => {markMutationReady = resolve;});
    let mutation: Promise<T> | undefined;
    mocks.transaction.mockImplementation((id: string, action: (tx: Prisma.TransactionClient) => Promise<unknown>) => toggleClient.$transaction(async tx => {
      const [{pid}] = await tx.$queryRaw<Array<{pid: number}>>`SELECT pg_backend_pid() AS pid`;
      await lockCourseStore(tx, id);
      const result = await action(tx);
      markToggleReady(pid);
      await holdToggle;
      return result;
    }, {maxWait: 10000, timeout: 15000}));
    const toggle = saveCourseSelfBookingSettings({enabled: false});
    try {
      // Surface a failed toggle rather than leaving an unresolved barrier.
      const togglePid = await Promise.race([toggleReady, toggle.then(() => {throw new Error("Toggle did not reach its locked transaction");})]);
      mutation = mutationClient.$transaction(async tx => {
        const [{pid}] = await tx.$queryRaw<Array<{pid: number}>>`SELECT pg_backend_pid() AS pid`;
        markMutationReady(pid);
        await lockCourseStore(tx, storeId);
        return work(tx);
      }, {maxWait: 10000, timeout: 15000});
      // Attach rejection handling before releasing the blocking transaction.
      const outcome = mutation.then(value => ({ok: true as const, value}), error => ({ok: false as const, error}));
      const mutationPid = await Promise.race([mutationReady, outcome.then(() => {throw new Error("Mutation did not open its PostgreSQL transaction");})]);
      expect(mutationPid).not.toBe(togglePid);
      await waitForStoreLock(mutationPid, togglePid);
      releaseToggle();
      expect(await toggle).toMatchObject({success: true, enabled: false, revision: 1});
      expect(await database().courseBookingRule.findUnique({where: {storeId}})).toMatchObject({selfBookingEnabled: false, selfBookingRevision: 1});
      return await outcome;
    } finally {
      releaseToggle();
      await Promise.allSettled([toggle, ...(mutation ? [mutation] : [])]);
      mocks.transaction.mockImplementation((id, action) => transaction(id, action));
      await Promise.all([toggleClient.$disconnect(), mutationClient.$disconnect()]);
    }
  }

  it("reserves three separate seats and allowance without registering companions; retries are idempotent", async () => {
    const f = await fixture(); const rows = await reserveCourseMembers(f.actor, f.input);
    expect(rows.map(b => b.customerName)).toEqual(["A", "同行者 1", "朋友"]);
    expect(rows.map(b => b.customerId)).toEqual([f.customerId, null, null]);
    expect((await reserveCourseMembers(f.actor, f.input)).map(b => b.id)).toEqual(rows.map(b => b.id));
    const evidence = await database().$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM public."OperationAuditOutbox" WHERE payload->>'storeId'=${f.storeId} AND payload->>'targetId'=${rows[0].id}`;
    expect(Number(evidence[0].count)).toBe(1);
    expect(await database().courseBooking.count({where: {storeId: f.storeId}})).toBe(3);
    expect((await database().coursePointCard.findUniqueOrThrow({where: {id: f.card.id}})).remaining).toBe(10);
    expect((await database().courseBooking.aggregate({where: {cardId: f.card.id, status: "RESERVED"}, _sum: {pointCost: true}}))._sum.pointCost).toBe(6);
    expect(await database().courseCardMember.count({where: {cardId: f.card.id}})).toBe(1);
  });
  it("rolls back the entire group when capacity, plan sharing or absent store grant prevents companions", async () => {
    for (const f of [await fixture(2), await fixture(3, false), await fixture(3, true, false)]) {
      await expect(reserveCourseMembers(f.actor, f.input)).rejects.toThrow();
      expect(await database().courseBooking.count({where: {storeId: f.storeId}})).toBe(0);
    }
  });
  it("keeps music and fixed-term bookings on their original named-member path", async () => {
    const f = await fixture();
    await database().$executeRaw`INSERT INTO "StoreFeatureEntitlement" ("storeId", "featureKey", status) VALUES (${f.storeId},'business.music','ENABLED')`;
    await expect(reserveCourseMembers(f.actor, f.input)).rejects.toThrow();
    await database().$executeRaw`DELETE FROM "StoreFeatureEntitlement" WHERE "storeId"=${f.storeId} AND "featureKey"='business.music'`;
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
  it("serializes two real connections competing for the same shared balance across sessions", async () => {
    const f = await fixture(3);
    await database().courseCardMember.create({data: {storeId: f.storeId, cardId: f.card.id, customerId: f.bId}});
    const second = await database().courseSession.create({data: {
      storeId: f.storeId, templateId: f.session.templateId, nameSnapshot: "第二堂競爭預約",
      coachId: f.session.coachId, roomId: f.session.roomId,
      startsAt: new Date("2099-01-02T08:00:00Z"), endsAt: new Date("2099-01-02T09:00:00Z"),
      pointCost: 2, capacity: 3, requestKey: randomUUID(), requestIndex: 0, createdById: "manager",
    }});
    const clients = [new PrismaClient({datasourceUrl: scopedUrl!.toString()}), new PrismaClient({datasourceUrl: scopedUrl!.toString()})];
    const backendIds: number[] = [];
    let next = 0;
    let release!: () => void;
    const bothStarted = new Promise<void>(resolve => { release = resolve; });
    mocks.transaction.mockImplementation((storeId: string, work: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
      clients[next++ % clients.length].$transaction(async tx => {
        const [{pid}] = await tx.$queryRaw<Array<{pid: number}>>`SELECT pg_backend_pid() AS pid`;
        backendIds.push(pid);
        if (backendIds.length === 2) release();
        await bothStarted;
        await lockCourseStore(tx, storeId);
        return work(tx);
      }, {maxWait: 10000, timeout: 10000}));
    try {
      const outcomes = await Promise.allSettled([
        reserveCourseMembers(f.actor, f.input),
        reserveCourseMembers({...f.actor, customerId: f.bId, userId: "member-b", name: "B"}, {...f.input, sessionId: second.id, customerIds: [f.bId], requestKey: randomUUID()}),
      ]);
      expect(new Set(backendIds).size).toBe(2);
      expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
      expect(outcomes.filter(result => result.status === "rejected")).toHaveLength(1);
      expect(await database().courseBooking.count({where: {storeId: f.storeId, status: "RESERVED"}})).toBe(3);
      expect((await database().courseBooking.aggregate({where: {cardId: f.card.id, status: "RESERVED"}, _sum: {pointCost: true}}))._sum.pointCost).toBe(6);
      expect((await database().coursePointCard.findUniqueOrThrow({where: {id: f.card.id}})).remaining).toBe(10);
    } finally {
      mocks.transaction.mockImplementation((storeId, work) => transaction(storeId, work));
      await Promise.all(clients.map(client => client.$disconnect()));
    }
  }, 20000);
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
  it("defaults legacy and newly persisted rules to student booking enabled", async () => {
    const f = await fixture();
    expect(await database().courseBookingRule.findUnique({where: {storeId: f.storeId}})).toBeNull();
    const rule = await database().courseBookingRule.create({data: {storeId: f.storeId}});
    expect(rule).toMatchObject({selfBookingEnabled: true, selfBookingRevision: 0});
    expect(await reserveCourseMembers(f.actor, f.input)).toHaveLength(3);
  });

  it("blocks new student reservations while off, preserves retries and cancellation, and permits staff booking", async () => {
    const f = await fixture();
    const original = await reserveCourseMembers(f.actor, {...f.input, companionNames: []});
    await setSelfBooking(false);
    expect((await reserveCourseMembers(f.actor, {...f.input, companionNames: []})).map(row => row.id)).toEqual(original.map(row => row.id));
    await expect(reserveCourseMembers(f.actor, {...f.input, requestKey: randomUUID()})).rejects.toThrow(COURSE_SELF_BOOKING_DISABLED_MESSAGE);
    await transaction(f.storeId, tx => settleCourseBooking(tx, f.actor, original[0].id, "CANCELLED"));
    expect(await database().courseBooking.findUnique({where: {id: original[0].id}})).toMatchObject({status: "CANCELLED"});
    const staff = await transaction(f.storeId, tx => reserveCourseInTransaction(tx, f.manager, {sessionId: f.session.id, cardId: f.card.id, customerId: f.customerId, requestKey: randomUUID()}, null));
    expect(staff).toMatchObject({status: "RESERVED", customerId: f.customerId});
    await transaction(f.storeId, tx => settleCourseBooking(tx, f.manager, staff.id, "CANCELLED"));
    expect(await setSelfBooking(true)).toMatchObject({revision: 2});
    expect(await reserveCourseMembers(f.actor, {...f.input, requestKey: randomUUID()})).toHaveLength(3);
    expect(await database().coursePointCard.findUnique({where: {id: f.card.id}})).toMatchObject({remaining: 10});
  });

  it("rejects new waitlist joins while off, then enables joins and retains member cancellation", async () => {
    const f = await fixture(1);
    await database().courseWaitlistSetting.create({data: {storeId: f.storeId, enabled: true}});
    await reserveTrialCourse(f.manager, {sessionId: f.session.id, customerId: f.bId, trialPrice: 0, requestKey: randomUUID()});
    const input = {...f.input, companionNames: []};
    await setSelfBooking(false);
    await expect(joinCourseWaitlist(f.actor, input)).rejects.toThrow(COURSE_SELF_BOOKING_DISABLED_MESSAGE);
    expect(await database().courseWaitlistEntry.count({where: {storeId: f.storeId}})).toBe(0);
    await setSelfBooking(true);
    const waiting = await joinCourseWaitlist(f.actor, input);
    await setSelfBooking(false);
    expect(await joinCourseWaitlist(f.actor, input)).toEqual(waiting);
    expect(await cancelMemberCourseWaitlist(f.actor, {sessionId: f.session.id})).toEqual({count: 1});
    expect(await database().courseWaitlistEntry.findUnique({where: {id: waiting.rows[0].id}})).toMatchObject({status: "CANCELLED"});
    expect(await database().coursePointEntry.count({where: {storeId: f.storeId}})).toBe(0);
  });

  it("pauses the entire queue without changing rows, positions, timestamps or balances; manual and re-enabled promotion retain rights", async () => {
    const f = await fixture(3);
    await database().courseWaitlistSetting.create({data: {storeId: f.storeId, enabled: true}});
    await database().courseCardMember.create({data: {storeId: f.storeId, cardId: f.card.id, customerId: f.bId}});
    const blocker = await reserveTrialCourse(f.manager, {sessionId: f.session.id, customerId: f.bId, trialPrice: 0, requestKey: randomUUID()});
    const first = await joinCourseWaitlist(f.actor, f.input);
    // The second group may join once all seats are occupied; the first remains unreserved.
    await database().courseSession.update({where: {id: f.session.id}, data: {capacity: 1}});
    const bActor = {...f.actor, customerId: f.bId, userId: "member-b", name: "B"};
    // The occupant is only a trial placeholder, so use a separate identity for it.
    await database().courseBooking.update({where: {id: blocker.id}, data: {customerId: null}});
    const bInput = {...f.input, customerIds: [f.bId], companionNames: [], requestKey: randomUUID()};
    const second = await joinCourseWaitlist(bActor, bInput);
    await database().courseWaitlistEntry.updateMany({where: {id: {in: first.rows.map(row => row.id)}}, data: {createdAt: new Date("2030-01-01T00:00:00Z"), updatedAt: new Date("2030-01-01T00:00:00Z")}});
    await database().courseWaitlistEntry.updateMany({where: {id: {in: second.rows.map(row => row.id)}}, data: {createdAt: new Date("2030-01-02T00:00:00Z"), updatedAt: new Date("2030-01-02T00:00:00Z")}});
    await transaction(f.storeId, tx => settleCourseBooking(tx, f.manager, blocker.id, "CANCELLED"));
    await database().courseSession.update({where: {id: f.session.id}, data: {capacity: 3}});
    await setSelfBooking(false);
    const before = await queueSnapshot(f.storeId);
    expect(before.positions.map(group => group.position)).toEqual([1, 2]);
    const cardBefore = await database().coursePointCard.findUniqueOrThrow({where: {id: f.card.id}});
    const ledgerBefore = await database().coursePointEntry.findMany({where: {storeId: f.storeId}});
    const bookingsBefore = await database().courseBooking.findMany({where: {storeId: f.storeId}});
    expect(await transaction(f.storeId, tx => promoteCourseWaitlistForSession(tx, f.storeId, f.session.id))).toEqual([]);
    expect(await queueSnapshot(f.storeId)).toEqual(before);
    expect(await database().coursePointCard.findUniqueOrThrow({where: {id: f.card.id}})).toEqual(cardBefore);
    expect(await database().coursePointEntry.findMany({where: {storeId: f.storeId}})).toEqual(ledgerBefore);
    expect(await database().courseBooking.findMany({where: {storeId: f.storeId}})).toEqual(bookingsBefore);
    expect((await joinCourseWaitlist(bActor, bInput)).position).toBe(2);
    // Existing companion rights survive later sharing changes during a pause.
    await database().coursePointPlan.update({where: {id: f.plan.id}, data: {allowShared: false}});
    await database().$executeRaw`DELETE FROM "StoreFeatureEntitlement" WHERE "storeId"=${f.storeId} AND "featureKey"='shared_card'`;
    const manual = await transaction(f.storeId, tx => promoteCourseWaitlistForSession(tx, f.storeId, f.session.id, {manual: true, ignoreCutoff: true}));
    expect(manual.map(row => row.entryId).sort()).toEqual(first.rows.map(row => row.id).sort());
    const manuallyBooked = await database().courseBooking.findMany({where: {id: {in: manual.map(row => row.bookingId)}}, orderBy: {companionIndex: "asc"}});
    expect(manuallyBooked.map(row => row.customerName).sort()).toEqual(["A", "同行者 1", "朋友"].sort());
    expect(manuallyBooked.every(row => row.reserverCustomerId === f.customerId && row.cardId === f.card.id)).toBe(true);
    expect(await database().courseWaitlistEntry.findUnique({where: {id: second.rows[0].id}})).toEqual(before.rows.find(row => row.id === second.rows[0].id));
    for (const row of manuallyBooked) await transaction(f.storeId, tx => settleCourseBooking(tx, f.manager, row.id, "CANCELLED"));
    await setSelfBooking(true);
    const resumed = await transaction(f.storeId, tx => promoteCourseWaitlistForSession(tx, f.storeId, f.session.id));
    expect(resumed.map(row => row.entryId)).toEqual(second.rows.map(row => row.id));
    const after = await queueSnapshot(f.storeId);
    expect(after.rows.every(row => row.status === "PROMOTED" && row.failureReason === null)).toBe(true);
    expect(after.rows.map(row => ({id: row.id, createdAt: row.createdAt}))).toEqual(before.rows.map(row => ({id: row.id, createdAt: row.createdAt})));
    expect(await database().coursePointCard.findUnique({where: {id: f.card.id}})).toMatchObject({remaining: 10});
    expect(await database().coursePointEntry.count({where: {storeId: f.storeId, kind: {in: ["DEBIT", "REFUND"]}}})).toBe(0);
  });

  it("rejects a manual override without the exact persisted waitlist entry", async () => {
    const f = await queuedFixture();
    const entry = f.waiting.rows[0];
    await setSelfBooking(false);
    const before = await queueSnapshot(f.storeId);
    const input = {sessionId: entry.sessionId, cardId: entry.cardId, customerId: entry.customerId, customerName: entry.customerName, reserverCustomerId: entry.reserverCustomerId!, reserverName: entry.reserverName!, reserverCardId: entry.reserverCardId!, groupKey: entry.groupKey, requestKey: `waitlist-promote:${entry.id}`};
    await expect(transaction(f.storeId, tx => reserveCourseInTransaction(tx, f.actor, input, null, {manualWaitlistPromotion: true}))).rejects.toThrow("人工遞補必須對應原候補紀錄");
    await expect(transaction(f.storeId, tx => reserveCourseInTransaction(tx, f.actor, {...input, customerName: "Different person"}, null, {manualWaitlistPromotion: true, existingWaitlistEntryId: entry.id}))).rejects.toThrow("原同行候補紀錄已變更");
    expect(await queueSnapshot(f.storeId)).toEqual(before);
    expect(await database().courseBooking.count({where: {storeId: f.storeId, status: "RESERVED"}})).toBe(0);
    expect(await database().coursePointEntry.count({where: {storeId: f.storeId}})).toBe(0);
  });

  it("serializes an in-flight student reservation behind the real setting write and observes committed off", async () => {
    const f = await fixture();
    const outcome = await disableBeforeMutation(f.storeId, tx => reserveCourseInTransaction(tx, f.actor, {sessionId: f.session.id, cardId: f.card.id, customerId: f.customerId, requestKey: randomUUID()}, null));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("Student reservation unexpectedly passed after committed off");
    expect(outcome.error).toMatchObject({message: COURSE_SELF_BOOKING_DISABLED_MESSAGE});
    expect(await database().courseBooking.count({where: {storeId: f.storeId}})).toBe(0);
    expect(await database().coursePointEntry.count({where: {storeId: f.storeId}})).toBe(0);
    expect(await database().coursePointCard.findUnique({where: {id: f.card.id}})).toMatchObject({remaining: 10});
  }, 25000);

  it("serializes in-flight automatic promotion behind the real setting write without promoting or skipping the queue", async () => {
    const f = await queuedFixture();
    const before = await queueSnapshot(f.storeId);
    const outcome = await disableBeforeMutation(f.storeId, tx => promoteCourseWaitlistForSession(tx, f.storeId, f.session.id));
    expect(outcome).toEqual({ok: true, value: []});
    expect(await queueSnapshot(f.storeId)).toEqual(before);
    expect(await database().courseBooking.count({where: {storeId: f.storeId, status: "RESERVED"}})).toBe(0);
    expect(await database().coursePointEntry.count({where: {storeId: f.storeId}})).toBe(0);
    expect(await database().coursePointCard.findUnique({where: {id: f.card.id}})).toMatchObject({remaining: 10});
    await setSelfBooking(true);
    expect((await transaction(f.storeId, tx => promoteCourseWaitlistForSession(tx, f.storeId, f.session.id))).map(row => row.entryId)).toEqual(f.waiting.rows.map(row => row.id));
  }, 25000);

});
