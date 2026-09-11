/**
 * updateCustomerNotesAction — 內部服務備註寫入 action 安全邊界
 *
 * 內部服務備註是「後台限定」欄位，安全邊界比 UI 更關鍵，本測試聚焦：
 *   1. 有 customer.update 權限者可更新 notes
 *   2. 無 update 權限（requirePermission throw）→ 不可更新
 *   3. trim 後空字串 → 存 null
 *   4. 超過 1000 字 → validation 擋下、不寫 DB
 *   5. customerId 用 .min(1)（非 cuid）→ staging/匯入 id 仍可更新
 *   6. 跨 store（assertStoreAccess throw）→ 不可更新
 *   7. Audit 為 content-free：只記 action / targetId，不含 notes 全文
 *   8. 成功回傳 ActionResult（success:true, data:undefined）供 Drawer refresh
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AppError } from "@/lib/errors";

const OWNER = { id: "u-owner-1", storeId: "store-a", role: "OWNER", staffId: "s1" };

const mockCustomerFindUnique = vi.fn();
const mockCustomerUpdate = vi.fn();
const mockAuditCreate = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    customer: {
      findUnique: (...a: unknown[]) => mockCustomerFindUnique(...a),
      update: (...a: unknown[]) => mockCustomerUpdate(...a),
    },
    auditLog: { create: (...a: unknown[]) => mockAuditCreate(...a) },
  },
}));

const mockRequirePermission = vi.fn();
vi.mock("@/lib/permissions", () => ({
  requireWritablePermission: (...a: unknown[]) => mockRequirePermission(...a),
  requirePermission: (...a: unknown[]) => mockRequirePermission(...a),
}));

const mockRequireSession = vi.fn();
vi.mock("@/lib/session", () => ({
  requireSession: (...a: unknown[]) => mockRequireSession(...a),
  requireStaffSession: (...a: unknown[]) => mockRequireSession(...a),
  getCurrentUser: (...a: unknown[]) => mockRequireSession(...a),
}));

const mockAssertStoreAccess = vi.fn();
vi.mock("@/lib/manager-visibility", () => ({
  assertStoreAccess: (...a: unknown[]) => mockAssertStoreAccess(...a),
  getStoreFilter: () => ({}),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: <T,>(callback: T) => callback,
}));

vi.mock("@/lib/subscription-guard", () => ({ assertStoreSubscriptionWritable: vi.fn(async () => undefined) }));

import { updateCustomerNotesAction } from "@/server/actions/customer";

beforeEach(() => {
  vi.clearAllMocks();
  // happy-path defaults（個別測試再覆寫）
  mockRequirePermission.mockResolvedValue(OWNER);
  mockCustomerFindUnique.mockResolvedValue({ id: "c1", storeId: "store-a" });
  mockAssertStoreAccess.mockReturnValue(undefined);
  mockCustomerUpdate.mockResolvedValue({});
  mockAuditCreate.mockResolvedValue({});
});

describe("updateCustomerNotesAction — 安全邊界", () => {
  it("1) 有 customer.update → 可更新 notes", async () => {
    const r = await updateCustomerNotesAction({
      customerId: "c1",
      notes: "怕熱，溫度不要太高",
    });
    expect(r.success).toBe(true);
    // gate 走 customer.update
    expect(mockRequirePermission).toHaveBeenCalledWith("customer.update");
    expect(mockCustomerUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { notes: "怕熱，溫度不要太高" },
    });
  });

  it("2) 無 update 權限（requirePermission throw）→ 不可更新", async () => {
    mockRequirePermission.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "無權限"),
    );
    const r = await updateCustomerNotesAction({
      customerId: "c1",
      notes: "x",
    });
    expect(r).toMatchObject({ success: false, error: "無權限" });
    expect(mockCustomerFindUnique).not.toHaveBeenCalled();
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("3) trim 後空字串 → 存 null", async () => {
    const r = await updateCustomerNotesAction({
      customerId: "c1",
      notes: "   \n  ",
    });
    expect(r.success).toBe(true);
    expect(mockCustomerUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { notes: null },
    });
  });

  it("3b) notes = null → 存 null（清除）", async () => {
    const r = await updateCustomerNotesAction({
      customerId: "c1",
      notes: null,
    });
    expect(r.success).toBe(true);
    expect(mockCustomerUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { notes: null },
    });
  });

  it("4) 超過 1000 字 → validation 擋下、不寫 DB", async () => {
    const r = await updateCustomerNotesAction({
      customerId: "c1",
      notes: "a".repeat(1001),
    });
    expect(r.success).toBe(false);
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("4b) 剛好 1000 字 → 通過", async () => {
    const r = await updateCustomerNotesAction({
      customerId: "c1",
      notes: "a".repeat(1000),
    });
    expect(r.success).toBe(true);
    expect(mockCustomerUpdate).toHaveBeenCalledTimes(1);
  });

  it("5) customerId 非 cuid（staging id）仍可更新", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: "staging-cust-001",
      storeId: "store-a",
    });
    const r = await updateCustomerNotesAction({
      customerId: "staging-cust-001",
      notes: "備註",
    });
    expect(r.success).toBe(true);
    expect(mockCustomerUpdate).toHaveBeenCalledWith({
      where: { id: "staging-cust-001" },
      data: { notes: "備註" },
    });
  });

  it("6) 跨 store（assertStoreAccess throw）→ 不可更新", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: "c1",
      storeId: "store-b", // 不同店
    });
    mockAssertStoreAccess.mockImplementationOnce(() => {
      throw new AppError("FORBIDDEN", "跨店不可操作");
    });
    const r = await updateCustomerNotesAction({
      customerId: "c1",
      notes: "x",
    });
    expect(r.success).toBe(false);
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("6b) 顧客不存在 → NOT_FOUND，不寫 DB", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(null);
    const r = await updateCustomerNotesAction({
      customerId: "nope",
      notes: "x",
    });
    expect(r.success).toBe(false);
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("7) Audit 為 content-free：只記 action/targetId，不含備註全文", async () => {
    const secret = "顧客超敏感備註內容請勿外洩";
    const r = await updateCustomerNotesAction({
      customerId: "c1",
      notes: secret,
    });
    expect(r.success).toBe(true);
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const arg = mockAuditCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(arg.data.action).toBe("CUSTOMER_NOTES_UPDATED");
    expect(arg.data.targetType).toBe("Customer");
    expect(arg.data.targetId).toBe("c1");
    // 不可有 before/after 快照欄位
    expect(arg.data.beforeJson).toBeUndefined();
    expect(arg.data.afterJson).toBeUndefined();
    // 整個 audit payload 序列化後不得包含備註全文
    expect(JSON.stringify(arg)).not.toContain(secret);
  });

  it("8) 成功回傳 ActionResult（success:true, data:undefined）", async () => {
    const r = await updateCustomerNotesAction({
      customerId: "c1",
      notes: "ok",
    });
    expect(r).toEqual({ success: true, data: undefined });
  });
});
