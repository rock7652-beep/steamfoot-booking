import { beforeEach, describe, expect, it, vi } from "vitest";

const CUSTOMER_ID = "cust-taichung";
const STAFF_ID = "staff-taichung";
const USER_ID = "user-admin";
const WALLET_ID = "wallet-taichung";
const PLAN_ID = "plan-taichung";

const h = vi.hoisted(() => ({
  requireSession: vi.fn(),
  checkBookingLimit: vi.fn(),
  checkMonthlyBookingLimitOrThrow: vi.fn(),
  getStoreOperatingStatus: vi.fn(),
  isStoreBookableStatus: vi.fn(),
  shopConfigFindUnique: vi.fn(),
  customerFindUnique: vi.fn(),
  servicePlanFindUnique: vi.fn(),
  makeupCreditCount: vi.fn(),
  bookingCount: vi.fn(),
  bookingAggregate: vi.fn(),
  bookingFindFirst: vi.fn(),
  bookingCreate: vi.fn(),
  txQueryRaw: vi.fn(),
  txRun: vi.fn(),
  createBookingCreatedEvent: vi.fn(),
  revalidateBookings: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    shopConfig: { findUnique: h.shopConfigFindUnique },
    customer: { findUnique: h.customerFindUnique },
    servicePlan: { findUnique: h.servicePlanFindUnique },
    makeupCredit: { count: h.makeupCreditCount },
    booking: {
      count: h.bookingCount,
      aggregate: h.bookingAggregate,
      create: h.bookingCreate,
    },
    $transaction: h.txRun,
  },
}));
vi.mock("@/lib/session", () => ({ requireSession: h.requireSession }));
vi.mock("@/lib/store", () => ({
  currentStoreId: (u: { storeId?: string | null }) => u.storeId ?? "store-taichung",
}));
vi.mock("@/lib/date-utils", () => ({
  getNowTaipeiHHmm: () => "00:00",
  toLocalDateStr: () => "2026-07-10",
  dayRange: (date: string) => ({ start: new Date(`${date}T00:00:00.000Z`) }),
}));
vi.mock("@/lib/shop-config", () => ({
  checkBookingLimit: h.checkBookingLimit,
  resolveBookableUntilDate: () => "2026-12-31",
}));
vi.mock("@/lib/usage-gate", () => ({
  checkMonthlyBookingLimitOrThrow: h.checkMonthlyBookingLimitOrThrow,
}));
vi.mock("@/lib/subscription-guard", () => ({
  assertStoreSubscriptionWritable: vi.fn(async () => undefined),
  BOOKING_EXPIRED_MESSAGE: "expired",
}));
vi.mock("@/lib/business-hours-resolver", () => ({
  loadDayBusinessHoursContext: vi.fn(async () => ({
    rule: { closed: false, openTime: "09:00", closeTime: "18:00" },
    slotOverrides: [],
  })),
  applySlotOverrides: vi.fn(() => [
    { startTime: "10:00", isEnabled: true, capacity: 4 },
  ]),
}));
vi.mock("@/lib/manager-visibility", () => ({ assertStoreAccess: vi.fn() }));
vi.mock("@/lib/store-operating-status", () => ({
  getStoreOperatingStatus: h.getStoreOperatingStatus,
  getStoreUnavailableMessage: vi.fn(() => "closed"),
  isStoreBookableStatus: h.isStoreBookableStatus,
}));
vi.mock("@/server/services/referral-events", () => ({
  createBookingCreatedEvent: h.createBookingCreatedEvent,
  createBookingCompletedEvent: vi.fn(),
}));
vi.mock("@/server/services/referral-points", () => ({
  awardFirstBookingReferralPointsIfEligible: vi.fn(),
}));
vi.mock("@/server/services/wallet-session", () => ({
  allocateSessionsFefo: vi.fn(),
  releaseSessions: vi.fn(),
  partialReleaseSessions: vi.fn(),
  completeSessions: vi.fn(),
  uncompleteSessions: vi.fn(),
  reReserveSessionsFefo: vi.fn(),
}));
vi.mock("@/lib/revalidation", () => ({ revalidateBookings: h.revalidateBookings }));

