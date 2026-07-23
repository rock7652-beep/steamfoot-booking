/**
 * booking-mark-completed-attended-people.test.ts (PR-3d)
 *
 * 鎖定 markCompleted 對 attendedPeople 的寫入語意：
 *   - FIRST_TRIAL people=2 + attendedPeople=1 → 寫入 attendedPeople=1
 *   - FIRST_TRIAL people=2 + attendedPeople=2 → 寫入 attendedPeople=2（Decision D：明確寫入）
 *   - FIRST_TRIAL people=2 + 無 attendedPeople → 不寫此欄位（向後相容）
 *   - attendedPeople > booking.people → VALIDATION 拒絕
 *   - PACKAGE_SESSION + attendedPeople < people → BUSINESS_RULE 拒絕（部分到店僅 FIRST_TRIAL）
 *   - PACKAGE_SESSION + attendedPeople == people → 接受（完整到店允許所有型別）
 *
 * Mock 策略：unit-style；FIRST_TRIAL 無 wallet → wallet 分支 skip，
 * @/lib/db mock 只暴露 booking.{findUnique,update} + transaction.{findFirst}
 * + $transaction；其餘依賴最小化 mock。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const STORE = "store_1";

const mockBookingFindUnique = vi.fn();
const mockTxBookingUpdate = vi.fn();
const mockTxTransactionFindFirst = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: {
      findUnique: (...a: unknown[]) => mockBookingFindUnique(...a),
    },
    transaction: {
      findFirst: (...a: unknown[]) => mockTxTransactionFindFirst(...a),
    },
    $transaction: (cb: (tx: unknown) => Promise<unknown>) => mockTransaction(cb),
  },
}));

vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({ id: "u1", role: "OWNER", storeId: STORE, staffId: "s1" })),
}));
vi.mock("@/lib/permissions", () => ({
  requirePermission: vi.fn(async () => ({ id: "u1", role: "OWNER", storeId: STORE, staffId: "s1" })),
  requireWritablePermission: vi.fn(async () => ({ id: "u1", role: "OWNER", storeId: STORE, staffId: "s1" })),
}));
vi.mock("@/lib/store", () => ({
  currentStoreId: (u: { storeId?: string | null }) => u.storeId ?? STORE,
  DEFAULT_STORE_ID: "default",
}));
vi.mock("@/lib/manager-visibility", () => ({ assertStoreAccess: vi.fn() }));
vi.mock("@/lib/revalidation", () => ({ revalidateBookings: vi.fn() }));
vi.mock("@/lib/business-hours-resolver", () => ({
  loadDayBusinessHoursContext: vi.fn(async () => ({ rule: { closed: false }, slotOverrides: [] })),
  applySlotOverrides: () => [],
}));
vi.mock("@/lib/date-utils", () => ({
  toLocalDateStr: () => "2026-06-07",
  getNowTaipeiHHmm: () => "10:00",
}));
vi.mock("@/lib/booking-constants", () => ({
  PENDING_STATUSES: ["PENDING", "CONFIRMED"] as const,
  ACTIVE_BOOKING_STATUSES: ["PENDING", "CONFIRMED"] as const,
  getBookingDateTime: (d: Date) => d,
  NO_SHOW_MAKEUP_VALID_DAYS: 7,
}));
vi.mock("@/lib/shop-config", () => ({
  checkBookingLimit: vi.fn(async () => undefined),
  resolveBookableUntilDate: vi.fn(async () => null),
}));
vi.mock("@/lib/wallet-sort", () => ({ sortWalletsByFEFO: (x: unknown[]) => x }));
vi.mock("@/server/services/wallet-session", () => ({
  allocateSessionsFefo: vi.fn(),
  releaseSessions: vi.fn(),
  partialReleaseSessions: vi.fn(),
  // 對 FIRST_TRIAL 不會被呼叫；PACKAGE_SESSION 完整到店時會呼叫但回 zero items
  // 讓 legacy fallback 走 wallet.update（亦 mock 為 noop）。
  completeSessions: vi.fn(async () => ({ completed: 0, items: [] })),
  uncompleteSessions: vi.fn(async () => ({ uncompleted: 0 })),
  reReserveSessionsFefo: vi.fn(),
  voidSessionDeductionTxs: vi.fn(),
}));
vi.mock("@/server/services/referral-points", () => ({
  awardFirstBookingReferralPointsIfEligible: vi.fn(),
}));
vi.mock("./booking-helpers", () => ({
  snapshotRevenueStaffForBooking: (s: string | null) => s ?? null,
}));
vi.mock("@/lib/errors", () => ({
  AppError: class AppError extends Error {
    code: string;
    constructor(code: string, msg: string) {
      super(msg);
      this.code = code;
    }
  },
  handleActionError: (e: unknown) => ({
    success: false,
    error: e instanceof Error ? e.message : "err",
  }),
}));

import { markCompleted } from "@/server/actions/booking";

type UpdateArg = { where: { id: string }; data: Record<string, unknown> };
const lastUpdateData = (): Record<string, unknown> =>
  (mockTxBookingUpdate.mock.calls.at(-1) as unknown as [UpdateArg])[0].data;

beforeEach(() => {
  vi.clearAllMocks();
  mockTxBookingUpdate.mockResolvedValue({});
  // FIRST_TRIAL 必須已有成功收款，才能單獨走 markCompleted（提前收款情境）。
  mockTxTransactionFindFirst.mockResolvedValue({ id: "tx_paid" });
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    return cb({
      booking: { update: mockTxBookingUpdate },
      transaction: { create: vi.fn() },
      customer: { update: vi.fn() },
      customerPlanWallet: { update: vi.fn() },
    });
  });
});

function trialBooking(people: number) {
  return {
    id: "bk_1",
    bookingType: "FIRST_TRIAL",
    bookingStatus: "PENDING",
    people,
    isMakeup: false,
    customerId: "c1",
    customer: { id: "c1", customerStage: "LEAD" },
    customerPlanWallet: null,
    storeId: STORE,
    serviceStaffId: null,
    revenueStaffId: "s1",
    bookingDate: new Date("2026-06-07"),
    slotTime: "10:00",
  };
}

function packageBooking(people: number) {
  return {
    id: "bk_pkg",
    bookingType: "PACKAGE_SESSION",
    bookingStatus: "PENDING",
    people,
    isMakeup: false,
    customerId: "c1",
    customer: { id: "c1", customerStage: "ACTIVE" },
    // 必須有 wallet，否則 P0 guard 會拒絕完成 PACKAGE_SESSION
    customerPlanWallet: {
      id: "w1",
      remainingSessions: 5,
      status: "ACTIVE",
      customerId: "c1",
    },
    storeId: STORE,
    serviceStaffId: null,
    revenueStaffId: "s1",
    bookingDate: new Date("2026-06-07"),
    slotTime: "10:00",
  };
}

describe("markCompleted — PR-3d attendedPeople write semantics", () => {
  it("FIRST_TRIAL people=2 + attendedPeople=1 → writes attendedPeople=1", async () => {
    mockBookingFindUnique.mockResolvedValue(trialBooking(2));
    const r = await markCompleted("bk_1", { attendedPeople: 1 });
    expect(r.success).toBe(true);
    const data = lastUpdateData();
    expect(data.attendedPeople).toBe(1);
    expect(data.bookingStatus).toBe("COMPLETED");
  });

  it("FIRST_TRIAL people=2 + attendedPeople=2 → writes attendedPeople=2 (Decision D)", async () => {
    mockBookingFindUnique.mockResolvedValue(trialBooking(2));
    const r = await markCompleted("bk_1", { attendedPeople: 2 });
    expect(r.success).toBe(true);
    expect(lastUpdateData().attendedPeople).toBe(2);
  });

  it("FIRST_TRIAL people=2 + omit attendedPeople → not written (back-compat)", async () => {
    mockBookingFindUnique.mockResolvedValue(trialBooking(2));
    const r = await markCompleted("bk_1");
    expect(r.success).toBe(true);
    expect(lastUpdateData()).not.toHaveProperty("attendedPeople");
  });

  it("FIRST_TRIAL people=2 + attendedPeople=3 → VALIDATION reject, no update", async () => {
    mockBookingFindUnique.mockResolvedValue(trialBooking(2));
    const r = await markCompleted("bk_1", { attendedPeople: 3 });
    expect(r.success).toBe(false);
    expect(mockTxBookingUpdate).not.toHaveBeenCalled();
  });

  it("PACKAGE_SESSION people=2 + attendedPeople=1 → BUSINESS_RULE reject (only trial supports partial)", async () => {
    mockBookingFindUnique.mockResolvedValue(packageBooking(2));
    const r = await markCompleted("bk_pkg", { attendedPeople: 1 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/體驗預約/);
    expect(mockTxBookingUpdate).not.toHaveBeenCalled();
  });
});
