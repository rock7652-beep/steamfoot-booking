/**
 * migratePaperPlan — 紙本舊客轉入線上 server action 驗收
 *
 * 對應規格：docs/staff-settlement-phase1-spec.md §3.7.9
 *
 * 覆蓋面：
 *  1. 護欄
 *     - 權限：wallet.adjust 必備 + 必須 OWNER 或 ADMIN
 *     - 顧客不存在 / 方案不存在 / 方案跨店 → 拒絕
 *  2. Schema 驗證
 *     - usedSessions > totalSessions → 拒絕
 *     - originalAmount 負數 → 拒絕
 *     - expiryDate 無效（2026-02-31）→ 拒絕
 *     - expiryDate 可為 null / undefined
 *  3. 副作用
 *     - 建立 wallet：purchasedPrice = originalAmount、totalSessions / remainingSessions 正確
 *     - seedWalletSessions 用 totalSessions 呼叫
 *     - usedSessions > 0 → backfillAvailableSessions 用正確 count 呼叫
 *     - usedSessions = 0 → backfillAvailableSessions 不被呼叫
 *     - usedSessions = totalSessions → 全部 BACKFILLED（remainingSessions 經 service 後 = 0）
 *     - 建立 PAPER_MIGRATION transaction：amount/quantity/paidAt/paymentMethod 正確
 *     - 寫入 AuditLog(action="PAPER_MIGRATION")
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const STORE_A = "store-zhubei";
const STORE_B = "store-hsinchu";
const CUSTOMER_ID = "ck0000000000000000000c01";
const PLAN_ID = "ck0000000000000000000p01";
const PLAN_ID_OTHER_STORE = "ck0000000000000000000p02";
const STAFF_ID = "ck0000000000000000000s01";
const OWNER_USER_ID = "ck0000000000000000000u01";
const WALLET_ID = "ck0000000000000000000w01";
const TX_ID = "ck0000000000000000000t01";

// 固定「台灣今天 = 2026-05-13」讓 occurredAt 計算結果可預期
vi.mock("@/lib/date-utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/date-utils")>(
    "@/lib/date-utils",
  );
  return { ...actual, toLocalDateStr: () => "2026-05-13" };
});

// ── Prisma 主庫 mock（top-level prisma.* 呼叫）──
const mockCustomerFindUnique = vi.fn();
const mockServicePlanFindUnique = vi.fn();
const mockTx = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: { findUnique: (...a: unknown[]) => mockCustomerFindUnique(...a) },
    servicePlan: { findUnique: (...a: unknown[]) => mockServicePlanFindUnique(...a) },
    customerPlanWallet: { create: vi.fn(), findUnique: vi.fn() },
    transaction: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: (cb: (tx: unknown) => Promise<unknown>) => mockTx(cb),
  },
}));

// ── Session / Permission mock ──
const mockRequireSession = vi.fn();
const mockRequirePermission = vi.fn();
const mockCheckPermission = vi.fn();
vi.mock("@/lib/session", () => ({
  requireSession: () => mockRequireSession(),
  getCurrentUser: () => mockRequireSession(),
}));
vi.mock("@/lib/permissions", () => ({
  requirePermission: (...a: unknown[]) => mockRequirePermission(...a),
  checkPermission: () => mockCheckPermission(),
}));

vi.mock("@/lib/store", () => ({
  currentStoreId: (u: { storeId?: string | null }) => u.storeId ?? STORE_A,
  DEFAULT_STORE_ID: "default-store",
  getActiveStoreForRead: vi.fn(),
}));

const mockAssertStoreAccess = vi.fn();
vi.mock("@/lib/manager-visibility", () => ({
  assertStoreAccess: (...a: unknown[]) => mockAssertStoreAccess(...a),
  getStoreFilter: () => ({}),
}));

vi.mock("@/lib/transaction-snapshot", () => ({
  buildTransactionSnapshot: vi.fn(async () => ({
    transactionNo: "TXN-20260513-001",
    transactionDate: new Date("2026-05-13T00:00:00.000Z"),
    status: "SUCCESS" as const,
    coachNameSnapshot: "Mock Coach",
    coachRoleSnapshot: "OWNER",
    storeNameSnapshot: "竹北店",
    planId: PLAN_ID,
    planNameSnapshot: "Mock Plan",
    planType: "PACKAGE",
    grossAmount: 0,
    discountAmount: 0,
    netAmount: 0,
    isFirstPurchase: false,
  })),
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

// ── wallet-session service mocks（被 server action 呼叫）──
// 故意 vi.fn() 不帶初始 impl，避免 TS 把 call signature 推成 ()=>... 導致 ...a spread 報錯。
// 預設成功實作在 beforeEach 中以 mockResolvedValue 設定。
const mockSeedWalletSessions = vi.fn();
const mockBackfillAvailableSessions = vi.fn();
class WalletSessionErrorMock extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "WalletSessionError";
  }
}
vi.mock("@/server/services/wallet-session", () => ({
  seedWalletSessions: (...a: unknown[]) => mockSeedWalletSessions(...a),
  backfillAvailableSessions: (...a: unknown[]) => mockBackfillAvailableSessions(...a),
  reconcileForManualAdjust: vi.fn(async () => undefined),
  voidAvailableSession: vi.fn(),
  WalletSessionError: WalletSessionErrorMock,
}));

vi.mock("@/lib/store-context", () => ({ getStoreContext: vi.fn(async () => null) }));
vi.mock("@/server/queries/customer-completion", () => ({
  resolveCustomerForUser: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// ── Tx-scope mocks (within prisma.$transaction(cb))──
const mockWalletCreate = vi.fn();
const mockTransactionCreate = vi.fn();
const mockAuditLogCreate = vi.fn();
const mockWalletFindUnique = vi.fn();

const PLAN = {
  id: PLAN_ID,
  storeId: STORE_A,
  category: "PACKAGE",
};

const PLAN_OTHER_STORE = {
  id: PLAN_ID_OTHER_STORE,
  storeId: STORE_B,
  category: "PACKAGE",
};

const CUSTOMER = {
  id: CUSTOMER_ID,
  storeId: STORE_A,
  assignedStaffId: STAFF_ID,
};

beforeEach(() => {
  vi.clearAllMocks();
  // vi.clearAllMocks() 只清 call history、不清 mockResolvedValue/mockRejectedValue。
  // 「backfill 失敗 → rollback」測試用 mockRejectedValue 改了 backfill 行為，
  // 若不還原，下個 it 也會繼承 → 顯式 reset + 設預設成功實作。
  mockSeedWalletSessions.mockReset();
  mockSeedWalletSessions.mockResolvedValue(undefined);
  mockBackfillAvailableSessions.mockReset();
  mockBackfillAvailableSessions.mockResolvedValue({ backfilledSessionNos: [] });

  // 預設：OWNER 通過 requirePermission("wallet.adjust")
  mockRequirePermission.mockResolvedValue({
    role: "OWNER",
    storeId: STORE_A,
    staffId: STAFF_ID,
    id: OWNER_USER_ID,
    email: "owner@x.com",
  });
  mockCheckPermission.mockResolvedValue(true);
  mockAssertStoreAccess.mockReturnValue(undefined);

  mockCustomerFindUnique.mockResolvedValue(CUSTOMER);
  mockServicePlanFindUnique.mockResolvedValue(PLAN);

  // wallet.create 回傳一個假 wallet（id 寫死，方便後續斷言）
  mockWalletCreate.mockImplementation(
    async (args: { data: { totalSessions: number; remainingSessions: number; purchasedPrice: number; expiryDate: Date | null } }) => ({
      id: WALLET_ID,
      totalSessions: args.data.totalSessions,
      remainingSessions: args.data.remainingSessions,
      purchasedPrice: args.data.purchasedPrice,
      expiryDate: args.data.expiryDate,
    }),
  );

  mockTransactionCreate.mockImplementation(async () => ({ id: TX_ID }));
  mockAuditLogCreate.mockImplementation(async () => ({ id: "ck0audit0000000000001" }));

  // wallet.findUnique within tx (回傳 refreshWalletCounter 之後的 remaining)
  // 預設：未指定 → 用呼叫時 totalSessions - usedSessions（由各測試覆寫）
  mockWalletFindUnique.mockResolvedValue({ remainingSessions: 0 });

  mockTx.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      customerPlanWallet: {
        create: mockWalletCreate,
        findUnique: mockWalletFindUnique,
        update: vi.fn(),
      },
      transaction: { create: mockTransactionCreate },
      auditLog: { create: mockAuditLogCreate },
      customer: { update: vi.fn(), findUnique: vi.fn() },
    }),
  );
});

const baseInput = {
  customerId: CUSTOMER_ID,
  planId: PLAN_ID,
  originalAmount: 12000,
  totalSessions: 22,
  usedSessions: 10,
  expiryDate: "2026-12-31",
};

describe("migratePaperPlan — 護欄", () => {
  it("非 OWNER / ADMIN（PARTNER 即使有 wallet.adjust）→ FORBIDDEN", async () => {
    mockRequirePermission.mockResolvedValue({
      role: "PARTNER",
      storeId: STORE_A,
      staffId: STAFF_ID,
      id: "ck0000000000000000000u02",
      email: "partner@x.com",
    });
    const { migratePaperPlan } = await import("@/server/actions/wallet");
    const result = await migratePaperPlan(baseInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/僅限店長|系統管理者/);
    }
    expect(mockWalletCreate).not.toHaveBeenCalled();
  });

  it("ADMIN 通過 role 檢查（即使 user.storeId 為 null）", async () => {
    mockRequirePermission.mockResolvedValue({
      role: "ADMIN",
      storeId: null,
      staffId: null,
      id: "ck0000000000000000000ad1",
      email: "admin@x.com",
    });
    const { migratePaperPlan } = await import("@/server/actions/wallet");
    const result = await migratePaperPlan({ ...baseInput, usedSessions: 0 });
    expect(result.success).toBe(true);
    // storeId 用 customer.storeId（不是 user.storeId）
    expect(mockWalletCreate).toHaveBeenCalledTimes(1);
    expect(mockWalletCreate.mock.calls[0][0].data.storeId).toBe(STORE_A);
  });

  it("顧客不存在 → NOT_FOUND", async () => {
    mockCustomerFindUnique.mockResolvedValue(null);
    const { migratePaperPlan } = await import("@/server/actions/wallet");
    const result = await migratePaperPlan(baseInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/顧客不存在/);
    }
    expect(mockWalletCreate).not.toHaveBeenCalled();
  });

  it("方案不存在 → NOT_FOUND", async () => {
    mockServicePlanFindUnique.mockResolvedValue(null);
    const { migratePaperPlan } = await import("@/server/actions/wallet");
    const result = await migratePaperPlan(baseInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/課程方案不存在/);
    }
    expect(mockWalletCreate).not.toHaveBeenCalled();
  });

  it("方案屬於別店 → FORBIDDEN", async () => {
    mockServicePlanFindUnique.mockResolvedValue(PLAN_OTHER_STORE);
    const { migratePaperPlan } = await import("@/server/actions/wallet");
    const result = await migratePaperPlan({ ...baseInput, planId: PLAN_ID_OTHER_STORE });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/方案不屬於本顧客所在店家/);
    }
    expect(mockWalletCreate).not.toHaveBeenCalled();
  });
});

describe("migratePaperPlan — Schema 驗證", () => {
  it("usedSessions > totalSessions → 拒絕（schema superRefine）", async () => {
    const { migratePaperPlan } = await import("@/server/actions/wallet");
    const result = await migratePaperPlan({
      ...baseInput,
      totalSessions: 10,
      usedSessions: 11,
    });
    expect(result.success).toBe(false);
    expect(mockWalletCreate).not.toHaveBeenCalled();
  });

  it("originalAmount 為負數 → 拒絕", async () => {
    const { migratePaperPlan } = await import("@/server/actions/wallet");
    const result = await migratePaperPlan({ ...baseInput, originalAmount: -1 });
    expect(result.success).toBe(false);
    expect(mockWalletCreate).not.toHaveBeenCalled();
  });

  it("originalAmount = 0 → 接受（免費卡 / 試用紙本）", async () => {
    const { migratePaperPlan } = await import("@/server/actions/wallet");
    const result = await migratePaperPlan({
      ...baseInput,
      originalAmount: 0,
      usedSessions: 0,
    });
    expect(result.success).toBe(true);
    expect(mockWalletCreate.mock.calls[0][0].data.purchasedPrice).toBe(0);
  });

  it("totalSessions = 0 → 拒絕（需正整數）", async () => {
    const { migratePaperPlan } = await import("@/server/actions/wallet");
    const result = await migratePaperPlan({
      ...baseInput,
      totalSessions: 0,
      usedSessions: 0,
    });
    expect(result.success).toBe(false);
    expect(mockWalletCreate).not.toHaveBeenCalled();
  });

  it("usedSessions < 0 → 拒絕", async () => {
    const { migratePaperPlan } = await import("@/server/actions/wallet");
    const result = await migratePaperPlan({ ...baseInput, usedSessions: -1 });
    expect(result.success).toBe(false);
    expect(mockWalletCreate).not.toHaveBeenCalled();
  });

  it("expiryDate 格式錯誤 → 拒絕", async () => {
    const { migratePaperPlan } = await import("@/server/actions/wallet");
    const result = await migratePaperPlan({ ...baseInput, expiryDate: "2026/12/31" });
    expect(result.success).toBe(false);
    expect(mockWalletCreate).not.toHaveBeenCalled();
  });

  it("expiryDate 非真實日曆日（2026-02-31）→ 拒絕", async () => {
    const { migratePaperPlan } = await import("@/server/actions/wallet");
    const result = await migratePaperPlan({ ...baseInput, expiryDate: "2026-02-31" });
    expect(result.success).toBe(false);
    expect(mockWalletCreate).not.toHaveBeenCalled();
  });

  it("expiryDate 為 null → 接受（紙本卡無期限）", async () => {
    const { migratePaperPlan } = await import("@/server/actions/wallet");
    const result = await migratePaperPlan({
      ...baseInput,
      expiryDate: null,
      usedSessions: 0,
    });
    expect(result.success).toBe(true);
    expect(mockWalletCreate.mock.calls[0][0].data.expiryDate).toBeNull();
  });

  it("expiryDate 不傳 → 接受", async () => {
    const { migratePaperPlan } = await import("@/server/actions/wallet");
    const { expiryDate: _expiry, ...rest } = baseInput;
    void _expiry;
    const result = await migratePaperPlan({ ...rest, usedSessions: 0 });
    expect(result.success).toBe(true);
    expect(mockWalletCreate.mock.calls[0][0].data.expiryDate).toBeNull();
  });

  it("expiryDate 早於今天 → 接受（已過期紙本卡也允許入帳留紀錄）", async () => {
    const { migratePaperPlan } = await import("@/server/actions/wallet");
    const result = await migratePaperPlan({
      ...baseInput,
      expiryDate: "2024-01-01",
      usedSessions: 0,
    });
    expect(result.success).toBe(true);
    // 寫進 wallet 的日期應該就是 2024-01-01（UTC midnight）
    const written = mockWalletCreate.mock.calls[0][0].data.expiryDate as Date;
    expect(written.toISOString().slice(0, 10)).toBe("2024-01-01");
  });
});

describe("migratePaperPlan — 副作用：wallet + sessions", () => {
  it("usedSessions = 0 → seedWalletSessions(totalSessions)、不呼叫 backfill", async () => {
    const { migratePaperPlan } = await import("@/server/actions/wallet");
    const result = await migratePaperPlan({
      ...baseInput,
      totalSessions: 22,
      usedSessions: 0,
    });
    expect(result.success).toBe(true);
    expect(mockSeedWalletSessions).toHaveBeenCalledTimes(1);
    // 第三個參數是 totalSessions
    const seedArgs = mockSeedWalletSessions.mock.calls[0] as unknown[];
    expect(seedArgs[2]).toBe(22);
    expect(mockBackfillAvailableSessions).not.toHaveBeenCalled();
  });

  it("usedSessions > 0 → backfillAvailableSessions 用正確 count + reason 呼叫", async () => {
    mockWalletFindUnique.mockResolvedValue({ remainingSessions: 12 });
    const { migratePaperPlan } = await import("@/server/actions/wallet");
    const result = await migratePaperPlan({
      ...baseInput,
      totalSessions: 22,
      usedSessions: 10,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.remainingSessions).toBe(12);
    }
    expect(mockBackfillAvailableSessions).toHaveBeenCalledTimes(1);
    const backfillCall = mockBackfillAvailableSessions.mock.calls[0] as unknown[];
    const params = backfillCall[1] as {
      walletId: string;
      count: number;
      reason: string;
      operatorStaffId: string;
      occurredAt: Date;
    };
    expect(params.walletId).toBe(WALLET_ID);
    expect(params.count).toBe(10);
    expect(params.reason).toMatch(/紙本轉入：10\/22 堂於轉入前已使用/);
    expect(params.operatorStaffId).toBe(STAFF_ID);
    // occurredAt = 2026-05-13 UTC midnight
    expect(params.occurredAt.toISOString().slice(0, 10)).toBe("2026-05-13");
  });

  it("usedSessions = totalSessions → 全部 BACKFILLED、wallet remaining = 0", async () => {
    mockWalletFindUnique.mockResolvedValue({ remainingSessions: 0 });
    const { migratePaperPlan } = await import("@/server/actions/wallet");
    const result = await migratePaperPlan({
      ...baseInput,
      totalSessions: 22,
      usedSessions: 22,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.remainingSessions).toBe(0);
    }
    expect(mockBackfillAvailableSessions).toHaveBeenCalledTimes(1);
    const backfillCall2 = mockBackfillAvailableSessions.mock.calls[0] as unknown[];
    expect((backfillCall2[1] as { count: number }).count).toBe(22);
  });

  it("wallet.create 寫入：purchasedPrice=originalAmount、totalSessions=原始、remainingSessions=total-used", async () => {
    const { migratePaperPlan } = await import("@/server/actions/wallet");
    await migratePaperPlan({
      ...baseInput,
      originalAmount: 12000,
      totalSessions: 22,
      usedSessions: 10,
    });
    expect(mockWalletCreate).toHaveBeenCalledTimes(1);
    const data = mockWalletCreate.mock.calls[0][0].data;
    expect(data.purchasedPrice).toBe(12000);
    expect(data.totalSessions).toBe(22);
    expect(data.remainingSessions).toBe(12);
    expect(data.status).toBe("ACTIVE");
    expect(data.customerId).toBe(CUSTOMER_ID);
    expect(data.planId).toBe(PLAN_ID);
    expect(data.storeId).toBe(STORE_A);
  });

  it("backfill 失敗 → 全 transaction rollback（wallet/tx/audit 都不留）", async () => {
    mockBackfillAvailableSessions.mockRejectedValue(
      new WalletSessionErrorMock("VALIDATION", "可用堂數不足"),
    );
    // 讓 $transaction 把錯誤丟出來（模擬 Prisma rollback）
    mockTx.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      try {
        return await cb({
          customerPlanWallet: {
            create: mockWalletCreate,
            findUnique: mockWalletFindUnique,
            update: vi.fn(),
          },
          transaction: { create: mockTransactionCreate },
          auditLog: { create: mockAuditLogCreate },
          customer: { update: vi.fn(), findUnique: vi.fn() },
        });
      } catch (e) {
        throw e;
      }
    });

    const { migratePaperPlan } = await import("@/server/actions/wallet");
    const result = await migratePaperPlan({
      ...baseInput,
      totalSessions: 22,
      usedSessions: 10,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/可用堂數不足/);
    }
    // wallet.create 被嘗試（在 tx 內，rollback 由 Prisma 處理），
    // 但 transaction.create 與 auditLog.create 一定不會被執行
    expect(mockTransactionCreate).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });
});

describe("migratePaperPlan — 副作用：PAPER_MIGRATION transaction", () => {
  it("交易型別 / 欄位正確", async () => {
    const { migratePaperPlan } = await import("@/server/actions/wallet");
    await migratePaperPlan({
      ...baseInput,
      originalAmount: 12000,
      totalSessions: 22,
      usedSessions: 10,
      note: "竹北紙本 #88",
    });
    expect(mockTransactionCreate).toHaveBeenCalledTimes(1);
    const data = mockTransactionCreate.mock.calls[0][0].data;
    expect(data.transactionType).toBe("PAPER_MIGRATION");
    expect(data.paymentMethod).toBe("CASH"); // 形式必填；不入現金帳由 type 隔離
    expect(data.paymentStatus).toBe("SUCCESS");
    expect(data.paidAt).toBeNull(); // 非今日新收款
    expect(data.amount).toBe(12000);
    expect(data.quantity).toBe(22); // 原始總堂數
    expect(data.customerId).toBe(CUSTOMER_ID);
    expect(data.customerPlanWalletId).toBe(WALLET_ID);
    expect(data.storeId).toBe(STORE_A);
    expect(data.revenueStaffId).toBe(STAFF_ID); // 來自 customer.assignedStaffId
    expect(data.soldByStaffId).toBe(STAFF_ID); // 操作員 staff
    expect(data.note).toMatch(/紙本轉入：原價 12000 元 \/ 共 22 堂/);
    expect(data.note).toMatch(/轉入前已用 10 堂/);
    expect(data.note).toMatch(/備註：竹北紙本 #88/);
  });

  it("usedSessions = 0 → note 不含「轉入前已用 X 堂」", async () => {
    const { migratePaperPlan } = await import("@/server/actions/wallet");
    await migratePaperPlan({ ...baseInput, usedSessions: 0 });
    const data = mockTransactionCreate.mock.calls[0][0].data;
    expect(data.note).not.toMatch(/轉入前已用/);
  });

  it("note 未填 → 不含「（備註：...）」段", async () => {
    const { migratePaperPlan } = await import("@/server/actions/wallet");
    // baseInput 沒有 note 欄位（type 推斷）；直接傳 baseInput 即可驗證
    await migratePaperPlan(baseInput);
    const data = mockTransactionCreate.mock.calls[0][0].data;
    expect(data.note).not.toMatch(/備註：/);
  });

  it("customer.assignedStaffId 為 null → revenueStaffId fallback user.staffId", async () => {
    mockCustomerFindUnique.mockResolvedValue({
      ...CUSTOMER,
      assignedStaffId: null,
    });
    const { migratePaperPlan } = await import("@/server/actions/wallet");
    await migratePaperPlan({ ...baseInput, usedSessions: 0 });
    const data = mockTransactionCreate.mock.calls[0][0].data;
    expect(data.revenueStaffId).toBe(STAFF_ID);
  });
});

describe("migratePaperPlan — 副作用：AuditLog", () => {
  it("寫入 action=PAPER_MIGRATION，afterJson 完整", async () => {
    const { migratePaperPlan } = await import("@/server/actions/wallet");
    await migratePaperPlan({
      ...baseInput,
      originalAmount: 12000,
      totalSessions: 22,
      usedSessions: 10,
      expiryDate: "2026-12-31",
      note: "test note",
    });
    expect(mockAuditLogCreate).toHaveBeenCalledTimes(1);
    const data = mockAuditLogCreate.mock.calls[0][0].data;
    expect(data.action).toBe("PAPER_MIGRATION");
    expect(data.targetType).toBe("CustomerPlanWallet");
    expect(data.targetId).toBe(WALLET_ID);
    expect(data.actorUserId).toBe(OWNER_USER_ID);
    expect(data.afterJson).toEqual({
      customerId: CUSTOMER_ID,
      planId: PLAN_ID,
      originalAmount: 12000,
      totalSessions: 22,
      usedSessions: 10,
      remainingSessions: 12,
      expiryDate: "2026-12-31",
      note: "test note",
    });
  });
});
