/**
 * assignPlanToCustomer — 有效期限模式驗收
 *
 * 規則：
 *   PLAN_DEFAULT  → 以「台灣今天」+ plan.validityDays 計算（無 → null）
 *   CUSTOM_DURATION → 以「台灣今天」+ N 天/週/月（月份 clamp 月底）
 *   CUSTOM_DATE   → 直接使用店長指定的 YYYY-MM-DD（不可早於台灣今天）
 *
 * 測試固定「台灣今天 = 2026-05-03」，讓 expiryDate 計算結果可驗證。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const STORE_A = "store-zhubei";
const CUSTOMER_ID = "ck0000000000000000000c01";
const PLAN_ID_90D = "ck0000000000000000000p90";
const PLAN_ID_NO_EXPIRY = "ck0000000000000000000p00";
const STAFF_ID = "ck0000000000000000000s01";
const OWNER_USER_ID = "ck0000000000000000000u01";
const WALLET_ID = "ck0000000000000000000w01";

// 固定「台灣今天 = 2026-05-03」讓 expiryDate 計算結果可預期
vi.mock("@/lib/date-utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/date-utils")>(
    "@/lib/date-utils",
  );
  return { ...actual, toLocalDateStr: () => "2026-05-03" };
});

const mockCustomerFindUnique = vi.fn();
const mockServicePlanFindUnique = vi.fn();
const mockWalletCreate = vi.fn();
const mockTransactionCreate = vi.fn();
const mockCustomerUpdate = vi.fn();
const mockTx = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: { findUnique: (...a: unknown[]) => mockCustomerFindUnique(...a) },
    servicePlan: { findUnique: (...a: unknown[]) => mockServicePlanFindUnique(...a) },
    customerPlanWallet: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
    transaction: { create: vi.fn() },
    $transaction: (cb: (tx: unknown) => Promise<unknown>) => mockTx(cb),
  },
}));

const mockRequireSession = vi.fn();
const mockRequirePermission = vi.fn();
const mockCheckPermission = vi.fn();
vi.mock("@/lib/session", () => ({
  requireSession: () => mockRequireSession(),
  getCurrentUser: () => mockRequireSession(),
}));
vi.mock("@/lib/permissions", () => ({
  requireWritablePermission: () => mockRequirePermission(),
  requirePermission: () => mockRequirePermission(),
  checkPermission: () => mockCheckPermission(),
}));
vi.mock("@/lib/store", () => ({
  currentStoreId: (u: { storeId?: string | null }) => u.storeId ?? STORE_A,
  DEFAULT_STORE_ID: "default-store",
  getActiveStoreForRead: vi.fn(),
}));
vi.mock("@/lib/manager-visibility", () => ({
  assertStoreAccess: vi.fn(),
  getStoreFilter: () => ({}),
}));
vi.mock("@/lib/transaction-snapshot", () => ({
  buildTransactionSnapshot: vi.fn(async () => ({})),
}));
vi.mock("@/server/services/referral-points", () => ({
  awardFirstTopupReferralPointsIfEligible: vi.fn(async () => undefined),
}));
vi.mock("@/server/services/customer-assignment", () => ({
  resolveCustomerStaffAssignment: vi.fn(async () => ({
    staffId: STAFF_ID,
    source: "existing",
  })),
}));
vi.mock("@/server/services/wallet-session", () => ({
  seedWalletSessions: vi.fn(async () => undefined),
  reconcileForManualAdjust: vi.fn(async () => undefined),
  voidAvailableSession: vi.fn(),
  WalletSessionError: class extends Error {},
}));
vi.mock("@/lib/store-context", () => ({ getStoreContext: vi.fn(async () => null) }));
vi.mock("@/server/queries/customer-completion", () => ({
  resolveCustomerForUser: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const PLAN_90D = {
  id: PLAN_ID_90D,
  storeId: STORE_A,
  isActive: true,
  category: "PACKAGE",
  price: 5000,
  sessionCount: 10,
  validityDays: 90,
};

const PLAN_NO_EXPIRY = {
  id: PLAN_ID_NO_EXPIRY,
  storeId: STORE_A,
  isActive: true,
  category: "PACKAGE",
  price: 5000,
  sessionCount: 10,
  validityDays: null,
};

const CUSTOMER = {
  id: CUSTOMER_ID,
  storeId: STORE_A,
  assignedStaffId: STAFF_ID,
  convertedAt: new Date("2025-01-01"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePermission.mockResolvedValue({
    role: "OWNER",
    storeId: STORE_A,
    staffId: STAFF_ID,
    id: OWNER_USER_ID,
    email: "owner@x.com",
  });
  mockCheckPermission.mockResolvedValue(true);
  mockCustomerFindUnique.mockResolvedValue(CUSTOMER);
  mockWalletCreate.mockImplementation(async (args: { data: { expiryDate: Date | null } }) => ({
    id: WALLET_ID,
    expiryDate: args.data.expiryDate,
  }));
  mockTransactionCreate.mockImplementation(async () => ({
    id: "ck0000000000000000000t01",
  }));
  mockCustomerUpdate.mockResolvedValue(undefined);
  mockTx.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      customerPlanWallet: { create: mockWalletCreate, update: vi.fn() },
      transaction: { create: mockTransactionCreate },
      customer: { update: mockCustomerUpdate, findUnique: vi.fn() },
    }),
  );
});

function expectExpiryDateISO(expected: string | null) {
  expect(mockWalletCreate).toHaveBeenCalledTimes(1);
  const created = mockWalletCreate.mock.calls[0][0].data.expiryDate as Date | null;
  if (expected === null) {
    expect(created).toBeNull();
    return;
  }
  expect(created).not.toBeNull();
  expect(created!.toISOString()).toBe(expected);
}

describe("assignPlanToCustomer — PLAN_DEFAULT", () => {
  it("does not modify the customer name while assigning a plan", async () => {
    mockServicePlanFindUnique.mockResolvedValue(PLAN_90D);
    const { assignPlanToCustomer } = await import("@/server/actions/wallet");

    const result = await assignPlanToCustomer({
      customerId: CUSTOMER_ID,
      planId: PLAN_ID_90D,
      paymentMethod: "CASH",
    });

    expect(result.success).toBe(true);
    expect(mockCustomerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ name: expect.anything() }),
      }),
    );
  });

  it("plan.validityDays=90 → 台灣今天 + 90 天 = 2026-08-01", async () => {
    mockServicePlanFindUnique.mockResolvedValue(PLAN_90D);
    const { assignPlanToCustomer } = await import("@/server/actions/wallet");
    const result = await assignPlanToCustomer({
      customerId: CUSTOMER_ID,
      planId: PLAN_ID_90D,
      paymentMethod: "CASH",
      // 不指定 expiryMode → schema default = PLAN_DEFAULT
    });
    expect(result.success).toBe(true);
    expectExpiryDateISO("2026-08-01T00:00:00.000Z");
  });

  it("plan.validityDays=null → expiryDate=null", async () => {
    mockServicePlanFindUnique.mockResolvedValue(PLAN_NO_EXPIRY);
    const { assignPlanToCustomer } = await import("@/server/actions/wallet");
    const result = await assignPlanToCustomer({
      customerId: CUSTOMER_ID,
      planId: PLAN_ID_NO_EXPIRY,
      paymentMethod: "CASH",
      expiryMode: "PLAN_DEFAULT",
    });
    expect(result.success).toBe(true);
    expectExpiryDateISO(null);
  });
});

describe("assignPlanToCustomer — staff payment status", () => {
  it("轉帳預設已確認，立即建立 wallet", async () => {
    mockServicePlanFindUnique.mockResolvedValue(PLAN_90D);
    const { assignPlanToCustomer } = await import("@/server/actions/wallet");
    const result = await assignPlanToCustomer({
      customerId: CUSTOMER_ID,
      planId: PLAN_ID_90D,
      paymentMethod: "TRANSFER",
    });

    expect(result.success).toBe(true);
    expect(mockWalletCreate).toHaveBeenCalled();
    expect(mockTransactionCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        paymentStatus: "SUCCESS",
        customerPlanWalletId: WALLET_ID,
        pendingWalletExpiryDateSnapshot: null,
      }),
    }));
  });

  it.each(["TRANSFER", "UNPAID"] as const)("%s 明確選擇尚待確認時不建立 wallet", async (paymentMethod) => {
    mockServicePlanFindUnique.mockResolvedValue(PLAN_90D);
    const { assignPlanToCustomer } = await import("@/server/actions/wallet");
    const result = await assignPlanToCustomer({
      customerId: CUSTOMER_ID,
      planId: PLAN_ID_90D,
      paymentMethod,
      paymentStatus: "PENDING",
    });

    expect(result.success).toBe(true);
    expect(mockWalletCreate).not.toHaveBeenCalled();
    expect(mockTransactionCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        paymentStatus: "PENDING",
        customerPlanWalletId: null,
        planId: PLAN_90D.id,
        planSessionCountSnapshot: PLAN_90D.sessionCount,
        pendingWalletExpiryDateSnapshot: expect.any(Date),
      }),
    }));
  });

  it("CUSTOM_DURATION 將已解析的確切到期日封存到待付款交易", async () => {
    mockServicePlanFindUnique.mockResolvedValue(PLAN_90D);
    const { assignPlanToCustomer } = await import("@/server/actions/wallet");
    await assignPlanToCustomer({
      customerId: CUSTOMER_ID,
      planId: PLAN_ID_90D,
      paymentMethod: "TRANSFER",
      paymentStatus: "PENDING",
      expiryMode: "CUSTOM_DURATION",
      customExpiryValue: 6,
      customExpiryUnit: "MONTH",
    });
    expect(mockTransactionCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        pendingWalletExpiryDateSnapshot: new Date("2026-11-03T00:00:00.000Z"),
      }),
    }));
  });

  it("CUSTOM_DATE 將店長指定日期封存到待付款交易", async () => {
    mockServicePlanFindUnique.mockResolvedValue(PLAN_90D);
    const { assignPlanToCustomer } = await import("@/server/actions/wallet");
    await assignPlanToCustomer({
      customerId: CUSTOMER_ID,
      planId: PLAN_ID_90D,
      paymentMethod: "UNPAID",
      paymentStatus: "PENDING",
      expiryMode: "CUSTOM_DATE",
      customExpiryDate: "2026-12-31",
    });
    expect(mockTransactionCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        pendingWalletExpiryDateSnapshot: new Date("2026-12-31T00:00:00.000Z"),
      }),
    }));
  });
});

describe("assignPlanToCustomer — CUSTOM_DURATION", () => {
  beforeEach(() => mockServicePlanFindUnique.mockResolvedValue(PLAN_90D));

  it("自訂 30 天 → 2026-06-02", async () => {
    const { assignPlanToCustomer } = await import("@/server/actions/wallet");
    const result = await assignPlanToCustomer({
      customerId: CUSTOMER_ID,
      planId: PLAN_ID_90D,
      paymentMethod: "CASH",
      expiryMode: "CUSTOM_DURATION",
      customExpiryValue: 30,
      customExpiryUnit: "DAY",
    });
    expect(result.success).toBe(true);
    expectExpiryDateISO("2026-06-02T00:00:00.000Z");
  });

  it("自訂 8 週 → 2026-06-28", async () => {
    const { assignPlanToCustomer } = await import("@/server/actions/wallet");
    const result = await assignPlanToCustomer({
      customerId: CUSTOMER_ID,
      planId: PLAN_ID_90D,
      paymentMethod: "CASH",
      expiryMode: "CUSTOM_DURATION",
      customExpiryValue: 8,
      customExpiryUnit: "WEEK",
    });
    expect(result.success).toBe(true);
    expectExpiryDateISO("2026-06-28T00:00:00.000Z");
  });

  it("自訂 6 個月 → 2026-11-03", async () => {
    const { assignPlanToCustomer } = await import("@/server/actions/wallet");
    const result = await assignPlanToCustomer({
      customerId: CUSTOMER_ID,
      planId: PLAN_ID_90D,
      paymentMethod: "CASH",
      expiryMode: "CUSTOM_DURATION",
      customExpiryValue: 6,
      customExpiryUnit: "MONTH",
    });
    expect(result.success).toBe(true);
    expectExpiryDateISO("2026-11-03T00:00:00.000Z");
  });

  it("value <= 0 → schema 拒絕", async () => {
    const { assignPlanToCustomer } = await import("@/server/actions/wallet");
    const result = await assignPlanToCustomer({
      customerId: CUSTOMER_ID,
      planId: PLAN_ID_90D,
      paymentMethod: "CASH",
      expiryMode: "CUSTOM_DURATION",
      customExpiryValue: 0,
      customExpiryUnit: "DAY",
    });
    expect(result.success).toBe(false);
    expect(mockWalletCreate).not.toHaveBeenCalled();
  });
});

describe("assignPlanToCustomer — CUSTOM_DATE", () => {
  beforeEach(() => mockServicePlanFindUnique.mockResolvedValue(PLAN_90D));

  it("指定 2026-07-15（紙本卡核心情境）→ DB 寫入後回讀不少 1 天", async () => {
    const { assignPlanToCustomer } = await import("@/server/actions/wallet");
    const result = await assignPlanToCustomer({
      customerId: CUSTOMER_ID,
      planId: PLAN_ID_90D,
      paymentMethod: "CASH",
      expiryMode: "CUSTOM_DATE",
      customExpiryDate: "2026-07-15",
    });
    expect(result.success).toBe(true);
    expectExpiryDateISO("2026-07-15T00:00:00.000Z");
    // 確認回讀仍是 7/15，不會因 UTC 偏移變 7/14
    const written = mockWalletCreate.mock.calls[0][0].data.expiryDate as Date;
    expect(written.toISOString().slice(0, 10)).toBe("2026-07-15");
  });

  it("指定 = 台灣今天 → 接受", async () => {
    const { assignPlanToCustomer } = await import("@/server/actions/wallet");
    const result = await assignPlanToCustomer({
      customerId: CUSTOMER_ID,
      planId: PLAN_ID_90D,
      paymentMethod: "CASH",
      expiryMode: "CUSTOM_DATE",
      customExpiryDate: "2026-05-03", // 等於模擬的台灣今天
    });
    expect(result.success).toBe(true);
    expectExpiryDateISO("2026-05-03T00:00:00.000Z");
  });

  it("指定早於台灣今天 → 拒絕", async () => {
    const { assignPlanToCustomer } = await import("@/server/actions/wallet");
    const result = await assignPlanToCustomer({
      customerId: CUSTOMER_ID,
      planId: PLAN_ID_90D,
      paymentMethod: "CASH",
      expiryMode: "CUSTOM_DATE",
      customExpiryDate: "2026-05-02", // 昨天
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/不可早於今天/);
    }
    expect(mockWalletCreate).not.toHaveBeenCalled();
  });

  it("缺 customExpiryDate → schema 拒絕", async () => {
    const { assignPlanToCustomer } = await import("@/server/actions/wallet");
    const result = await assignPlanToCustomer({
      customerId: CUSTOMER_ID,
      planId: PLAN_ID_90D,
      paymentMethod: "CASH",
      expiryMode: "CUSTOM_DATE",
      // customExpiryDate 沒帶
    });
    expect(result.success).toBe(false);
    expect(mockWalletCreate).not.toHaveBeenCalled();
  });
});

describe("assignPlanToCustomer — 其他不變", () => {
  it("rejects cross-store customer + plan writes before creating wallet or transaction", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      ...CUSTOMER,
      storeId: "store-hsinchu",
    });
    mockServicePlanFindUnique.mockResolvedValue(PLAN_90D);
    const { assignPlanToCustomer } = await import("@/server/actions/wallet");
    const result = await assignPlanToCustomer({
      customerId: CUSTOMER_ID,
      planId: PLAN_ID_90D,
      paymentMethod: "CASH",
      expiryMode: "PLAN_DEFAULT",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("STORE_CONSISTENCY_MISMATCH");
    }
    expect(mockWalletCreate).not.toHaveBeenCalled();
    expect(mockTransactionCreate).not.toHaveBeenCalled();
  });

  it("rejects cross-store plan even when the customer belongs to the operation store", async () => {
    mockServicePlanFindUnique.mockResolvedValue({
      ...PLAN_90D,
      storeId: "store-hsinchu",
    });
    const { assignPlanToCustomer } = await import("@/server/actions/wallet");
    const result = await assignPlanToCustomer({
      customerId: CUSTOMER_ID,
      planId: PLAN_ID_90D,
      paymentMethod: "CASH",
      expiryMode: "PLAN_DEFAULT",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("STORE_CONSISTENCY_MISMATCH");
    }
    expect(mockWalletCreate).not.toHaveBeenCalled();
    expect(mockTransactionCreate).not.toHaveBeenCalled();
  });

  it("seedWalletSessions 仍以 plan.sessionCount 建立明細（不受 expiry 模式影響）", async () => {
    mockServicePlanFindUnique.mockResolvedValue(PLAN_90D);
    const { seedWalletSessions } = await import("@/server/services/wallet-session");
    const { assignPlanToCustomer } = await import("@/server/actions/wallet");
    await assignPlanToCustomer({
      customerId: CUSTOMER_ID,
      planId: PLAN_ID_90D,
      paymentMethod: "CASH",
      expiryMode: "CUSTOM_DATE",
      customExpiryDate: "2026-12-31",
    });
    expect(seedWalletSessions).toHaveBeenCalledTimes(1);
    expect((seedWalletSessions as ReturnType<typeof vi.fn>).mock.calls[0][2]).toBe(
      PLAN_90D.sessionCount,
    );
  });
});
