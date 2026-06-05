/**
 * updateCustomerServiceNoteAction — 內部服務備註寫入 action 安全邊界
 *
 * 內部服務備註是「後台限定」欄位，安全邊界比 UI 更關鍵，本測試聚焦：
 *   1. 有 customer.update 權限者可更新 serviceNote
 *   2. 無 update 權限（requirePermission throw）→ 不可更新
 *   3. trim 後空字串 → 存 null
 *   4. 超過 1000 字 → validation 擋下、不寫 DB
 *   5. customerId 用 .min(1)（非 cuid）→ staging/匯入 id 仍可更新
 *   6. 跨 store（assertStoreAccess throw）→ 不可更新
 *   7. Audit 為 content-free：只記 action / targetId，不含 serviceNote 全文
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

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updateCustomerServiceNoteAction } from "@/server/actions/customer";

beforeEach(() => {
  vi.clearAllMocks();
  // happy-path defaults（個別測試再覆寫）
  mockRequirePermission.mockResolvedValue(OWNER);
  mockCustomerFindUnique.mockResolvedValue({ id: "c1", storeId: "store-a" });
  mockAssertStoreAccess.mockReturnValue(undefined);
  mockCustomerUpdate.mockResolvedValue({});
  mockAuditCreate.mockResolvedValue({});
});

describe("updateCustomerServiceNoteAction — 安全邊界", () => {
  it("1) 有 customer.update → 可更新 serviceNote", async () => {
    const r = await updateCustomerServiceNoteAction({
      customerId: "c1",
      serviceNote: "怕熱，溫度不要太高",
    });
    expect(r.success).toBe(true);
    // gate 走 customer.update
    expect(mockRequirePermission).toHaveBeenCalledWith("customer.update");
    expect(mockCustomerUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { serviceNote: "怕熱，溫度不要太高" },
    });
  });

  it("2) 無 update 權限（requirePermission throw）→ 不可更新", async () => {
    mockRequirePermission.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "無權限"),
    );
    const r = await updateCustomerServiceNoteAction({
      customerId: "c1",
      serviceNote: "x",
    });
    expect(r.success).toBe(false);
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("3) trim 後空字串 → 存 null", async () => {
    const r = await updateCustomerServiceNoteAction({
      customerId: "c1",
      serviceNote: "   \n  ",
    });
    expect(r.success).toBe(true);
    expect(mockCustomerUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { serviceNote: null },
    });
  });

  it("3b) serviceNote = null → 存 null（清除）", async () => {
    const r = await updateCustomerServiceNoteAction({
      customerId: "c1",
      serviceNote: null,
    });
    expect(r.success).toBe(true);
    expect(mockCustomerUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { serviceNote: null },
    });
  });

  it("4) 超過 1000 字 → validation 擋下、不寫 DB", async () => {
    const r = await updateCustomerServiceNoteAction({
      customerId: "c1",
      serviceNote: "a".repeat(1001),
    });
    expect(r.success).toBe(false);
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("4b) 剛好 1000 字 → 通過", async () => {
    const r = await updateCustomerServiceNoteAction({
      customerId: "c1",
      serviceNote: "a".repeat(1000),
    });
    expect(r.success).toBe(true);
    expect(mockCustomerUpdate).toHaveBeenCalledTimes(1);
  });

  it("5) customerId 非 cuid（staging id）仍可更新", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce({
      id: "staging-cust-001",
      storeId: "store-a",
    });
    const r = await updateCustomerServiceNoteAction({
      customerId: "staging-cust-001",
      serviceNote: "備註",
    });
    expect(r.success).toBe(true);
    expect(mockCustomerUpdate).toHaveBeenCalledWith({
      where: { id: "staging-cust-001" },
      data: { serviceNote: "備註" },
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
    const r = await updateCustomerServiceNoteAction({
      customerId: "c1",
      serviceNote: "x",
    });
    expect(r.success).toBe(false);
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("6b) 顧客不存在 → NOT_FOUND，不寫 DB", async () => {
    mockCustomerFindUnique.mockResolvedValueOnce(null);
    const r = await updateCustomerServiceNoteAction({
      customerId: "nope",
      serviceNote: "x",
    });
    expect(r.success).toBe(false);
    expect(mockCustomerUpdate).not.toHaveBeenCalled();
  });

  it("7) Audit 為 content-free：只記 action/targetId，不含備註全文", async () => {
    const secret = "顧客超敏感備註內容請勿外洩";
    const r = await updateCustomerServiceNoteAction({
      customerId: "c1",
      serviceNote: secret,
    });
    expect(r.success).toBe(true);
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const arg = mockAuditCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(arg.data.action).toBe("SERVICE_NOTE_UPDATED");
    expect(arg.data.targetType).toBe("Customer");
    expect(arg.data.targetId).toBe("c1");
    // 不可有 before/after 快照欄位
    expect(arg.data.beforeJson).toBeUndefined();
    expect(arg.data.afterJson).toBeUndefined();
    // 整個 audit payload 序列化後不得包含備註全文
    expect(JSON.stringify(arg)).not.toContain(secret);
  });

  it("8) 成功回傳 ActionResult（success:true, data:undefined）", async () => {
    const r = await updateCustomerServiceNoteAction({
      customerId: "c1",
      serviceNote: "ok",
    });
    expect(r).toEqual({ success: true, data: undefined });
  });
});
