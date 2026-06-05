import { describe, it, expect, vi, beforeEach } from "vitest";

// PR-NoShow-1：markNoShow「扣堂並給 10 日補課資格」行為保證
//  - DEDUCTED_WITH_MAKEUP：依 booking.people 建 N 張補課券（一張抵 1 人 / 1 堂），
//    每張 isUsed=false、expiredAt ≈ now+10 天
//  - DEDUCTED：不建任何補課券
//  - race-safe：$transaction 內先 SELECT ... FOR UPDATE 鎖 row，再重查狀態；
//    若已非 PENDING/CONFIRMED → CONFLICT，不扣堂、不建券（防雙擊重複扣堂/發券）

const h = vi.hoisted(() => {
  const makeupCreate = vi.fn(async () => ({ id: "mc" }));
  const txTransactionCreate = vi.fn(async () => ({ id: "tx" }));
  const bookingUpdate = vi.fn(async () => ({}));
  const queryRaw = vi.fn(async () => []);
  // tx 內重查狀態（race guard）— 預設 PENDING，case 3 改 NO_SHOW
  const freshFindUnique = vi.fn(async () => ({ bookingStatus: "PENDING" }));
  // 扣堂：完成 N 個 RESERVED → COMPLETED（mock，不碰真 DB）
  const completeSessions = vi.fn(async () => ({
    completed: 2,
    items: [{ walletId: "w1" }, { walletId: "w1" }],
  }));
  const outerBookingFindUnique = vi.fn(async () => ({
    id: "bk_1",
    storeId: "store_1",
    bookingStatus: "PENDING",
    customerId: "cust_1",
    people: 2,
    isMakeup: false,
    slotTime: "10:00",
    bookingDate: new Date("2026-06-10T00:00:00Z"),
    revenueStaffId: "rev_staff",
    customerPlanWallet: { id: "w1", remainingSessions: 5, status: "ACTIVE" },
    customer: { id: "cust_1", customerStage: "ACTIVE" },
  }));
  return {
    makeupCreate,
    txTransactionCreate,
    bookingUpdate,
    queryRaw,
    freshFindUnique,
    completeSessions,
    outerBookingFindUnique,
    requirePermission: vi.fn(async () => ({
      id: "u1",
      role: "OWNER",
      staffId: "op_staff",
      storeId: "store_1",
    })),
    currentStoreId: vi.fn(() => "store_1"),
    assertStoreAccess: vi.fn(() => undefined),
    revalidateBookings: vi.fn(),
    // $transaction：用 mock tx 跑 callback
    txRun: vi.fn(async (fn: (c: unknown) => unknown) =>
      fn({
        $queryRaw: queryRaw,
        booking: { findUnique: freshFindUnique, update: bookingUpdate },
        makeupCredit: { create: makeupCreate },
        transaction: { create: txTransactionCreate },
      }),
    ),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: { findUnique: h.outerBookingFindUnique },
    $transaction: h.txRun,
  },
}));
vi.mock("@/lib/permissions", () => ({ requirePermission: h.requirePermission }));
// @/lib/session 會載入 next-auth（vitest 下 next/server 解析失敗）→ neutralize
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(),
  requireStaffSession: vi.fn(),
}));
vi.mock("@/lib/store", () => ({ currentStoreId: h.currentStoreId }));
vi.mock("@/lib/manager-visibility", () => ({
  assertStoreAccess: h.assertStoreAccess,
}));
vi.mock("@/server/services/wallet-session", () => ({
  completeSessions: h.completeSessions,
  releaseSessions: vi.fn(),
  allocateSessionsFefo: vi.fn(),
  partialReleaseSessions: vi.fn(),
  uncompleteSessions: vi.fn(),
  reReserveSessionsFefo: vi.fn(),
}));
vi.mock("@/lib/revalidation", () => ({
  revalidateBookings: h.revalidateBookings,
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

import { markNoShow } from "@/server/actions/booking";

const creditData = () =>
  h.makeupCreate.mock.calls.map(
    (c) => (c as unknown as [{ data: Record<string, unknown> }])[0].data,
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.freshFindUnique.mockResolvedValue({ bookingStatus: "PENDING" });
  h.completeSessions.mockResolvedValue({
    completed: 2,
    items: [{ walletId: "w1" }, { walletId: "w1" }],
  });
  h.outerBookingFindUnique.mockResolvedValue({
    id: "bk_1",
    storeId: "store_1",
    bookingStatus: "PENDING",
    customerId: "cust_1",
    people: 2,
    isMakeup: false,
    slotTime: "10:00",
    bookingDate: new Date("2026-06-10T00:00:00Z"),
    revenueStaffId: "rev_staff",
    customerPlanWallet: { id: "w1", remainingSessions: 5, status: "ACTIVE" },
    customer: { id: "cust_1", customerStage: "ACTIVE" },
  } as unknown as never);
});

describe("markNoShow — DEDUCTED_WITH_MAKEUP", () => {
  it("people=2 → 建 2 張補課券，each isUsed=false、expiredAt≈now+10天", async () => {
    const before = Date.now();
    const r = await markNoShow("bk_1", "DEDUCTED_WITH_MAKEUP");
    expect(r.success).toBe(true);
    // 一張券抵 1 人/1 堂：people=2 → 2 張
    expect(h.makeupCreate).toHaveBeenCalledTimes(2);
    for (const d of creditData()) {
      expect(d.isUsed).toBe(false);
      expect(d.customerId).toBe("cust_1");
      expect(d.originalBookingId).toBe("bk_1");
      const exp = (d.expiredAt as Date).getTime();
      const tenDays = 10 * 24 * 60 * 60 * 1000;
      // 容許執行耗時誤差
      expect(exp).toBeGreaterThan(before + tenDays - 5000);
      expect(exp).toBeLessThan(Date.now() + tenDays + 5000);
    }
    // race-safe：有鎖 row
    expect(h.queryRaw).toHaveBeenCalledTimes(1);
    // 標記 NO_SHOW + DEDUCTED + 發補課
    expect(h.bookingUpdate).toHaveBeenCalledTimes(1);
  });

  it("依人數扣堂：people=2 → 2 筆 SESSION_DEDUCTION", async () => {
    await markNoShow("bk_1", "DEDUCTED_WITH_MAKEUP");
    expect(h.txTransactionCreate).toHaveBeenCalledTimes(2);
  });
});

describe("markNoShow — DEDUCTED（扣堂、不發補課）", () => {
  it("people=2 → 扣堂但不建任何補課券", async () => {
    const r = await markNoShow("bk_1", "DEDUCTED");
    expect(r.success).toBe(true);
    expect(h.makeupCreate).not.toHaveBeenCalled();
    expect(h.txTransactionCreate).toHaveBeenCalledTimes(2);
  });
});

describe("markNoShow — race guard", () => {
  it("鎖定後重查若已非待到店 → CONFLICT，不扣堂、不建券", async () => {
    h.freshFindUnique.mockResolvedValue({ bookingStatus: "NO_SHOW" });
    const r = await markNoShow("bk_1", "DEDUCTED_WITH_MAKEUP");
    expect(r.success).toBe(false);
    expect(h.queryRaw).toHaveBeenCalledTimes(1); // 有先鎖
    expect(h.bookingUpdate).not.toHaveBeenCalled();
    expect(h.makeupCreate).not.toHaveBeenCalled();
    expect(h.txTransactionCreate).not.toHaveBeenCalled();
  });
});
