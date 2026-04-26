/**
 * Regression: 顧客自助預約路徑下 usage-gate 不可呼叫 requireStaffSession
 *
 * 防止以下歷史 bug 復發：
 *   - createBooking → checkMonthlyBookingLimitOrThrow → getCurrentStoreLimits
 *     → getCurrentStoreForPlan → requireStaffSession → 顧客流程被吐 staff-only 訊息
 *
 * 守則：
 *   1. 只要呼叫端帶 storeId，usage-gate 不應觸發 requireStaffSession（用 storeId 路徑）
 *   2. 不帶 storeId 才走 staff-only 路徑（保留給 dashboard server actions）
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const STORE_A = "store-zhubei";

const mockStoreFindUnique = vi.fn();
const mockRequireStaffSession = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    store: {
      findUnique: (...a: unknown[]) => mockStoreFindUnique(...a),
    },
  },
}));

vi.mock("@/lib/session", () => ({
  requireStaffSession: () => mockRequireStaffSession(),
}));

vi.mock("@/lib/store", () => ({
  currentStoreId: (u: { storeId?: string | null }) => u.storeId ?? "default",
  DEFAULT_STORE_ID: "default-store",
  getActiveStoreForRead: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Store: ALLIANCE plan (highest tier — has bookings limit but high)
  mockStoreFindUnique.mockResolvedValue({
    id: STORE_A,
    plan: "EXPERIENCE",
    maxStaffOverride: null,
    maxCustomersOverride: null,
    maxMonthlyBookingsOverride: null,
    maxMonthlyReportsOverride: null,
    maxReminderSendsOverride: null,
    maxStoresOverride: null,
  });
  mockRequireStaffSession.mockImplementation(() => {
    throw new Error("requireStaffSession should NOT be called when storeId is provided");
  });
});

describe("checkMonthlyBookingLimitOrThrow — storeId path skips staff session", () => {
  it("帶 storeId 呼叫不觸發 requireStaffSession", async () => {
    const { checkMonthlyBookingLimitOrThrow } = await import("@/lib/usage-gate");
    await expect(
      checkMonthlyBookingLimitOrThrow(0, STORE_A),
    ).resolves.not.toThrow();
    expect(mockRequireStaffSession).not.toHaveBeenCalled();
  });

  it("帶 storeId 且超過上限時，throw FORBIDDEN（不是 staff-only 訊息）", async () => {
    const { checkMonthlyBookingLimitOrThrow } = await import("@/lib/usage-gate");
    // EXPERIENCE 方案上限 100；傳 999 強制超標
    await expect(
      checkMonthlyBookingLimitOrThrow(999, STORE_A),
    ).rejects.toThrow(/方案每月最多.*筆預約/);
    // 但訊息不可是 staff-only 那組
    try {
      await checkMonthlyBookingLimitOrThrow(999, STORE_A);
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toMatch(/僅限員工|僅限.*管理者|僅限店主|沒有此操作的權限/);
    }
    expect(mockRequireStaffSession).not.toHaveBeenCalled();
  });

  it("不帶 storeId 仍走 staff session 路徑（保留 dashboard 行為）", async () => {
    mockRequireStaffSession.mockResolvedValue({
      role: "OWNER",
      storeId: STORE_A,
      staffId: "s1",
      id: "u1",
    });
    const { checkMonthlyBookingLimitOrThrow } = await import("@/lib/usage-gate");
    await checkMonthlyBookingLimitOrThrow(0);
    // 兩次：一次給 getCurrentStoreLimits、一次給 getCurrentStoreForPlan
    expect(mockRequireStaffSession.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("checkCustomerLimitOrThrow / checkStaffLimitOrThrow — storeId path 同樣不觸發 staff session", () => {
  it("checkCustomerLimitOrThrow 帶 storeId 不呼叫 requireStaffSession", async () => {
    const { checkCustomerLimitOrThrow } = await import("@/lib/usage-gate");
    await expect(checkCustomerLimitOrThrow(0, STORE_A)).resolves.not.toThrow();
    expect(mockRequireStaffSession).not.toHaveBeenCalled();
  });

  it("checkStaffLimitOrThrow 帶 storeId 不呼叫 requireStaffSession", async () => {
    const { checkStaffLimitOrThrow } = await import("@/lib/usage-gate");
    await expect(checkStaffLimitOrThrow(0, STORE_A)).resolves.not.toThrow();
    expect(mockRequireStaffSession).not.toHaveBeenCalled();
  });
});
