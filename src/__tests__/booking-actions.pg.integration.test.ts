import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { resolveBookingIntegrationTestDatabaseUrl } from "@/__tests__/helpers/booking-integration-test-db";

const boundary = vi.hoisted(() => ({
  requireSession: vi.fn(),
  requireWritablePermission: vi.fn(),
  checkMonthlyBookingLimitOrThrow: vi.fn(),
  revalidateBookings: vi.fn(),
  createBookingCreatedEvent: vi.fn(),
  createBookingCompletedEvent: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireSession: boundary.requireSession }));
vi.mock("@/lib/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/permissions")>()),
  requireWritablePermission: boundary.requireWritablePermission,
}));
vi.mock("@/lib/usage-gate", () => ({
  checkMonthlyBookingLimitOrThrow: boundary.checkMonthlyBookingLimitOrThrow,
}));
vi.mock("@/lib/revalidation", () => ({ revalidateBookings: boundary.revalidateBookings }));
vi.mock("@/server/services/referral-events", () => ({
  createBookingCreatedEvent: boundary.createBookingCreatedEvent,
  createBookingCompletedEvent: boundary.createBookingCompletedEvent,
}));

const testDatabaseUrl = resolveBookingIntegrationTestDatabaseUrl(process.env);
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip;

type BookingActions = typeof import("@/server/actions/booking");