function customer(storeId = "store-taichung", walletStoreId = "store-taichung") {
  return {
    id: CUSTOMER_ID,
    storeId,
    assignedStaffId: STAFF_ID,
    sponsorId: null,
    planWallets: [
      {
        id: WALLET_ID,
        storeId: walletStoreId,
        remainingSessions: 10,
        expiryDate: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireSession.mockResolvedValue({
    id: USER_ID,
    role: "ADMIN",
    storeId: "store-taichung",
    staffId: null,
  });
  h.checkBookingLimit.mockResolvedValue({ allowed: true, limit: 999 });
  h.checkMonthlyBookingLimitOrThrow.mockResolvedValue(undefined);
  h.getStoreOperatingStatus.mockResolvedValue("OPEN");
  h.isStoreBookableStatus.mockReturnValue(true);
  h.shopConfigFindUnique.mockResolvedValue({ bookableUntilDate: null });
  h.customerFindUnique.mockResolvedValue(customer());
  h.servicePlanFindUnique.mockResolvedValue({ id: PLAN_ID, storeId: "store-taichung" });
  h.makeupCreditCount.mockResolvedValue(0);
  h.bookingCount.mockResolvedValue(0);
  h.bookingAggregate.mockResolvedValue({ _sum: { people: 0 } });
  h.bookingFindFirst.mockResolvedValue(null);
  h.txQueryRaw.mockResolvedValue([{ acquired: 1 }]);
  h.bookingCreate.mockResolvedValue({
    id: "booking-created",
    customerId: CUSTOMER_ID,
    storeId: "store-taichung",
  });
  h.txRun.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      $queryRaw: h.txQueryRaw,
      booking: {
        aggregate: h.bookingAggregate,
        findFirst: h.bookingFindFirst,
        create: h.bookingCreate,
        update: vi.fn(),
      },
      bookingMakeupCredit: { createMany: vi.fn() },
    }),
  );
  h.createBookingCreatedEvent.mockResolvedValue(undefined);
});

describe("createBooking — store consistency", () => {
  it("allows same-store staff/admin single booking", async () => {
    const { createBooking } = await import("@/server/actions/booking");
    const result = await createBooking({
      customerId: CUSTOMER_ID,
      bookingDate: "2026-07-11",
      slotTime: "10:00",
      bookingType: "SINGLE",
      skipDutyCheck: true,
    });

    expect(result.success).toBe(true);
    expect(h.bookingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: CUSTOMER_ID,
          storeId: "store-taichung",
          bookingType: "SINGLE",
        }),
      }),
    );
  });

  it("rejects Taichung booking + Zhubei customer before insert", async () => {
    h.customerFindUnique.mockResolvedValueOnce(customer("store-zhubei"));
    const { createBooking } = await import("@/server/actions/booking");
    const result = await createBooking({
      customerId: CUSTOMER_ID,
      bookingDate: "2026-07-11",
      slotTime: "10:00",
      bookingType: "SINGLE",
      skipDutyCheck: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("STORE_CONSISTENCY_MISMATCH");
    expect(h.bookingCreate).not.toHaveBeenCalled();
  });

  it("rejects cross-store service plan before insert", async () => {
    h.servicePlanFindUnique.mockResolvedValueOnce({ id: PLAN_ID, storeId: "store-zhubei" });
    const { createBooking } = await import("@/server/actions/booking");
    const result = await createBooking({
      customerId: CUSTOMER_ID,
      bookingDate: "2026-07-11",
      slotTime: "10:00",
      bookingType: "SINGLE",
      servicePlanId: PLAN_ID,
      skipDutyCheck: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("STORE_CONSISTENCY_MISMATCH");
    expect(h.bookingCreate).not.toHaveBeenCalled();
  });

  it("rejects cross-store customer wallet before insert", async () => {
    h.customerFindUnique.mockResolvedValueOnce(customer("store-taichung", "store-zhubei"));
    const { createBooking } = await import("@/server/actions/booking");
    const result = await createBooking({
      customerId: CUSTOMER_ID,
      bookingDate: "2026-07-11",
      slotTime: "10:00",
      bookingType: "PACKAGE_SESSION",
      customerPlanWalletId: WALLET_ID,
      skipDutyCheck: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("STORE_CONSISTENCY_MISMATCH");
    expect(h.bookingCreate).not.toHaveBeenCalled();
  });
});
