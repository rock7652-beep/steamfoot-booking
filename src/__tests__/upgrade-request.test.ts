/**
 * 方案升級 — Store.plan 唯一真相驗證
 *
 * 6 組驗收場景：
 * 1. 手動 BASIC → GROWTH（基礎版 → 專業版）
 * 2. 手動 GROWTH → BASIC（專業版 → 基礎版）
 * 3. 試用開通（adminStartTrial）
 * 4. 試用到期（processExpiredTrials）
 * 5. 升級申請審核通過（reviewUpgradeRequest UPGRADE）
 * 6. 付款確認後生效（confirmUpgradePayment）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── 追蹤所有 DB 寫入 ──
const storeUpdate = vi.fn();
const storeSubscriptionCreate = vi.fn().mockResolvedValue({ id: "sub-1" });
const storeSubscriptionUpdate = vi.fn();
const storePlanChangeCreate = vi.fn();
const upgradeRequestUpdate = vi.fn();
const upgradeRequestFindUnique = vi.fn();
const upgradeRequestFindFirst = vi.fn();
const storeFindUnique = vi.fn();
const storeFindMany = vi.fn();

// 建立 transaction proxy：所有 tx.xxx 呼叫導向同一組 mock
const txProxy = {
  store: { findUnique: storeFindUnique, update: storeUpdate },
  storeSubscription: {
    create: storeSubscriptionCreate,
    update: storeSubscriptionUpdate,
    findUnique: vi.fn(),
  },
  storePlanChange: { create: storePlanChangeCreate },
  upgradeRequest: {
    findUnique: upgradeRequestFindUnique,
    findFirst: upgradeRequestFindFirst,
    update: upgradeRequestUpdate,
    create: vi.fn(),
  },
};

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: typeof txProxy) => Promise<void>) => fn(txProxy)),
    store: {
      findUnique: storeFindUnique,
      findMany: storeFindMany,
      update: storeUpdate,
    },
    storeSubscription: {
      create: storeSubscriptionCreate,
      update: storeSubscriptionUpdate,
      findUnique: vi.fn(),
    },
    storePlanChange: { create: storePlanChangeCreate },
    upgradeRequest: {
      findUnique: upgradeRequestFindUnique,
      findFirst: upgradeRequestFindFirst,
      update: upgradeRequestUpdate,
    },
  },
}));

vi.mock("@/lib/session", () => ({
  requireAdminSession: vi.fn().mockResolvedValue({ id: "admin-1", role: "ADMIN" }),
  requireStaffSession: vi.fn().mockResolvedValue({ id: "admin-1", role: "ADMIN", storeId: "store-1" }),
}));

vi.mock("@/lib/store", () => ({
  currentStoreId: vi.fn().mockReturnValue("store-1"),
  DEFAULT_STORE_ID: "store-1",
}));

vi.mock("@/lib/errors", () => ({
  AppError: class AppError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock("@/lib/revalidation", () => ({
  revalidateStorePlan: vi.fn(),
  revalidateShopConfig: vi.fn(),
}));

vi.mock("@/lib/feature-flags", () => ({
  PRICING_PLAN_INFO: {
    EXPERIENCE: { label: "體驗版" },
    BASIC: { label: "基礎版" },
    GROWTH: { label: "專業版" },
    ALLIANCE: { label: "聯盟版" },
  },
}));

vi.mock("next/cache", () => ({
  updateTag: vi.fn(),
}));

vi.mock("react", () => ({ cache: (fn: Function) => fn }));

// ── Helpers ──

/** 驗證 store.update 被呼叫且 plan 正確 */
function expectStoreUpdated(storeId: string, expectedPlan: string) {
  const calls = storeUpdate.mock.calls;
  const match = calls.find(
    (c: unknown[]) =>
      (c[0] as { where: { id: string } }).where.id === storeId &&
      (c[0] as { data: { plan: string } }).data.plan === expectedPlan,
  );
  expect(match).toBeTruthy();
}

beforeEach(() => {
  vi.clearAllMocks();
  storeSubscriptionCreate.mockResolvedValue({ id: "sub-1" });
});

// ============================================================
// 1. 手動 BASIC → GROWTH（基礎版 → 專業版）
// ============================================================