describeWithPostgres("booking production actions — real schema PostgreSQL", () => {
  const prisma = testDatabaseUrl ? new PrismaClient({ datasourceUrl: testDatabaseUrl }) : null;
  const db = () => {
    if (!prisma) throw new Error("Booking integration test database is not configured");
    return prisma;
  };
  let actions: Pick<BookingActions, "createBooking" | "updateBooking">;
  const stores = new Set<string>();

  const date = "2099-01-05";
  const dateObj = new Date(`${date}T00:00:00Z`);
  const expiryDate = new Date("2099-12-31T00:00:00Z");

  function uniquePrefix(label: string): string {
    return `bi_${label}_${randomUUID().replaceAll("-", "")}`;
  }

  function admin(storeId: string) {
    const user = {
      id: `admin_${storeId}`,
      role: "ADMIN",
      storeId,
      storeSlug: null,
      staffId: null,
      customerId: null,
      email: null,
    };
    boundary.requireSession.mockResolvedValue(user);
    boundary.requireWritablePermission.mockResolvedValue(user);
  }

  async function createStore(label: string, capacity = 1) {
    const prefix = uniquePrefix(label);
    const storeId = `${prefix}_store`;
    stores.add(storeId);
    await db().store.create({
      data: { id: storeId, name: label, slug: `${prefix}_slug`, plan: "ALLIANCE" },
    });
    await db().shopConfig.create({
      data: { storeId, shopName: label, bookableUntilDate: expiryDate },
    });
    await db().businessHours.create({
      data: {
        storeId,
        dayOfWeek: dateObj.getUTCDay(),
        isOpen: true,
        openTime: "08:00",
        closeTime: "13:00",
        slotInterval: 60,
        defaultCapacity: capacity,
      },
    });
    const plan = await db().servicePlan.create({
      data: {
        id: `${prefix}_plan`,
        storeId,
        name: `${label} plan`,
        category: "PACKAGE",
        price: 1000,
        sessionCount: 10,
        validityDays: 36500,
      },
    });
    admin(storeId);
    return { prefix, storeId, planId: plan.id };
  }

  async function createCustomerWallet(
    base: Awaited<ReturnType<typeof createStore>>,
    label: string,
    options: { remaining?: number; ledger?: number } = {},
  ) {
    const remaining = options.remaining ?? 1;
    const ledger = options.ledger ?? remaining;
    const customer = await db().customer.create({
      data: {
        id: `${base.prefix}_${label}_customer`,
        storeId: base.storeId,
        name: label,
        phone: `${base.prefix}_${label}_phone`,
      },
    });
    const wallet = await db().customerPlanWallet.create({
      data: {
        id: `${base.prefix}_${label}_wallet`,
        customerId: customer.id,
        storeId: base.storeId,
        planId: base.planId,
        purchasedPrice: 1000,
        totalSessions: Math.max(remaining, ledger),
        remainingSessions: remaining,
        startDate: new Date("2098-01-01T00:00:00Z"),
        expiryDate,
      },
    });
    if (ledger > 0) {
      await db().walletSession.createMany({
        data: Array.from({ length: ledger }, (_, index) => ({
          id: `${base.prefix}_${label}_session_${index + 1}`,
          walletId: wallet.id,
          sessionNo: index + 1,
          status: "AVAILABLE" as const,
        })),
      });
    }
    return { customer, wallet };
  }

  function createInput(
    base: Awaited<ReturnType<typeof createStore>>,
    holder: Awaited<ReturnType<typeof createCustomerWallet>>,
    slotTime: string,
    people = 1,
    isMakeup = false,
  ) {
    return {
      customerId: holder.customer.id,
      bookingDate: date,
      slotTime,
      bookingType: "PACKAGE_SESSION" as const,
      servicePlanId: base.planId,
      customerPlanWalletId: holder.wallet.id,
      people,
      isMakeup,
      skipDutyCheck: true,
    };
  }

  async function startTogether<T, U>(left: () => Promise<T>, right: () => Promise<U>) {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const leftRun = (async () => { await gate; return left(); })();
    const rightRun = (async () => { await gate; return right(); })();
    release();
    return Promise.all([leftRun, rightRun] as const);
  }

  async function cleanupTrackedStores() {
    const storeIds = [...stores];
    if (storeIds.length === 0) return;

    const [bookings, customers, wallets, credits] = await Promise.all([
      db().booking.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } }),
      db().customer.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } }),
      db().customerPlanWallet.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } }),
      db().makeupCredit.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } }),
    ]);
    const bookingIds = bookings.map(({ id }) => id);
    const customerIds = customers.map(({ id }) => id);
    const walletIds = wallets.map(({ id }) => id);
    const creditIds = credits.map(({ id }) => id);

    await db().$transaction(async (tx) => {
      await tx.bookingMakeupCredit.deleteMany({ where: { storeId: { in: storeIds } } });
      await tx.messageLog.deleteMany({ where: { storeId: { in: storeIds } } });
      await tx.referralEvent.deleteMany({ where: { storeId: { in: storeIds } } });
      await tx.reminder.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await tx.transactionAuditLog.deleteMany({ where: { storeId: { in: storeIds } } });
      await tx.transaction.deleteMany({ where: { storeId: { in: storeIds } } });
      await tx.walletSession.deleteMany({ where: { walletId: { in: walletIds } } });
      await tx.booking.updateMany({
        where: { id: { in: bookingIds } },
        data: { makeupCreditId: null },
      });
      await tx.makeupCredit.deleteMany({ where: { id: { in: creditIds } } });
      await tx.booking.deleteMany({ where: { id: { in: bookingIds } } });
      await tx.customerPlanWallet.deleteMany({ where: { id: { in: walletIds } } });
      await tx.servicePlan.deleteMany({ where: { storeId: { in: storeIds } } });
      await tx.slotOverride.deleteMany({ where: { storeId: { in: storeIds } } });
      await tx.specialBusinessDay.deleteMany({ where: { storeId: { in: storeIds } } });
      await tx.businessHours.deleteMany({ where: { storeId: { in: storeIds } } });
      await tx.shopConfig.deleteMany({ where: { storeId: { in: storeIds } } });
      await tx.customer.deleteMany({ where: { id: { in: customerIds } } });
      await tx.store.deleteMany({ where: { id: { in: storeIds } } });
    });

    const residualCounts = await Promise.all([
      db().booking.count({ where: { id: { in: bookingIds } } }),
      db().customer.count({ where: { id: { in: customerIds } } }),
      db().store.count({ where: { id: { in: storeIds } } }),
      db().walletSession.count({ where: { walletId: { in: walletIds } } }),
      db().makeupCredit.count({ where: { id: { in: creditIds } } }),
      db().bookingMakeupCredit.count({ where: { storeId: { in: storeIds } } }),
    ]);
    expect(residualCounts).toEqual([0, 0, 0, 0, 0, 0]);
    stores.clear();
  }

  beforeAll(async () => {
    vi.doMock("@/lib/db", () => ({ prisma: db() }));
    actions = await import("@/server/actions/booking");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    boundary.checkMonthlyBookingLimitOrThrow.mockResolvedValue(undefined);
    boundary.createBookingCreatedEvent.mockResolvedValue(undefined);
    boundary.createBookingCompletedEvent.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await cleanupTrackedStores();
  });

  afterAll(async () => {
    await db().$disconnect();
  });

  it("A: serializes two production creates competing for the last seat", async () => {
    const base = await createStore("create-create");
    const a = await createCustomerWallet(base, "a");
    const b = await createCustomerWallet(base, "b");

    const results = await startTogether(
      () => actions.createBooking(createInput(base, a, "10:00")),
      () => actions.createBooking(createInput(base, b, "10:00")),
    );

    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(results.filter((result) => !result.success)).toHaveLength(1);
    const bookings = await db().booking.findMany({ where: { storeId: base.storeId } });
    expect(bookings).toHaveLength(1);
    expect(bookings.reduce((sum, booking) => sum + booking.people, 0)).toBe(1);
    const sessions = await db().walletSession.findMany({
      where: { wallet: { storeId: base.storeId } },
      orderBy: { id: "asc" },
    });
    expect(sessions.filter((session) => session.status === "RESERVED")).toHaveLength(1);
    expect(sessions.find((session) => session.status === "RESERVED")?.bookingId).toBe(bookings[0]?.id);
    expect(sessions.filter((session) => session.status === "AVAILABLE")).toHaveLength(1);
  });

  it("B: serializes production create against production reschedule", async () => {
    const base = await createStore("create-move");
    const a = await createCustomerWallet(base, "a");
    const b = await createCustomerWallet(base, "b");
    const source = await actions.createBooking(createInput(base, a, "09:00"));
    expect(source.success).toBe(true);
    if (!source.success) return;

    const results = await startTogether(
      () => actions.createBooking(createInput(base, b, "10:00")),
      () => actions.updateBooking(source.data.bookingId, { bookingDate: date, slotTime: "10:00" }),
    );
    expect(results.filter((result) => result.success)).toHaveLength(1);
    const target = await db().booking.findMany({
      where: { storeId: base.storeId, bookingDate: dateObj, slotTime: "10:00", bookingStatus: { in: ["PENDING", "CONFIRMED"] } },
    });
    expect(target.reduce((sum, booking) => sum + booking.people, 0)).toBe(1);
    const sourceAfter = await db().booking.findUnique({ where: { id: source.data.bookingId } });
    if (!results[1].success) {
      expect(sourceAfter?.bookingDate).toEqual(dateObj);
      expect(sourceAfter?.slotTime).toBe("09:00");
      expect(sourceAfter?.people).toBe(1);
    }
    const aSession = await db().walletSession.findFirst({ where: { walletId: a.wallet.id } });
    expect(aSession?.bookingId).toBe(source.data.bookingId);
    const bSession = await db().walletSession.findFirst({ where: { walletId: b.wallet.id } });
    expect(bSession?.status).toBe(results[0].success ? "RESERVED" : "AVAILABLE");
  });

  it("C: serializes two production reschedules competing for the last seat", async () => {
    const base = await createStore("move-move");
    const a = await createCustomerWallet(base, "a");
    const b = await createCustomerWallet(base, "b");
    const sourceA = await actions.createBooking(createInput(base, a, "09:00"));
    const sourceB = await actions.createBooking(createInput(base, b, "11:00"));
    expect(sourceA.success && sourceB.success).toBe(true);
    if (!sourceA.success || !sourceB.success) return;

    const results = await startTogether(
      () => actions.updateBooking(sourceA.data.bookingId, { slotTime: "10:00" }),
      () => actions.updateBooking(sourceB.data.bookingId, { slotTime: "10:00" }),
    );
    expect(results.filter((result) => result.success)).toHaveLength(1);
    const bookings = await db().booking.findMany({
      where: { id: { in: [sourceA.data.bookingId, sourceB.data.bookingId] } },
      orderBy: { id: "asc" },
    });
    expect(bookings.filter((booking) => booking.slotTime === "10:00")).toHaveLength(1);
    expect(bookings.map((booking) => booking.slotTime).sort()).toEqual(expect.arrayContaining(["10:00"]));
    const sessions = await db().walletSession.findMany({ where: { wallet: { storeId: base.storeId } } });
    expect(sessions).toHaveLength(2);
    expect(new Set(sessions.map((session) => session.bookingId))).toEqual(
      new Set([sourceA.data.bookingId, sourceB.data.bookingId]),
    );
  });

  it("D: rolls back Booking, makeup links, credit state, wallet ledger, and cached counter", async () => {
    const base = await createStore("rollback", 4);
    const holder = await createCustomerWallet(base, "holder", { remaining: 2, ledger: 1 });
    const original = await db().booking.create({
      data: {
        id: `${base.prefix}_original`,
        storeId: base.storeId,
        customerId: holder.customer.id,
        bookingDate: new Date("2098-12-01T00:00:00Z"),
        slotTime: "10:00",
        bookingType: "PACKAGE_SESSION",
        bookingStatus: "NO_SHOW",
        people: 1,
      },
    });
    const credit = await db().makeupCredit.create({
      data: {
        id: `${base.prefix}_credit`,
        storeId: base.storeId,
        customerId: holder.customer.id,
        originalBookingId: original.id,
        expiredAt: expiryDate,
      },
    });
    boundary.createBookingCreatedEvent.mockClear();

    const result = await actions.createBooking(createInput(base, holder, "10:00", 3, true));
    expect(result.success).toBe(false);
    expect(await db().booking.count({ where: { storeId: base.storeId, id: { not: original.id } } })).toBe(0);
    expect(await db().bookingMakeupCredit.count({ where: { storeId: base.storeId } })).toBe(0);
    const creditAfter = await db().makeupCredit.findUnique({ where: { id: credit.id } });
    expect(creditAfter?.isUsed).toBe(false);
    const session = await db().walletSession.findFirst({ where: { walletId: holder.wallet.id } });
    expect(session?.status).toBe("AVAILABLE");
    expect(session?.bookingId).toBeNull();
    const wallet = await db().customerPlanWallet.findUnique({ where: { id: holder.wallet.id } });
    expect(wallet?.remainingSessions).toBe(2);
    expect(boundary.createBookingCreatedEvent).not.toHaveBeenCalled();
  });

  it("E: enforces canonical duplicate scope and permits cancelled rebooking", async () => {
    const pendingBase = await createStore("duplicate-pending");
    const pending = await createCustomerWallet(pendingBase, "holder", { remaining: 2, ledger: 2 });
    expect((await actions.createBooking(createInput(pendingBase, pending, "10:00"))).success).toBe(true);
    const duplicate = await actions.createBooking(createInput(pendingBase, pending, "10:00"));
    expect(duplicate.success).toBe(false);

    const legacyBase = await createStore("duplicate-legacy");
    const legacy = await createCustomerWallet(legacyBase, "holder");
    await db().booking.create({
      data: {
        storeId: legacyBase.storeId,
        customerId: legacy.customer.id,
        bookingDate: dateObj,
        slotTime: "10:00:00",
        bookingType: "PACKAGE_SESSION",
        bookingStatus: "PENDING",
        people: 1,
      },
    });
    expect((await actions.createBooking(createInput(legacyBase, legacy, "10:00"))).success).toBe(false);

    const cancelledBase = await createStore("duplicate-cancelled");
    const cancelled = await createCustomerWallet(cancelledBase, "holder", { remaining: 2, ledger: 2 });
    const first = await actions.createBooking(createInput(cancelledBase, cancelled, "10:00"));
    expect(first.success).toBe(true);
    if (first.success) {
      await db().$transaction([
        db().booking.update({ where: { id: first.data.bookingId }, data: { bookingStatus: "CANCELLED" } }),
        db().walletSession.updateMany({
          where: { bookingId: first.data.bookingId },
          data: { status: "AVAILABLE", bookingId: null, reservedAt: null },
        }),
      ]);
    }
    expect((await actions.createBooking(createInput(cancelledBase, cancelled, "10:00"))).success).toBe(true);

    const scopedBase = await createStore("duplicate-scopes");
    const scoped = await createCustomerWallet(scopedBase, "holder", { remaining: 4, ledger: 4 });
    const otherStore = await createStore("duplicate-other-store");
    admin(scopedBase.storeId);
    await db().booking.createMany({
      data: [
        { storeId: otherStore.storeId, customerId: scoped.customer.id, bookingDate: dateObj, slotTime: "10:00", bookingType: "PACKAGE_SESSION", bookingStatus: "PENDING", people: 1 },
        { storeId: scopedBase.storeId, customerId: scoped.customer.id, bookingDate: new Date("2099-01-06T00:00:00Z"), slotTime: "10:00", bookingType: "PACKAGE_SESSION", bookingStatus: "PENDING", people: 1 },
        { storeId: scopedBase.storeId, customerId: scoped.customer.id, bookingDate: dateObj, slotTime: "11:00", bookingType: "PACKAGE_SESSION", bookingStatus: "PENDING", people: 1 },
      ],
    });
    expect((await actions.createBooking(createInput(scopedBase, scoped, "10:00"))).success).toBe(true);
  });
});
