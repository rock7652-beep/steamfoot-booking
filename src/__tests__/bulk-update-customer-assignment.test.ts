/**
 * bulkUpdateCustomerAssignment — 批次指派直屬店長
 *
 * 測試覆蓋：
 *  - validator 邊界（空 / 超量 / 非 cuid / 空 staffId）
 *  - staff 驗證失敗整批中止
 *  - 純成功路徑（updateMany 被呼叫一次，僅含 assignedStaffId）
 *  - 混合路徑（找不到 / 不同店 / 合併 / 停用 / 正常）正確分類
 *  - 不會誤改 sponsorId / Booking / Transaction / Wallet（只有 customer.updateMany）
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const STORE_A = "store-zhubei";
const STORE_B = "store-other";
const STAFF_ID = "ck1000000000000000000s01";
const STAFF_ID_OTHER = "ck1000000000000000000s02";

// cuid format helpers — vitest 不在意實際 cuid 演算法，符合長度 / 開頭即可通過 zod cuid 驗證
function cid(suffix: string) {
  return `ck10000000000000000c${suffix.padStart(5, "0")}`;
}
const C_OK_1 = cid("aa001");
const C_OK_2 = cid("aa002");
const C_OTHER_STORE = cid("aa003");
const C_MERGED = cid("aa004");
const C_SUSPENDED = cid("aa005");
const C_NOT_FOUND = cid("aa006");

// ── Mocks ─────────────────────────────────────────────────────────────

const mockStaffFindUnique = vi.fn();
const mockCustomerFindMany = vi.fn();
const mockCustomerUpdateMany = vi.fn();

// 寫入動詞守門：任何「不該被呼叫」的 prisma 方法都用 throwIfCalled 包，被呼到就讓測試直接 fail
function throwIfCalled(name: string) {
  return vi.fn((...args: unknown[]) => {
    throw new Error(`[guard] unexpected call to ${name}(${JSON.stringify(args)})`);
  });
}

vi.mock("@/lib/db", () => ({
  prisma: {
    staff: {
      findUnique: (...a: unknown[]) => mockStaffFindUnique(...a),
    },
    customer: {
      findMany: (...a: unknown[]) => mockCustomerFindMany(...a),
      updateMany: (...a: unknown[]) => mockCustomerUpdateMany(...a),
      // 守門：bulk action 不應該寫到單筆 update
      update: throwIfCalled("customer.update"),
      create: throwIfCalled("customer.create"),
      delete: throwIfCalled("customer.delete"),
    },
    // 守門：bulk action 完全不該碰這些
    booking: { create: throwIfCalled("booking.create"), update: throwIfCalled("booking.update") },
    transaction: { create: throwIfCalled("transaction.create") },
    customerPlanWallet: { create: throwIfCalled("wallet.create"), update: throwIfCalled("wallet.update") },
    walletSession: { create: throwIfCalled("session.create"), update: throwIfCalled("session.update") },
  },
}));

vi.mock("@/lib/permissions", () => ({
  requirePermission: vi.fn(async () => ({
    id: "user-1",
    role: "OWNER",
    storeId: STORE_A,
    staffId: STAFF_ID,
  })),
  checkPermission: vi.fn(),
}));

vi.mock("@/lib/store", () => ({
  currentStoreId: (u: { storeId?: string | null }) => u.storeId ?? STORE_A,
  DEFAULT_STORE_ID: "default",
  getActiveStoreForRead: vi.fn(),
}));

vi.mock("@/lib/manager-visibility", () => ({
  assertStoreAccess: vi.fn(),
  getStoreFilter: () => ({}),
}));

vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(),
  requireStaffSession: vi.fn(),
}));

vi.mock("@/lib/shop-config", () => ({
  checkCustomerLimit: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// ── Import target after mocks ─────────────────────────────────────────

import { bulkUpdateCustomerAssignment } from "@/server/actions/customer";

beforeEach(() => {
  vi.clearAllMocks();
  // 預設：staff 是同店 ACTIVE，updateMany 回成功
  mockStaffFindUnique.mockResolvedValue({
    id: STAFF_ID,
    storeId: STORE_A,
    status: "ACTIVE",
  });
  mockCustomerUpdateMany.mockResolvedValue({ count: 0 });
});

// ── Validator 邊界 ────────────────────────────────────────────────────

describe("bulkUpdateCustomerAssignment — validator", () => {
  it("customerIds 為空陣列 → 顯示「請選擇至少一位顧客」", async () => {
    const r = await bulkUpdateCustomerAssignment({
      customerIds: [],
      assignedStaffId: STAFF_ID,
    });
    expect(r).toEqual({ success: false, error: "請選擇至少一位顧客" });
    expect(mockStaffFindUnique).not.toHaveBeenCalled();
    expect(mockCustomerUpdateMany).not.toHaveBeenCalled();
  });

  it("customerIds 超過 100 筆 → 顯示「單次最多 100 位」", async () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => cid(String(i)));
    const r = await bulkUpdateCustomerAssignment({
      customerIds: tooMany,
      assignedStaffId: STAFF_ID,
    });
    expect(r).toEqual({ success: false, error: "單次最多 100 位" });
    expect(mockCustomerUpdateMany).not.toHaveBeenCalled();
  });

  it("assignedStaffId 為空字串 → 顯示「請選擇歸屬店長」", async () => {
    const r = await bulkUpdateCustomerAssignment({
      customerIds: [C_OK_1],
      assignedStaffId: "",
    });
    expect(r).toEqual({ success: false, error: "請選擇歸屬店長" });
    expect(mockCustomerUpdateMany).not.toHaveBeenCalled();
  });

  it("customerIds 含非 cuid → 驗證失敗，updateMany 不被呼叫", async () => {
    const r = await bulkUpdateCustomerAssignment({
      customerIds: ["not-a-cuid"],
      assignedStaffId: STAFF_ID,
    });
    expect(r.success).toBe(false);
    expect(mockCustomerUpdateMany).not.toHaveBeenCalled();
  });
});

// ── Staff 驗證失敗整批中止 ────────────────────────────────────────────

describe("bulkUpdateCustomerAssignment — staff 驗證失敗整批中止", () => {
  it("staff 不存在 → 整批中止，回傳「指定店長不存在或已停用」", async () => {
    mockStaffFindUnique.mockResolvedValueOnce(null);
    const r = await bulkUpdateCustomerAssignment({
      customerIds: [C_OK_1, C_OK_2],
      assignedStaffId: STAFF_ID,
    });
    expect(r).toEqual({ success: false, error: "指定店長不存在或已停用" });
    expect(mockCustomerFindMany).not.toHaveBeenCalled();
    expect(mockCustomerUpdateMany).not.toHaveBeenCalled();
  });

  it("staff 非 ACTIVE → 整批中止", async () => {
    mockStaffFindUnique.mockResolvedValueOnce({
      id: STAFF_ID,
      storeId: STORE_A,
      status: "INACTIVE",
    });
    const r = await bulkUpdateCustomerAssignment({
      customerIds: [C_OK_1],
      assignedStaffId: STAFF_ID,
    });
    expect(r).toEqual({ success: false, error: "指定店長不存在或已停用" });
    expect(mockCustomerUpdateMany).not.toHaveBeenCalled();
  });

  it("staff 不同店 → 整批中止，回傳「店長不屬於此店別」", async () => {
    mockStaffFindUnique.mockResolvedValueOnce({
      id: STAFF_ID_OTHER,
      storeId: STORE_B,
      status: "ACTIVE",
    });
    const r = await bulkUpdateCustomerAssignment({
      customerIds: [C_OK_1],
      assignedStaffId: STAFF_ID_OTHER,
    });
    expect(r).toEqual({ success: false, error: "店長不屬於此店別" });
    expect(mockCustomerUpdateMany).not.toHaveBeenCalled();
  });
});

// ── 純成功路徑 ──────────────────────────────────────────────────────

describe("bulkUpdateCustomerAssignment — 純成功路徑", () => {
  it("全部 valid → updateMany 被呼叫一次，data 僅含 assignedStaffId", async () => {
    mockCustomerFindMany.mockResolvedValueOnce([
      { id: C_OK_1, storeId: STORE_A, mergedIntoCustomerId: null, user: null },
      { id: C_OK_2, storeId: STORE_A, mergedIntoCustomerId: null, user: { status: "ACTIVE" } },
    ]);
    mockCustomerUpdateMany.mockResolvedValueOnce({ count: 2 });

    const r = await bulkUpdateCustomerAssignment({
      customerIds: [C_OK_1, C_OK_2],
      assignedStaffId: STAFF_ID,
    });

    expect(r).toEqual({
      success: true,
      data: { successCount: 2, failedCount: 0, skippedCount: 0, errors: [] },
    });

    // updateMany 必須被呼叫一次
    expect(mockCustomerUpdateMany).toHaveBeenCalledTimes(1);
    const [callArg] = mockCustomerUpdateMany.mock.calls[0];
    // where 必含 storeId 雙保險
    expect(callArg.where).toMatchObject({
      id: { in: [C_OK_1, C_OK_2] },
      storeId: STORE_A,
    });
    // data 只有 assignedStaffId，沒有其他欄位
    expect(callArg.data).toEqual({ assignedStaffId: STAFF_ID });
    expect(Object.keys(callArg.data)).toEqual(["assignedStaffId"]);
  });
});

// ── 混合路徑分類 ────────────────────────────────────────────────────

describe("bulkUpdateCustomerAssignment — 混合路徑分類", () => {
  it("正常 / 不同店 / 合併 / 停用 / 找不到 → 正確分類", async () => {
    mockCustomerFindMany.mockResolvedValueOnce([
      // 正常 ×2
      { id: C_OK_1, storeId: STORE_A, mergedIntoCustomerId: null, user: null },
      { id: C_OK_2, storeId: STORE_A, mergedIntoCustomerId: null, user: { status: "ACTIVE" } },
      // 不同店 → errors
      { id: C_OTHER_STORE, storeId: STORE_B, mergedIntoCustomerId: null, user: null },
      // 已合併 → skipped
      { id: C_MERGED, storeId: STORE_A, mergedIntoCustomerId: C_OK_1, user: null },
      // user.status SUSPENDED → skipped
      { id: C_SUSPENDED, storeId: STORE_A, mergedIntoCustomerId: null, user: { status: "SUSPENDED" } },
      // C_NOT_FOUND 不在回傳中 → errors (顧客不存在)
    ]);
    mockCustomerUpdateMany.mockResolvedValueOnce({ count: 2 });

    const r = await bulkUpdateCustomerAssignment({
      customerIds: [C_OK_1, C_OK_2, C_OTHER_STORE, C_MERGED, C_SUSPENDED, C_NOT_FOUND],
      assignedStaffId: STAFF_ID,
    });

    expect(r.success).toBe(true);
    if (!r.success) return; // type-narrow

    expect(r.data.successCount).toBe(2);
    expect(r.data.skippedCount).toBe(2); // merged + suspended
    expect(r.data.failedCount).toBe(2); // 不同店 + 找不到
    expect(r.data.errors).toEqual(
      expect.arrayContaining([
        { customerId: C_NOT_FOUND, reason: "顧客不存在" },
        { customerId: C_OTHER_STORE, reason: "顧客不屬於此店別" },
      ]),
    );

    // updateMany 只對 valid id 跑一次
    expect(mockCustomerUpdateMany).toHaveBeenCalledTimes(1);
    const [callArg] = mockCustomerUpdateMany.mock.calls[0];
    expect(callArg.where.id.in).toEqual([C_OK_1, C_OK_2]);
  });

  it("全部都不能更新（找不到 / 不同店 / 合併 / 停用）→ updateMany 不被呼叫", async () => {
    mockCustomerFindMany.mockResolvedValueOnce([
      { id: C_OTHER_STORE, storeId: STORE_B, mergedIntoCustomerId: null, user: null },
      { id: C_MERGED, storeId: STORE_A, mergedIntoCustomerId: C_OK_1, user: null },
      { id: C_SUSPENDED, storeId: STORE_A, mergedIntoCustomerId: null, user: { status: "SUSPENDED" } },
    ]);

    const r = await bulkUpdateCustomerAssignment({
      customerIds: [C_OTHER_STORE, C_MERGED, C_SUSPENDED, C_NOT_FOUND],
      assignedStaffId: STAFF_ID,
    });

    expect(r.success).toBe(true);
    if (!r.success) return;

    expect(r.data.successCount).toBe(0);
    expect(r.data.skippedCount).toBe(2);
    expect(r.data.failedCount).toBe(2);
    expect(mockCustomerUpdateMany).not.toHaveBeenCalled();
  });
});
