/**
 * PR-4：cashbook 付款方式可視化 + 閉店日防呆 guard 單元測試
 *
 * 涵蓋（後端權威 guard，不靠前端）：
 *   1. listCashbookEntries 回傳保留 paymentMethod（列表可顯示付款方式）
 *   2. 新增：非閉店日 CASH / OTHER 皆正常建立
 *   3. 新增：閉店日 + CASH + 未確認 → 後端拒絕，不寫入
 *   4. 新增：閉店日 + CASH + 已確認 → 允許建立，且「不」回頭重算抽屜快照
 *   5. 新增：閉店日 + OTHER → 允許（不影響抽屜，不需確認）
 *   6. 編輯：閉店日且涉及 CASH + 未確認 → 後端拒絕
 *
 * 同時驗證：guard 過程完全不會呼叫 cashDrawerSession.update（不重算已閉店快照）。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const STORE_A = "store-a";
const USER = { id: "user-1", role: "OWNER", staffId: "staff-1", storeId: STORE_A };

const {
  mockCashbookCreate,
  mockCashbookFindUnique,
  mockCashbookFindMany,
  mockCashbookUpdate,
  mockCashbookCount,
  mockSessionFindUnique,
  mockSessionFindMany,
  mockSessionUpdate,
  mockAuditCreate,
  dbMock,
} = vi.hoisted(() => {
  const fns = {
    mockCashbookCreate: vi.fn(),
    mockCashbookFindUnique: vi.fn(),
    mockCashbookFindMany: vi.fn(),
    mockCashbookUpdate: vi.fn(),
    mockCashbookCount: vi.fn(),
    mockSessionFindUnique: vi.fn(),
    mockSessionFindMany: vi.fn(),
    mockSessionUpdate: vi.fn(),
    mockAuditCreate: vi.fn(),
  };
  const db: Record<string, unknown> = {
    cashbookEntry: {
      create: (...a: unknown[]) => fns.mockCashbookCreate(...a),
      findUnique: (...a: unknown[]) => fns.mockCashbookFindUnique(...a),
      findMany: (...a: unknown[]) => fns.mockCashbookFindMany(...a),
      update: (...a: unknown[]) => fns.mockCashbookUpdate(...a),
      count: (...a: unknown[]) => fns.mockCashbookCount(...a),
    },
    cashDrawerSession: {
      findUnique: (...a: unknown[]) => fns.mockSessionFindUnique(...a),
      findMany: (...a: unknown[]) => fns.mockSessionFindMany(...a),
      update: (...a: unknown[]) => fns.mockSessionUpdate(...a),
    },
    auditLog: {
      create: (...a: unknown[]) => fns.mockAuditCreate(...a),
    },
  };
  db.$transaction = (cb: (tx: unknown) => Promise<unknown>) => cb(db);
  return { ...fns, dbMock: db };
});

vi.mock("@/lib/db", () => ({ prisma: dbMock }));
vi.mock("@/lib/permissions", () => ({
  requirePermission: vi.fn(async () => USER),
  requireWritablePermission: vi.fn(async () => USER),
}));
vi.mock("@/lib/session", () => ({
  requireStaffSession: vi.fn(async () => USER),
}));
vi.mock("@/lib/feature-gate", () => ({
  checkCurrentStoreFeature: vi.fn(async () => ({})),
}));
vi.mock("@/lib/manager-visibility", () => ({
  assertStoreAccess: vi.fn(),
  getManagerReadFilter: vi.fn(() => ({})),
}));
vi.mock("@/lib/store", () => ({
  currentStoreId: vi.fn(() => STORE_A),
  resolveWriteStoreId: vi.fn(async () => STORE_A),
}));
vi.mock("@/lib/store-view-context-server", () => ({
  resolveStoreViewContextFromCookie: vi.fn(async () => null),
  storeIdForViewContext: (
    fallbackStoreId: string | null,
    viewContext: { isViewMode: boolean; viewedStoreId: string | null } | null,
  ) =>
    viewContext?.isViewMode
      ? viewContext.viewedStoreId ?? fallbackStoreId
      : fallbackStoreId,
  userForViewContext: <T extends { storeId?: string | null }>(
    user: T,
    viewContext: { isViewMode: boolean; viewedStoreId: string | null } | null,
  ): T =>
    viewContext?.isViewMode && viewContext.viewedStoreId
      ? { ...user, storeId: viewContext.viewedStoreId }
      : user,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createCashbookEntry, updateCashbookEntry } from "@/server/actions/cashbook";
import { listCashbookEntries } from "@/server/queries/cashbook";

const baseCreate = {
  entryDate: "2026-05-20",
  type: "INCOME" as const,
  amount: 1000,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCashbookCreate.mockResolvedValue({ id: "entry-new" });
  mockSessionFindUnique.mockResolvedValue(null); // 預設：該日無 session（未閉店）
  mockSessionFindMany.mockResolvedValue([]);
});

describe("listCashbookEntries 保留 paymentMethod", () => {
  it("回傳的 entries 帶 paymentMethod 欄位（列表可顯示現金/其他）", async () => {
    mockCashbookFindMany.mockResolvedValue([
      { id: "a", paymentMethod: "CASH", type: "INCOME", amount: 1000 },
      { id: "b", paymentMethod: "OTHER", type: "EXPENSE", amount: 500 },
    ]);
    mockCashbookCount.mockResolvedValue(2);

    const result = await listCashbookEntries({ activeStoreId: STORE_A });
    expect(result.entries.map((e) => e.paymentMethod)).toEqual(["CASH", "OTHER"]);
  });
});

describe("createCashbookEntry — 閉店日防呆 guard", () => {
  it("非閉店日 + CASH → 正常建立，且不寫 AuditLog（不擴大一般 create 的稽核）", async () => {
    mockSessionFindUnique.mockResolvedValue(null);
    const res = await createCashbookEntry({ ...baseCreate, paymentMethod: "CASH" });
    expect(res.success).toBe(true);
    expect(mockCashbookCreate).toHaveBeenCalledOnce();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("非閉店日 + OTHER → 正常建立", async () => {
    mockSessionFindUnique.mockResolvedValue(null);
    const res = await createCashbookEntry({ ...baseCreate, paymentMethod: "OTHER" });
    expect(res.success).toBe(true);
    expect(mockCashbookCreate).toHaveBeenCalledOnce();
  });

  it("閉店日 + CASH + 未確認 → 後端拒絕，且不寫入、不重算抽屜", async () => {
    mockSessionFindUnique.mockResolvedValue({ status: "CLOSED" });
    const res = await createCashbookEntry({ ...baseCreate, paymentMethod: "CASH" });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toContain("補紀錄");
    expect(mockCashbookCreate).not.toHaveBeenCalled();
    expect(mockSessionUpdate).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("閉店日 + CASH + 已確認 → 允許建立、寫 AuditLog CREATE、但不回頭重算已閉店快照", async () => {
    mockSessionFindUnique.mockResolvedValue({ status: "CLOSED" });
    mockCashbookCreate.mockResolvedValue({
      id: "entry-new",
      entryDate: new Date(Date.UTC(2026, 4, 20)),
      type: "INCOME",
      category: null,
      amount: 1000,
      paymentMethod: "CASH",
      staffId: "staff-1",
      note: null,
    });
    const res = await createCashbookEntry({
      ...baseCreate,
      paymentMethod: "CASH",
      confirmClosedCashbookChange: true,
    });
    expect(res.success).toBe(true);
    expect(mockCashbookCreate).toHaveBeenCalledOnce();
    expect(mockSessionUpdate).not.toHaveBeenCalled();
    // 敏感操作留痕：beforeJson 為 null，afterJson 用 snapshot
    expect(mockAuditCreate).toHaveBeenCalledOnce();
    const auditArg = mockAuditCreate.mock.calls[0][0];
    expect(auditArg.data.action).toBe("CREATE");
    expect(auditArg.data.targetType).toBe("CashbookEntry");
    expect(auditArg.data.beforeJson).toBeUndefined();
    expect(auditArg.data.afterJson).toBeTruthy();
  });

  it("閉店日 + OTHER → 允許（不影響抽屜，不需確認）", async () => {
    mockSessionFindUnique.mockResolvedValue({ status: "CLOSED" });
    const res = await createCashbookEntry({ ...baseCreate, paymentMethod: "OTHER" });
    expect(res.success).toBe(true);
    expect(mockCashbookCreate).toHaveBeenCalledOnce();
    // OTHER 不涉現金 → 根本不需查 session 狀態
    expect(mockSessionFindUnique).not.toHaveBeenCalled();
    expect(mockSessionUpdate).not.toHaveBeenCalled();
  });
});

describe("updateCashbookEntry — 閉店日防呆 guard", () => {
  const existing = {
    id: "entry-1",
    storeId: STORE_A,
    entryDate: new Date(Date.UTC(2026, 4, 20)),
    type: "INCOME",
    category: null,
    amount: 1000,
    paymentMethod: "CASH",
    staffId: "staff-1",
    note: null,
  };

  it("編輯閉店日的 CASH 紀錄 + 未確認 → 後端拒絕，不寫入、不重算抽屜", async () => {
    mockCashbookFindUnique.mockResolvedValue(existing);
    mockSessionFindUnique.mockResolvedValue({ status: "CLOSED" });

    const res = await updateCashbookEntry("entry-1", { note: "改備註" });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toContain("補紀錄");
    expect(mockCashbookUpdate).not.toHaveBeenCalled();
    expect(mockSessionUpdate).not.toHaveBeenCalled();
  });

  it("編輯閉店日的 CASH 紀錄 + 已確認 → 允許，且不重算抽屜", async () => {
    mockCashbookFindUnique.mockResolvedValue(existing);
    mockSessionFindUnique.mockResolvedValue({ status: "CLOSED" });
    mockCashbookUpdate.mockResolvedValue({ ...existing, note: "改備註" });

    const res = await updateCashbookEntry("entry-1", {
      note: "改備註",
      confirmClosedCashbookChange: true,
    });
    expect(res.success).toBe(true);
    expect(mockCashbookUpdate).toHaveBeenCalledOnce();
    expect(mockSessionUpdate).not.toHaveBeenCalled();
  });

  it("閉店日把 CASH 改成 OTHER + 未確認 → 回傳可顯示錯誤（不 crash）、不寫入、不重算抽屜", async () => {
    // 原本是 CASH（涉及現金），即使改成 OTHER，已結帳日仍需確認
    mockCashbookFindUnique.mockResolvedValue(existing); // paymentMethod: "CASH"
    mockSessionFindUnique.mockResolvedValue({ status: "CLOSED" });

    const res = await updateCashbookEntry("entry-1", { paymentMethod: "OTHER" });
    // action 以 ActionResult 回傳錯誤（由頁面轉成 toast），而非 throw 到 error boundary
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toContain("補紀錄");
    expect(mockCashbookUpdate).not.toHaveBeenCalled();
    expect(mockSessionUpdate).not.toHaveBeenCalled();
  });

  it("閉店日把 CASH 改成 OTHER + 已確認 → 允許更新，且不重算抽屜", async () => {
    mockCashbookFindUnique.mockResolvedValue(existing); // paymentMethod: "CASH"
    mockSessionFindUnique.mockResolvedValue({ status: "CLOSED" });
    mockCashbookUpdate.mockResolvedValue({ ...existing, paymentMethod: "OTHER" });

    const res = await updateCashbookEntry("entry-1", {
      paymentMethod: "OTHER",
      confirmClosedCashbookChange: true,
    });
    expect(res.success).toBe(true);
    expect(mockCashbookUpdate).toHaveBeenCalledOnce();
    expect(mockSessionUpdate).not.toHaveBeenCalled();
  });

  it("編輯非閉店日的 OTHER 紀錄 → 正常更新（不需確認）", async () => {
    mockCashbookFindUnique.mockResolvedValue({ ...existing, paymentMethod: "OTHER" });
    mockSessionFindUnique.mockResolvedValue(null);
    mockCashbookUpdate.mockResolvedValue({ ...existing, paymentMethod: "OTHER" });

    const res = await updateCashbookEntry("entry-1", { note: "x" });
    expect(res.success).toBe(true);
    expect(mockCashbookUpdate).toHaveBeenCalledOnce();
  });
});
