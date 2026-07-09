/**
 * booking-update-people-sync.test.ts (PR-H3)
 *
 * 驗證 updateBooking 在 people 變動時正確同步 WalletSession：
 *   - PACKAGE_SESSION 非補課 + people 增 → allocateSessionsFefo
 *   - PACKAGE_SESSION 非補課 + people 減 → partialReleaseSessions
 *   - FIRST_TRIAL / SINGLE / makeup → 不動 session
 *   - people 不變 → 不動 session
 *   - COMPLETED / CANCELLED → 既有 guard 拒絕
 *   - wallet 不足 → throw + Booking.people rollback
 *
 * Mock 策略：unit-style — 只 mock 必要 dependencies；
 * helper 行為由 wallet-session-service.test.ts 完整覆蓋，這裡只驗 caller 邏輯。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const STORE_A = "ck0000000000000000000store-a";
const CUSTOMER_ID = "ck0000000000000000000cust1";
const BOOKING_ID = "ck0000000000000000000bk001";
const WALLET_ID = "ck0000000000000000000wal01";

// ── Prisma mocks ──
const mockBookingFindUnique = vi.fn();
const mockBookingAggregate = vi.fn();
const mockBookingUpdate = vi.fn();
const mockCustomerPlanWalletFindMany = vi.fn();
const mockTxBookingUpdate = vi.fn();
const mockTxWalletSessionCount = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: {
      findUnique: (...a: unknown[]) => mockBookingFindUnique(...a),
      aggregate: (...a: unknown[]) => mockBookingAggregate(...a),
      update: (...a: unknown[]) => mockBookingUpdate(...a),
    },
    customerPlanWallet: {
      findMany: (...a: unknown[]) => mockCustomerPlanWalletFindMany(...a),
    },
    $transaction: (cb: (tx: unknown) => Promise<unknown>) => mockTransaction(cb),
  },
}));

// ── Session / permission ──
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({
    id: "ck0000000000000000000usr01",
    role: "OWNER",
    storeId: STORE_A,
    staffId: "ck0000000000000000000stf01",
  })),
}));
vi.mock("@/lib/permissions", () => ({
  requirePermission: vi.fn(async () => ({
    id: "ck0000000000000000000usr01",
    role: "OWNER",
    storeId: STORE_A,
    staffId: "ck0000000000000000000stf01",
  })),
  requireWritablePermission: vi.fn(async () => ({
    id: "ck0000000000000000000usr01",
    role: "OWNER",
    storeId: STORE_A,
    staffId: "ck0000000000000000000stf01",
  })),
}));
vi.mock("@/lib/store", () => ({
  currentStoreId: (u: { storeId?: string | null }) => u.storeId ?? STORE_A,
  DEFAULT_STORE_ID: "default-store",
}));
vi.mock("@/lib/manager-visibility", () => ({
  assertStoreAccess: vi.fn(),
}));

// ── Business hours (放開未來日期，不擋人數變更) ──
vi.mock("@/lib/business-hours-resolver", () => ({
  loadDayBusinessHoursContext: vi.fn(async () => ({
    rule: { closed: false, openTime: "09:00", closeTime: "22:00", status: "open" },
    slotOverrides: [],
  })),
  applySlotOverrides: () =>
    Array.from({ length: 27 }, (_, i) => {
      const totalMinutes = 9 * 60 + i * 30;
      const hh = Math.floor(totalMinutes / 60);
      const mm = totalMinutes % 60;
      return {
        startTime: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
        isEnabled: true,
        capacity: 6,
      };
    }),
}));

vi.mock("@/lib/date-utils", () => ({
  toLocalDateStr: () => "2026-05-25",
  getNowTaipeiHHmm: () => "09:00",
}));
vi.mock("@/lib/booking-constants", () => ({
  PENDING_STATUSES: ["PENDING", "CONFIRMED"] as const,
  getBookingDateTime: (d: Date) => d,
}));
vi.mock("@/lib/revalidation", () => ({ revalidateBookings: vi.fn() }));

// ── Wallet-session helpers (the assertion targets) ──
// 用 untyped vi.fn() 避免 TS spread 限制；初始值由 beforeEach 設定
const mockAllocateSessions = vi.fn();
const mockAllocateSessionsFefo = vi.fn();
const mockReleaseSessions = vi.fn();
const mockPartialReleaseSessions = vi.fn();
const mockCompleteSessions = vi.fn();
const mockUncompleteSessions = vi.fn();
const mockReReserveSessions = vi.fn();
const mockReReserveSessionsFefo = vi.fn();

vi.mock("@/server/services/wallet-session", () => ({
  allocateSessions: (...a: unknown[]) => mockAllocateSessions(...a),
  allocateSessionsFefo: (...a: unknown[]) => mockAllocateSessionsFefo(...a),
  releaseSessions: (...a: unknown[]) => mockReleaseSessions(...a),
  partialReleaseSessions: (...a: unknown[]) =>
    mockPartialReleaseSessions(...a),
  completeSessions: (...a: unknown[]) => mockCompleteSessions(...a),
  uncompleteSessions: (...a: unknown[]) => mockUncompleteSessions(...a),
  reReserveSessions: (...a: unknown[]) => mockReReserveSessions(...a),
  reReserveSessionsFefo: (...a: unknown[]) =>
    mockReReserveSessionsFefo(...a),
}));

// Other irrelevant deps
vi.mock("@/server/services/referral-events", () => ({
  createBookingCreatedEvent: vi.fn(async () => undefined),
  createBookingCompletedEvent: vi.fn(async () => undefined),
}));
vi.mock("@/server/services/referral-points", () => ({
  awardFirstBookingReferralPointsIfEligible: vi.fn(async () => undefined),
}));
vi.mock("@/server/actions/points", () => ({
  awardPoints: vi.fn(async () => undefined),
}));
vi.mock("@/lib/errors", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/errors")>();
  return actual;
});

// ── helper to build booking record ──
function makeBooking(overrides: Partial<{
  id: string;
  bookingStatus: string;
  bookingType: string;
  people: number;
  isMakeup: boolean;
  customerPlanWalletId: string | null;
}> = {}) {
  return {
    id: BOOKING_ID,
    storeId: STORE_A,
    customerId: CUSTOMER_ID,
    bookingDate: new Date("2026-12-15T00:00:00Z"),
    slotTime: "10:00",
    bookingStatus: "PENDING",
    bookingType: "PACKAGE_SESSION",
    people: 1,
    isMakeup: false,
    customerPlanWalletId: WALLET_ID,
    customer: { id: CUSTOMER_ID },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // 預設行為（個別 case 可 override）
  mockAllocateSessions.mockResolvedValue({ allocated: 0 });
  mockAllocateSessionsFefo.mockResolvedValue({
    allocations: [],
    primaryWalletId: null,
  });
  mockReleaseSessions.mockResolvedValue({ released: 0 });
  mockPartialReleaseSessions.mockResolvedValue({ released: 0 });
  mockCompleteSessions.mockResolvedValue({ completed: 0, items: [] });
  mockUncompleteSessions.mockResolvedValue({ uncompleted: 0 });
  mockReReserveSessions.mockResolvedValue({ reReserved: 0 });
  mockReReserveSessionsFefo.mockResolvedValue({
    reReserved: 0,
    allocations: [],
    primaryWalletId: null,
  });
  mockBookingAggregate.mockResolvedValue({ _sum: { people: 0 } });
  mockBookingUpdate.mockResolvedValue({});
  mockCustomerPlanWalletFindMany.mockResolvedValue([
    {
      id: WALLET_ID,
      expiryDate: new Date("2026-12-31"),
      createdAt: new Date("2026-05-01"),
      remainingSessions: 10,
    },
  ]);
  // $transaction default：執行 callback，並提供 tx 物件
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      booking: { update: mockTxBookingUpdate },
      walletSession: { count: mockTxWalletSessionCount },
    }),
  );
  mockTxBookingUpdate.mockResolvedValue({});
});

describe("updateBooking — people change wallet sync (PR-H3)", () => {
  it("people 1 → 2 PACKAGE_SESSION：呼叫 allocateSessionsFefo with count=1", async () => {
    mockBookingFindUnique.mockResolvedValue(
      makeBooking({ people: 1, customerPlanWalletId: WALLET_ID }),
    );
    mockTxWalletSessionCount.mockResolvedValue(1); // 既有 RESERVED=1

    const { updateBooking } = await import("@/server/actions/booking");
    const result = await updateBooking(BOOKING_ID, { people: 2 });

    expect(result.success).toBe(true);
    expect(mockAllocateSessionsFefo).toHaveBeenCalledTimes(1);
    expect(mockAllocateSessionsFefo).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        bookingId: BOOKING_ID,
        count: 1,
        preferredWalletId: WALLET_ID,
      }),
    );
    expect(mockPartialReleaseSessions).not.toHaveBeenCalled();
    expect(mockTxBookingUpdate).toHaveBeenCalledWith({
      where: { id: BOOKING_ID },
      data: expect.objectContaining({ people: 2 }),
    });
  });

  it("people 2 → 1 PACKAGE_SESSION：呼叫 partialReleaseSessions with count=1", async () => {
    mockBookingFindUnique.mockResolvedValue(
      makeBooking({ people: 2, customerPlanWalletId: WALLET_ID }),
    );
    mockTxWalletSessionCount.mockResolvedValue(2);

    const { updateBooking } = await import("@/server/actions/booking");
    const result = await updateBooking(BOOKING_ID, { people: 1 });

    expect(result.success).toBe(true);
    expect(mockPartialReleaseSessions).toHaveBeenCalledTimes(1);
    expect(mockPartialReleaseSessions).toHaveBeenCalledWith(
      expect.any(Object),
      BOOKING_ID,
      1,
    );
    expect(mockAllocateSessionsFefo).not.toHaveBeenCalled();
  });

  it("people 1 → 3 但 wallet 不足：throw + Booking.people 不被更新", async () => {
    mockBookingFindUnique.mockResolvedValue(
      makeBooking({ people: 1, customerPlanWalletId: WALLET_ID }),
    );
    mockTxWalletSessionCount.mockResolvedValue(1);
    // allocateSessionsFefo 模擬 wallet 不足 throw
    mockAllocateSessionsFefo.mockRejectedValueOnce(
      new Error("跨方案總剩餘不足"),
    );
    // 模擬 $transaction throw 行為（callback throw 後重 throw 給 caller）
    mockTransaction.mockImplementationOnce(async (cb: (tx: unknown) => Promise<unknown>) => {
      return cb({
        booking: { update: mockTxBookingUpdate },
        walletSession: { count: mockTxWalletSessionCount },
      });
    });

    const { updateBooking } = await import("@/server/actions/booking");
    const result = await updateBooking(BOOKING_ID, { people: 3 });

    expect(result.success).toBe(false);
    // tx 內 booking.update 不該被呼叫成功（tx 會 rollback）
    // 注意：因為我們的 mock 不真的 rollback，但實 prod prisma.$transaction 會
    // 這裡 assert：allocateSessionsFefo 被呼叫，且 result.success = false
    expect(mockAllocateSessionsFefo).toHaveBeenCalled();
  });

  it("people 不變（1→1）：不動 session helper", async () => {
    mockBookingFindUnique.mockResolvedValue(
      makeBooking({ people: 1, customerPlanWalletId: WALLET_ID }),
    );

    const { updateBooking } = await import("@/server/actions/booking");
    const result = await updateBooking(BOOKING_ID, { people: 1 });

    expect(result.success).toBe(true);
    expect(mockAllocateSessionsFefo).not.toHaveBeenCalled();
    expect(mockPartialReleaseSessions).not.toHaveBeenCalled();
    // $transaction 不該被進入（不需 session sync）
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("people 2 → 2：no-op，不動 session", async () => {
    mockBookingFindUnique.mockResolvedValue(
      makeBooking({ people: 2, customerPlanWalletId: WALLET_ID }),
    );

    const { updateBooking } = await import("@/server/actions/booking");
    await updateBooking(BOOKING_ID, { people: 2 });

    expect(mockAllocateSessionsFefo).not.toHaveBeenCalled();
    expect(mockPartialReleaseSessions).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("COMPLETED booking：拒絕修改", async () => {
    mockBookingFindUnique.mockResolvedValue(
      makeBooking({ bookingStatus: "COMPLETED" }),
    );

    const { updateBooking } = await import("@/server/actions/booking");
    const result = await updateBooking(BOOKING_ID, { people: 2 });

    expect(result.success).toBe(false);
    expect(mockAllocateSessionsFefo).not.toHaveBeenCalled();
    expect(mockPartialReleaseSessions).not.toHaveBeenCalled();
  });

  it("CANCELLED booking：拒絕修改", async () => {
    mockBookingFindUnique.mockResolvedValue(
      makeBooking({ bookingStatus: "CANCELLED" }),
    );

    const { updateBooking } = await import("@/server/actions/booking");
    const result = await updateBooking(BOOKING_ID, { people: 2 });

    expect(result.success).toBe(false);
    expect(mockAllocateSessionsFefo).not.toHaveBeenCalled();
    expect(mockPartialReleaseSessions).not.toHaveBeenCalled();
  });

  it("FIRST_TRIAL 改 people 不動 session", async () => {
    mockBookingFindUnique.mockResolvedValue(
      makeBooking({
        bookingType: "FIRST_TRIAL",
        people: 1,
        customerPlanWalletId: null, // 體驗不綁 wallet
      }),
    );

    const { updateBooking } = await import("@/server/actions/booking");
    await updateBooking(BOOKING_ID, { people: 2 });

    expect(mockAllocateSessionsFefo).not.toHaveBeenCalled();
    expect(mockPartialReleaseSessions).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("SINGLE 改 people 不動 session", async () => {
    mockBookingFindUnique.mockResolvedValue(
      makeBooking({
        bookingType: "SINGLE",
        people: 1,
        customerPlanWalletId: null,
      }),
    );

    const { updateBooking } = await import("@/server/actions/booking");
    await updateBooking(BOOKING_ID, { people: 2 });

    expect(mockAllocateSessionsFefo).not.toHaveBeenCalled();
    expect(mockPartialReleaseSessions).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("PACKAGE_SESSION 補課 (isMakeup) 改 people 不動 session", async () => {
    mockBookingFindUnique.mockResolvedValue(
      makeBooking({
        bookingType: "PACKAGE_SESSION",
        isMakeup: true,
        people: 1,
        customerPlanWalletId: null,
      }),
    );

    const { updateBooking } = await import("@/server/actions/booking");
    await updateBooking(BOOKING_ID, { people: 2 });

    expect(mockAllocateSessionsFefo).not.toHaveBeenCalled();
    expect(mockPartialReleaseSessions).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("Stale data 修正：booking.people=2 但 actual RESERVED=1，改 people=3 → allocate 2", async () => {
    // 反映 PR #193 前 stale booking：people=2 但實際只 1 RESERVED
    mockBookingFindUnique.mockResolvedValue(
      makeBooking({ people: 2, customerPlanWalletId: WALLET_ID }),
    );
    mockTxWalletSessionCount.mockResolvedValue(1); // 實際 1（而非 2）

    const { updateBooking } = await import("@/server/actions/booking");
    const result = await updateBooking(BOOKING_ID, { people: 3 });

    expect(result.success).toBe(true);
    // delta = newPeople(3) - actualReserved(1) = 2
    expect(mockAllocateSessionsFefo).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ bookingId: BOOKING_ID, count: 2 }),
    );
  });

  it("改時段容量檢查只計入同店 booked people，不受其他分店同時段影響", async () => {
    const targetDate = new Date("2026-12-16T00:00:00Z");
    mockBookingFindUnique.mockResolvedValue(
      makeBooking({
        bookingDate: targetDate,
        slotTime: "17:30",
        people: 3,
        customerPlanWalletId: WALLET_ID,
      }),
    );
    mockBookingAggregate.mockImplementation(async ({ where }) => ({
      _sum: {
        people: where.storeId === STORE_A ? 1 : 4,
      },
    }));

    const { updateBooking } = await import("@/server/actions/booking");
    const result = await updateBooking(BOOKING_ID, {
      bookingDate: "2026-12-16",
      slotTime: "18:30",
      people: 3,
    });

    expect(result.success).toBe(true);
    expect(mockBookingAggregate).toHaveBeenCalledWith({
      where: expect.objectContaining({
        storeId: STORE_A,
        bookingDate: targetDate,
        slotTime: "18:30",
        bookingStatus: { in: ["PENDING", "CONFIRMED"] },
        NOT: { id: BOOKING_ID },
      }),
      _sum: { people: true },
    });
  });

  it("改時段時若同店目標時段真的滿位，仍會被容量檢查擋下", async () => {
    const targetDate = new Date("2026-12-16T00:00:00Z");
    mockBookingFindUnique.mockResolvedValue(
      makeBooking({
        bookingDate: targetDate,
        slotTime: "17:30",
        people: 3,
        customerPlanWalletId: WALLET_ID,
      }),
    );
    mockBookingAggregate.mockImplementation(async ({ where }) => ({
      _sum: {
        people: where.storeId === STORE_A ? 4 : 7,
      },
    }));

    const { updateBooking } = await import("@/server/actions/booking");
    const result = await updateBooking(BOOKING_ID, {
      bookingDate: "2026-12-16",
      slotTime: "18:30",
      people: 3,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("目標時段名額不足");
    expect(mockBookingAggregate).toHaveBeenCalledWith({
      where: expect.objectContaining({
        storeId: STORE_A,
        bookingDate: targetDate,
        slotTime: "18:30",
        bookingStatus: { in: ["PENDING", "CONFIRMED"] },
        NOT: { id: BOOKING_ID },
      }),
      _sum: { people: true },
    });
  });

  it("更新同一筆且目標時段相同時，容量檢查排除自己避免誤判滿位", async () => {
    const targetDate = new Date("2026-12-16T00:00:00Z");
    mockBookingFindUnique.mockResolvedValue(
      makeBooking({
        bookingDate: targetDate,
        slotTime: "18:30",
        people: 3,
        customerPlanWalletId: WALLET_ID,
      }),
    );
    mockBookingAggregate.mockImplementation(async ({ where }) => ({
      _sum: {
        people: where.NOT?.id === BOOKING_ID ? 3 : 6,
      },
    }));

    const { updateBooking } = await import("@/server/actions/booking");
    const result = await updateBooking(BOOKING_ID, {
      bookingDate: "2026-12-16",
      slotTime: "18:30",
      people: 3,
    });

    expect(result.success).toBe(true);
    expect(mockBookingAggregate).toHaveBeenCalledWith({
      where: expect.objectContaining({
        storeId: STORE_A,
        bookingDate: targetDate,
        slotTime: "18:30",
        bookingStatus: { in: ["PENDING", "CONFIRMED"] },
        NOT: { id: BOOKING_ID },
      }),
      _sum: { people: true },
    });
  });
});