describe("1. 手動基礎版 → 專業版 (adminChangeStorePlan)", () => {
  it("Store.plan = GROWTH", async () => {
    storeFindUnique.mockResolvedValue({ plan: "BASIC", planStatus: "ACTIVE" });

    const { adminChangeStorePlan } = await import("@/server/actions/upgrade-request");
    const result = await adminChangeStorePlan({
      storeId: "store-1",
      newPlan: "GROWTH",
      reason: "測試升級",
    });

    expect(result.success).toBe(true);
    expectStoreUpdated("store-1", "GROWTH");
  });
});

// ============================================================
// 2. 手動 GROWTH → BASIC（專業版 → 基礎版）
// ============================================================

describe("2. 手動專業版 → 基礎版 (adminChangeStorePlan)", () => {
  it("Store.plan = BASIC", async () => {
    storeFindUnique.mockResolvedValue({ plan: "GROWTH", planStatus: "ACTIVE" });

    const { adminChangeStorePlan } = await import("@/server/actions/upgrade-request");
    const result = await adminChangeStorePlan({
      storeId: "store-1",
      newPlan: "BASIC",
      reason: "測試降級",
    });

    expect(result.success).toBe(true);
    expectStoreUpdated("store-1", "BASIC");
  });
});

// ============================================================
// 3. 試用開通 (adminStartTrial)
// ============================================================

describe("3. 試用開通 (adminStartTrial)", () => {
  it("Store.plan = trialPlan", async () => {
    storeFindUnique.mockResolvedValue({ plan: "EXPERIENCE", planStatus: "ACTIVE" });

    const { adminStartTrial } = await import("@/server/actions/upgrade-request");
    const result = await adminStartTrial({
      storeId: "store-1",
      trialPlan: "GROWTH",
      trialDays: 14,
      reason: "試用專業版",
    });

    expect(result.success).toBe(true);
    expectStoreUpdated("store-1", "GROWTH");
  });

  it("EXPERIENCE 試用", async () => {
    storeFindUnique.mockResolvedValue({ plan: "BASIC", planStatus: "ACTIVE" });

    const { adminStartTrial } = await import("@/server/actions/upgrade-request");
    const result = await adminStartTrial({
      storeId: "store-1",
      trialPlan: "EXPERIENCE",
      trialDays: 7,
    });

    expect(result.success).toBe(true);
    expectStoreUpdated("store-1", "EXPERIENCE");
  });
});

// ============================================================
// 4. 試用到期 (processExpiredTrials)
// ============================================================

describe("4. 試用到期 (processExpiredTrials)", () => {
  it("回退 EXPERIENCE", async () => {
    storeFindMany.mockResolvedValue([
      { id: "store-1", name: "測試店", plan: "GROWTH", currentSubscriptionId: "sub-old" },
    ]);
    storeSubscriptionUpdate.mockResolvedValue({});
    storeSubscriptionCreate.mockResolvedValue({ id: "sub-new" });

    const { processExpiredTrials } = await import("@/server/actions/upgrade-request");
    const result = await processExpiredTrials();

    expect(result.processed).toBe(1);
    expectStoreUpdated("store-1", "EXPERIENCE");
  });
});

// ============================================================
// 5. 升級申請審核通過 (reviewUpgradeRequest — UPGRADE)
// ============================================================

describe("5. 升級申請審核通過 (reviewUpgradeRequest UPGRADE)", () => {
  it("BASIC → GROWTH", async () => {
    upgradeRequestFindUnique.mockResolvedValue({
      id: "req-1",
      storeId: "store-1",
      status: "PENDING",
      requestType: "UPGRADE",
      currentPlan: "BASIC",
      requestedPlan: "GROWTH",
    });
    storeFindUnique.mockResolvedValue({
      plan: "BASIC",
      planStatus: "ACTIVE",
      currentSubscriptionId: null,
    });

    const { reviewUpgradeRequest } = await import("@/server/actions/upgrade-request");
    const result = await reviewUpgradeRequest({
      requestId: "req-1",
      action: "APPROVED",
    });

    expect(result.success).toBe(true);
    expectStoreUpdated("store-1", "GROWTH");
  });

  it("GROWTH → ALLIANCE", async () => {
    upgradeRequestFindUnique.mockResolvedValue({
      id: "req-2",
      storeId: "store-1",
      status: "PENDING",
      requestType: "UPGRADE",
      currentPlan: "GROWTH",
      requestedPlan: "ALLIANCE",
    });
    storeFindUnique.mockResolvedValue({
      plan: "GROWTH",
      planStatus: "ACTIVE",
      currentSubscriptionId: null,
    });

    const { reviewUpgradeRequest } = await import("@/server/actions/upgrade-request");
    const result = await reviewUpgradeRequest({
      requestId: "req-2",
      action: "APPROVED",
    });

    expect(result.success).toBe(true);
    expectStoreUpdated("store-1", "ALLIANCE");
  });
});

