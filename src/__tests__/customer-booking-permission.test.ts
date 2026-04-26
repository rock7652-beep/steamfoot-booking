/**
 * Regression: 顧客自助預約流程不可觸發 staff guard
 *
 * 防止以下歷史 bug 復發：
 *   - 顧客前台 /book/new 看到紅框「此功能僅限員工使用」
 *
 * 守則：
 *   1. fetchMonthAvailability / fetchDaySlots / createBooking
 *      於 CUSTOMER 角色呼叫時，不可拋 staff-only AppError
 *   2. handleActionError 不可把「此功能僅限員工使用」原文傳回客戶端
 *      （萬一上游真有員工守門誤用時，顧客 UI 也得到顧客語意的訊息）
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock prisma ──
const mockBusinessHoursFindMany = vi.fn();
const mockBusinessHoursFindFirst = vi.fn();
const mockSpecialDayFindMany = vi.fn();
const mockSpecialDayFindFirst = vi.fn();
const mockSlotOverrideFindMany = vi.fn();
const mockBookingGroupBy = vi.fn();
const mockBookingCount = vi.fn();
const mockBookingAggregate = vi.fn();
const mockBookingFindMany = vi.fn();
const mockBookingCreate = vi.fn();
const mockDutyFindMany = vi.fn();
const mockDutyCount = vi.fn();
const mockCustomerFindUnique = vi.fn();
const mockMakeupFindUnique = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    businessHours: {
      findMany: (...a: unknown[]) => mockBusinessHoursFindMany(...a),
      findFirst: (...a: unknown[]) => mockBusinessHoursFindFirst(...a),
    },
    specialBusinessDay: {
      findMany: (...a: unknown[]) => mockSpecialDayFindMany(...a),
      findFirst: (...a: unknown[]) => mockSpecialDayFindFirst(...a),
    },
    slotOverride: {
      findMany: (...a: unknown[]) => mockSlotOverrideFindMany(...a),
    },
    booking: {
      groupBy: (...a: unknown[]) => mockBookingGroupBy(...a),
      count: (...a: unknown[]) => mockBookingCount(...a),
      aggregate: (...a: unknown[]) => mockBookingAggregate(...a),
      findMany: (...a: unknown[]) => mockBookingFindMany(...a),
      create: (...a: unknown[]) => mockBookingCreate(...a),
    },
    dutyAssignment: {
      findMany: (...a: unknown[]) => mockDutyFindMany(...a),
      count: (...a: unknown[]) => mockDutyCount(...a),
    },
    customer: {
      findUnique: (...a: unknown[]) => mockCustomerFindUnique(...a),
    },
    makeupCredit: {
      findUnique: (...a: unknown[]) => mockMakeupFindUnique(...a),
    },
    $transaction: (cb: (tx: unknown) => Promise<unknown>) => mockTransaction(cb),
  },
}));

// ── Mock session：CUSTOMER 角色（自助預約） ──
const STORE_A = "store-zhubei";
const CUSTOMER_ID = "ck0000000000000000000001";
const USER_ID = "ck0000000000000000000002";
const WALLET_ID = "ck0000000000000000000003";

vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({
    role: "CUSTOMER",
    storeId: STORE_A,
    staffId: null,
    customerId: CUSTOMER_ID,
    id: USER_ID,
  })),
  requireStaffSession: vi.fn(async () => {
    // 顧客若觸發 staff guard 視為紅燈
    throw new Error("CUSTOMER hit requireStaffSession — must not happen");
  }),
}));

vi.mock("@/lib/store", () => ({
  currentStoreId: (u: { storeId?: string | null }) => u.storeId ?? "default",
  getActiveStoreForRead: vi.fn(),
  DEFAULT_STORE_ID: "default-store",
}));

vi.mock("@/lib/manager-visibility", () => ({
  getStoreFilter: (u: { storeId?: string | null }) => ({ storeId: u.storeId ?? null }),
  assertStoreAccess: vi.fn(), // CUSTOMER 走自助路徑時不會呼叫到
}));

vi.mock("@/lib/permissions", () => ({
  // 顧客流程不該呼叫 requirePermission；若有，視為紅燈
  requirePermission: vi.fn(async () => {
    throw new Error("CUSTOMER hit requirePermission — must not happen");
  }),
}));

vi.mock("@/lib/shop-config", () => ({
  isDutySchedulingEnabled: vi.fn(async () => false),
  checkBookingLimit: vi.fn(async () => ({ allowed: true, current: 0, limit: 100 })),
}));

vi.mock("@/lib/usage-gate", () => ({
  checkMonthlyBookingLimitOrThrow: vi.fn(async () => undefined),
}));

vi.mock("@/lib/date-utils", () => ({
  toLocalDateStr: () => "2026-04-26",
  getNowTaipeiHHmm: () => "00:00",
}));

vi.mock("@/lib/booking-constants", () => ({
  PENDING_STATUSES: ["PENDING", "CONFIRMED"] as const,
  getBookingDateTime: (d: Date, t: string) => {
    const [h, m] = t.split(":").map(Number);
    const dd = new Date(d);
    dd.setUTCHours(h, m, 0, 0);
    return dd;
  },
}));

vi.mock("@/lib/revalidation", () => ({
  revalidateBookings: vi.fn(),
  revalidateBusinessHours: vi.fn(),
  revalidateSpecialDays: vi.fn(),
}));

vi.mock("@/server/services/referral-events", () => ({
  createBookingCreatedEvent: vi.fn(async () => undefined),
  createBookingCompletedEvent: vi.fn(async () => undefined),
}));
vi.mock("@/server/services/referral-points", () => ({
  awardFirstBookingReferralPointsIfEligible: vi.fn(async () => undefined),
}));

vi.mock("@/lib/errors", async () => {
  const actual = await vi.importActual<typeof import("@/lib/errors")>("@/lib/errors");
  return actual; // 用真的 handleActionError，這正是要驗證守門有效
});

beforeEach(() => {
  vi.clearAllMocks();

  // BusinessHours：5/5 週二營業
  mockBusinessHoursFindMany.mockResolvedValue(
    [0, 1, 2, 3, 4, 5, 6].map((dow) => ({
      dayOfWeek: dow,
      isOpen: true,
      openTime: "10:00",
      closeTime: "22:00",
      slotInterval: 60,
      defaultCapacity: 6,
    })),
  );
  mockBusinessHoursFindFirst.mockResolvedValue({
    dayOfWeek: 2,
    isOpen: true,
    openTime: "10:00",
    closeTime: "22:00",
    slotInterval: 60,
    defaultCapacity: 6,
  });
  mockSpecialDayFindMany.mockResolvedValue([]);
  mockSpecialDayFindFirst.mockResolvedValue(null);
  mockSlotOverrideFindMany.mockResolvedValue([]);
  mockBookingGroupBy.mockResolvedValue([]);
  mockBookingCount.mockResolvedValue(0);
  mockBookingAggregate.mockResolvedValue({ _sum: { people: 0 } });
  mockBookingFindMany.mockResolvedValue([]);
  mockDutyFindMany.mockResolvedValue([]);
  mockDutyCount.mockResolvedValue(0);
  mockCustomerFindUnique.mockResolvedValue({
    id: CUSTOMER_ID,
    storeId: STORE_A,
    selfBookingEnabled: true,
    assignedStaffId: null,
    sponsorId: null,
    planWallets: [
      { id: WALLET_ID, remainingSessions: 5, expiryDate: null },
    ],
  });
  mockBookingCreate.mockResolvedValue({
    id: "bk1",
    storeId: STORE_A,
    customerId: CUSTOMER_ID,
  });
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      booking: { create: mockBookingCreate },
      makeupCredit: { update: vi.fn() },
    }),
  );
});

// ── 測試 ──

describe("CUSTOMER 自助預約：不可觸發 staff guard", () => {
  it("fetchMonthAvailability(CUSTOMER) 不報 staff-only 訊息", async () => {
    const { fetchMonthAvailability } = await import("@/server/actions/slots");
    const result = await fetchMonthAvailability(2026, 5);
    // 不該丟例外（測試正常完成即代表沒走到 requireStaffSession 的 throw）
    expect(Object.keys(result.days).length).toBeGreaterThan(0);
  });

  it("fetchDaySlots(CUSTOMER) 不報 staff-only 訊息", async () => {
    const { fetchDaySlots } = await import("@/server/actions/slots");
    const result = await fetchDaySlots("2026-05-05");
    expect(result.slots.length).toBeGreaterThan(0);
  });

  it("createBooking(CUSTOMER 自己預約) 不報 staff-only 訊息", async () => {
    const { createBooking } = await import("@/server/actions/booking");
    const result = await createBooking({
      customerId: CUSTOMER_ID,
      bookingDate: "2026-05-05",
      slotTime: "11:00",
      bookingType: "PACKAGE_SESSION",
      customerPlanWalletId: WALLET_ID,
      people: 1,
    });
    // success 與否由業務規則決定，但 error 絕不可是 staff-only 訊息
    if (!result.success) {
      expect(result.error).not.toMatch(/僅限員工|僅限.*管理者|僅限店主|沒有此操作的權限/);
    }
  });
});

describe("handleActionError 守門：staff-only 訊息不外洩到顧客 UI", () => {
  it("AppError(\"FORBIDDEN\", \"此功能僅限員工使用\") 被替換為顧客語意訊息", async () => {
    const { handleActionError, AppError } = await import("@/lib/errors");
    const result = handleActionError(new AppError("FORBIDDEN", "此功能僅限員工使用"));
    if (result.success) throw new Error("expected failure result");
    expect(result.error).not.toBe("此功能僅限員工使用");
    expect(result.error).toMatch(/重新整理|聯繫店家/);
  });

  it("AppError(\"FORBIDDEN\", \"您沒有此操作的權限\") 被替換為顧客語意訊息", async () => {
    const { handleActionError, AppError } = await import("@/lib/errors");
    const result = handleActionError(new AppError("FORBIDDEN", "您沒有此操作的權限"));
    if (result.success) throw new Error("expected failure result");
    expect(result.error).not.toBe("您沒有此操作的權限");
    expect(result.error).toMatch(/重新整理|聯繫店家/);
  });

  it("一般 AppError（業務規則）原樣回傳，不被誤殺", async () => {
    const { handleActionError, AppError } = await import("@/lib/errors");
    const result = handleActionError(new AppError("BUSINESS_RULE", "該時段已額滿，請選擇其他時段"));
    if (result.success) throw new Error("expected failure result");
    expect(result.error).toBe("該時段已額滿，請選擇其他時段");
  });
});
