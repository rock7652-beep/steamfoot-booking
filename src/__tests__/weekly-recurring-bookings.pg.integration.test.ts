import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { resolveBookingIntegrationTestDatabaseUrl } from "@/__tests__/helpers/booking-integration-test-db";

const boundary = vi.hoisted(() => ({
  requireSession: vi.fn(),
  requireWritablePermission: vi.fn(),
  revalidateBookings: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireSession: boundary.requireSession }));
vi.mock("@/lib/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/permissions")>()),
  requireWritablePermission: boundary.requireWritablePermission,
}));
vi.mock("@/lib/revalidation", () => ({ revalidateBookings: boundary.revalidateBookings }));

const testDatabaseUrl = resolveBookingIntegrationTestDatabaseUrl(process.env);
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip;

describeWithPostgres("weekly recurring bookings — real PostgreSQL", () => {
  const prisma = testDatabaseUrl ? new PrismaClient({ datasourceUrl: testDatabaseUrl }) : null;
  const db = () => {
    if (!prisma) throw new Error("Booking integration test database is not configured");
    return prisma;
  };
  const stores = new Set<string>();
  let createRecurringBookings: typeof import("@/server/actions/recurring-booking").createRecurringBookings;
  const startDate = "2099-01-07";

  function key(label: string) {
    return `recurring_${label}_${randomUUID().replaceAll("-", "")}`;
  }

  async function fixture(options: { capacity?: number; sessions?: number; expiry?: string; weeks?: number } = {}) {
    const prefix = key("fixture");
    const storeId = `${prefix}_store`;
    stores.add(storeId);
    const weeks = options.weeks ?? 2;
    await db().store.create({ data: { id: storeId, name: prefix, slug: `${prefix}_slug`, plan: "ALLIANCE" } });
    await db().shopConfig.create({ data: {
      storeId,
      weeklyRecurrenceEnabled: true,
      weeklyRecurrenceMaxWeeks: 12,
      bookableUntilDate: new Date("2099-12-31T00:00:00Z"),
    } });
    await db().businessHours.create({ data: {
      storeId,
      dayOfWeek: new Date(`${startDate}T00:00:00Z`).getUTCDay(),
      isOpen: true,
      openTime: "09:00",
      closeTime: "12:00",
      slotInterval: 60,
      defaultCapacity: options.capacity ?? 4,
    } });
    const plan = await db().servicePlan.create({ data: {
      id: `${prefix}_plan`, storeId, name: `${prefix} plan`, category: "PACKAGE",
      price: 1000, sessionCount: 20, validityDays: 36500,
    } });
    const customer = await db().customer.create({ data: {
      id: `${prefix}_customer`, storeId, name: prefix, phone: `${prefix}_phone`,
    } });
    const count = options.sessions ?? weeks;
    const wallet = await db().customerPlanWallet.create({ data: {
      id: `${prefix}_wallet`, customerId: customer.id, storeId, planId: plan.id,
      purchasedPrice: 1000, totalSessions: count, remainingSessions: count,
      startDate: new Date("2098-01-01T00:00:00Z"),
      expiryDate: new Date(`${options.expiry ?? "2099-12-31"}T00:00:00Z`),
    } });
    await db().walletSession.createMany({ data: Array.from({ length: count }, (_, index) => ({
      id: `${prefix}_session_${index + 1}`, walletId: wallet.id, sessionNo: index + 1,
    })) });
    const user = { id: `${prefix}_admin`, role: "ADMIN", storeId, storeSlug: null, staffId: null, customerId: null, email: null };
    boundary.requireSession.mockResolvedValue(user);
    boundary.requireWritablePermission.mockResolvedValue(user);
    return { storeId, plan, customer, wallet, weeks };
  }

  function input(f: Awaited<ReturnType<typeof fixture>>, extra: Record<string, unknown> = {}) {
    return {
      customerId: f.customer.id,
      bookingDate: startDate,
      slotTime: "10:00",
      bookingType: "PACKAGE_SESSION" as const,
      servicePlanId: f.plan.id,
      customerPlanWalletId: f.wallet.id,
      people: 1,
      weeks: f.weeks,
      skipDutyCheck: true,
      ...extra,
    };
  }

  async function cleanup() {
    const storeIds = [...stores];
    if (storeIds.length === 0) return;
    const wallets = await db().customerPlanWallet.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } });
    await db().bookingSubmission.deleteMany({ where: { storeId: { in: storeIds } } });
    await db().walletSession.deleteMany({ where: { walletId: { in: wallets.map((wallet) => wallet.id) } } });
    await db().booking.deleteMany({ where: { storeId: { in: storeIds } } });
    await db().bookingRecurrenceGroup.deleteMany({ where: { storeId: { in: storeIds } } });
    await db().customerPlanWallet.deleteMany({ where: { storeId: { in: storeIds } } });
    await db().servicePlan.deleteMany({ where: { storeId: { in: storeIds } } });
    await db().slotOverride.deleteMany({ where: { storeId: { in: storeIds } } });
    await db().specialBusinessDay.deleteMany({ where: { storeId: { in: storeIds } } });
    await db().businessHours.deleteMany({ where: { storeId: { in: storeIds } } });
    await db().shopConfig.deleteMany({ where: { storeId: { in: storeIds } } });
    await db().customer.deleteMany({ where: { storeId: { in: storeIds } } });
    await db().store.deleteMany({ where: { id: { in: storeIds } } });
    const residual = await Promise.all([
      db().store.count({ where: { id: { in: storeIds } } }),
      db().booking.count({ where: { storeId: { in: storeIds } } }),
      db().bookingRecurrenceGroup.count({ where: { storeId: { in: storeIds } } }),
      db().bookingSubmission.count({ where: { storeId: { in: storeIds } } }),
    ]);
    expect(residual).toEqual([0, 0, 0, 0]);
    stores.clear();
  }

  beforeAll(async () => {
    vi.doMock("@/lib/db", () => ({ prisma: db() }));
    ({ createRecurringBookings } = await import("@/server/actions/recurring-booking"));
  });
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);
  afterAll(async () => db().$disconnect());

  it("creates N bookings and N × people reserved WalletSessions atomically", async () => {
    const f = await fixture({ weeks: 5, sessions: 10 });
    const result = await createRecurringBookings(input(f, { people: 2 }), { requestKey: key("success"), source: "pg-test" });
    expect(result.success).toBe(true);
    const bookings = await db().booking.findMany({ where: { storeId: f.storeId }, orderBy: { recurrenceIndex: "asc" } });
    expect(bookings.map((booking) => booking.recurrenceIndex)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(bookings.map((booking) => booking.recurrenceGroupId)).size).toBe(1);
    expect(await db().walletSession.count({ where: { walletId: f.wallet.id, status: "RESERVED" } })).toBe(10);
  });

  it.each(["closed", "disabled", "capacity"])("rolls the whole group back when a later week is %s", async (failure) => {
    const f = await fixture({ weeks: 2, sessions: 2, capacity: failure === "capacity" ? 1 : 4 });
    const secondDate = new Date("2099-01-14T00:00:00Z");
    if (failure === "closed") await db().specialBusinessDay.create({ data: { storeId: f.storeId, date: secondDate, type: "closed" } });
    if (failure === "disabled") await db().slotOverride.create({ data: { storeId: f.storeId, date: secondDate, startTime: "10:00", type: "disabled" } });
    if (failure === "capacity") {
      const other = await db().customer.create({ data: { storeId: f.storeId, name: "other", phone: key("phone") } });
      await db().booking.create({ data: { storeId: f.storeId, customerId: other.id, bookingDate: secondDate, slotTime: "10:00", people: 1 } });
    }
    const result = await createRecurringBookings(input(f), { requestKey: key(failure), source: "pg-test" });
    expect(result.success).toBe(false);
    expect(await db().bookingRecurrenceGroup.count({ where: { storeId: f.storeId } })).toBe(0);
    const ownBookings = await db().booking.count({ where: { customerId: f.customer.id } });
    expect(ownBookings).toBe(0);
    expect(await db().walletSession.count({ where: { walletId: f.wallet.id, status: "RESERVED" } })).toBe(0);
  });

  it.each([
    ["insufficient sessions", { weeks: 2, sessions: 1 }, {}],
    ["wallet expiry", { weeks: 2, sessions: 2, expiry: "2099-01-10" }, {}],
  ])("rejects %s with zero group/bookings", async (_label, options, extra) => {
    const f = await fixture(options);
    expect((await createRecurringBookings(input(f, extra), { requestKey: key("invalid"), source: "pg-test" })).success).toBe(false);
    expect(await db().booking.count({ where: { storeId: f.storeId } })).toBe(0);
    expect(await db().bookingRecurrenceGroup.count({ where: { storeId: f.storeId } })).toBe(0);
  });

  it.each(["feature disabled", "bookable until", "no duty"])("rejects %s with zero group/bookings", async (failure) => {
    const f = await fixture({ weeks: 2, sessions: 2 });
    await db().shopConfig.update({
      where: { storeId: f.storeId },
      data: failure === "feature disabled"
        ? { weeklyRecurrenceEnabled: false }
        : failure === "bookable until"
          ? { bookableUntilDate: new Date(`${startDate}T00:00:00Z`) }
          : { dutySchedulingEnabled: true },
    });
    const result = await createRecurringBookings(
      input(f, failure === "no duty" ? { skipDutyCheck: false } : {}),
      { requestKey: key("gate"), source: "pg-test" },
    );
    expect(result.success).toBe(false);
    expect(await db().booking.count({ where: { storeId: f.storeId } })).toBe(0);
    expect(await db().bookingRecurrenceGroup.count({ where: { storeId: f.storeId } })).toBe(0);
  });

  it("replays the same payload and rejects a different payload for the same requestKey", async () => {
    const f = await fixture({ weeks: 2, sessions: 3 });
    const requestKey = key("replay");
    const first = await createRecurringBookings(input(f), { requestKey, source: "pg-test" });
    const replay = await createRecurringBookings(input(f), { requestKey, source: "pg-test" });
    expect(replay).toEqual(first);
    const conflict = await createRecurringBookings(input(f, { weeks: 1 }), { requestKey, source: "pg-test" });
    expect(conflict.success).toBe(false);
    expect(await db().bookingRecurrenceGroup.count({ where: { storeId: f.storeId } })).toBe(1);
    expect(await db().booking.count({ where: { storeId: f.storeId } })).toBe(2);
  });

  it("allows only one group when two parallel calls use the same requestKey", async () => {
    const f = await fixture({ weeks: 2, sessions: 2 });
    const requestKey = key("parallel-same-key");
    const results = await Promise.all([
      createRecurringBookings(input(f), { requestKey, source: "pg-test" }),
      createRecurringBookings(input(f), { requestKey, source: "pg-test" }),
    ]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(await db().bookingRecurrenceGroup.count({ where: { storeId: f.storeId } })).toBe(1);
    expect(await db().booking.count({ where: { storeId: f.storeId } })).toBe(2);
  });

  it("does not oversell when two recurring groups compete for the last capacity", async () => {
    const f = await fixture({ weeks: 1, sessions: 2, capacity: 1 });
    const results = await Promise.all([
      createRecurringBookings(input(f), { requestKey: key("capacity-a"), source: "pg-test" }),
      createRecurringBookings(input(f), { requestKey: key("capacity-b"), source: "pg-test" }),
    ]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(await db().bookingRecurrenceGroup.count({ where: { storeId: f.storeId } })).toBe(1);
    expect(await db().booking.count({ where: { storeId: f.storeId } })).toBe(1);
    expect(await db().walletSession.count({ where: { walletId: f.wallet.id, status: "RESERVED" } })).toBe(1);
  });
});