// ============================================================
// 6. 付款確認後生效 (confirmUpgradePayment)
// ============================================================

describe("6. 付款確認後生效 (confirmUpgradePayment)", () => {
  it("付款前：planStatus = PAYMENT_PENDING，plan 未變", async () => {
    upgradeRequestFindUnique.mockResolvedValue({
      id: "req-pay",
      storeId: "store-1",
      status: "PENDING",
      requestType: "UPGRADE",
      currentPlan: "BASIC",
      requestedPlan: "GROWTH",
    });
    storeFindUnique.mockResolvedValue({
      plan: "BASIC",
      planStatus: "ACTIVE",
      currentSubscriptionId: null,
    });

    const { reviewUpgradeRequest } = await import("@/server/actions/upgrade-request");
    await reviewUpgradeRequest({
      requestId: "req-pay",
      action: "APPROVED",
      requiresPayment: true,
    });

    // plan 不應被更新（只有 planStatus → PAYMENT_PENDING）
    const planUpdateCalls = storeUpdate.mock.calls.filter(
      (c: unknown[]) => (c[0] as { data: Record<string, unknown> }).data.plan !== undefined,
    );
    expect(planUpdateCalls.length).toBe(0);
  });

  it("付款後：Store.plan = GROWTH", async () => {
    vi.clearAllMocks();
    storeSubscriptionCreate.mockResolvedValue({ id: "sub-paid" });

    upgradeRequestFindUnique.mockResolvedValue({
      id: "req-pay",
      storeId: "store-1",
      status: "APPROVED",
      billingStatus: "PENDING",
      requestType: "UPGRADE",
      currentPlan: "BASIC",
      requestedPlan: "GROWTH",
    });
    storeFindUnique.mockResolvedValue({
      plan: "BASIC",
      planStatus: "PAYMENT_PENDING",
      currentSubscriptionId: null,
    });

    const { confirmUpgradePayment } = await import("@/server/actions/upgrade-request");
    const result = await confirmUpgradePayment({ requestId: "req-pay" });

    expect(result.success).toBe(true);
    expectStoreUpdated("store-1", "GROWTH");
  });
});

// ============================================================
// 所有 PricingPlan 方案變更正確
// ============================================================

describe("所有 PricingPlan 方案變更", () => {
  it("4 種 PricingPlan 都能正確設定", async () => {
    const plans = ["EXPERIENCE", "BASIC", "GROWTH", "ALLIANCE"] as const;

    const { adminChangeStorePlan } = await import("@/server/actions/upgrade-request");

    for (const plan of plans) {
      vi.clearAllMocks();
      storeSubscriptionCreate.mockResolvedValue({ id: `sub-${plan}` });
      const currentPlan = plan === "EXPERIENCE" ? "BASIC" : "EXPERIENCE";
      storeFindUnique.mockResolvedValue({ plan: currentPlan, planStatus: "ACTIVE" });

      const result = await adminChangeStorePlan({
        storeId: "store-map",
        newPlan: plan,
        reason: `方案測試 ${plan}`,
      });

      expect(result.success).toBe(true);
      expectStoreUpdated("store-map", plan);
    }
  });
});

// ============================================================
// Store.plan 為唯一真相
// ============================================================

describe("Store.plan 為唯一真相", () => {
  it("不再寫入 ShopConfig — 只更新 Store.plan", async () => {
    storeFindUnique.mockResolvedValue({ plan: "BASIC", planStatus: "ACTIVE" });
    storeSubscriptionCreate.mockResolvedValue({ id: "sub-truth" });

    const { adminChangeStorePlan } = await import("@/server/actions/upgrade-request");
    const result = await adminChangeStorePlan({
      storeId: "store-1",
      newPlan: "GROWTH",
      reason: "source-of-truth 測試",
    });

    expect(result.success).toBe(true);
    expectStoreUpdated("store-1", "GROWTH");
  });
});
