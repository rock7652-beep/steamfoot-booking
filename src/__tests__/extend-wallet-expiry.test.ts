/**
 * extendWalletExpiry — PR-2 顧客已持有方案「延長有效期限」驗收
 *
 * 鎖定規格：
 *  - ACTIVE 可延長；EXPIRED 可延長並恢復 ACTIVE；USED_UP / CANCELLED 不可
 *  - 無期限（expiryDate=null）不可延長
 *  - 只能延長：新到期日須嚴格晚於目前到期日；且不可早於今天
 *  - 必填 reason；寫 AuditLog(before/after)；不建立 Transaction
 *  - 不動 remainingSessions / totalSessions / startDate / price
 *  - 權限：wallet.adjust
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const STORE_A = "store-zhubei";
const CUSTOMER_ID = "ck0000000000000000000c01";
const WALLET_ID = "ck0000000000000000000w01";
const OWNER_USER_ID = "ck0000000000000000000u01";
const STAFF_ID = "ck0000000000000000000s01";

// 固定「台灣今天 = 2026-05-19」
vi.mock("@/lib/date-utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/date-utils")>(
    "@/lib/date-utils",
  );
  return { ...actual, toLocalDateStr: () => "2026-05-19" };
});

const mockWalletFindUnique = vi.fn();
const mockWalletUpdate = vi.fn();
const mockAuditCreate = vi.fn();
const mockTxTransactionCreate = vi.fn();
const mockTx = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    customerPlanWallet: {
      findUnique: (...a: unknown[]) => mockWalletFindUnique(...a),
    },
    $transaction: (cb: (tx: unknown) => Promise<unknown>) => mockTx(cb),
  },
}));

const mockRequirePermission = vi.fn();
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(),
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/permissions", () => ({
  requirePermission: (...a: unknown[]) => mockRequirePermission(...a),
  checkPermission: vi.fn(),
}));
vi.mock("@/lib/store", () => ({
  currentStoreId: (u: { storeId?: string | null }) => u.storeId ?? STORE_A,
  DEFAULT_STORE_ID: "default-store",
}));
const mockAssertStoreAccess = vi.fn();
vi.mock("@/lib/manager-visibility", () => ({
  assertStoreAccess: (...a: unknown[]) => mockAssertStoreAccess(...a),
  getStoreFilter: () => ({}),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const OWNER = {
  id: OWNER_USER_ID,
  role: "OWNER",
  staffId: STAFF_ID,
  storeId: STORE_A,
};

function wallet(over: Record<string, unknown> = {}) {
  return {
    id: WALLET_ID,
    customerId: CUSTOMER_ID,
    storeId: STORE_A,
    status: "ACTIVE",
    expiryDate: new Date("2026-06-30T00:00:00.000Z"),
    remainingSessions: 5,
    totalSessions: 10,
    ...over,
  };
}

async function run(input: { walletId?: string; newExpiryDate: string; reason?: string }) {
  const { extendWalletExpiry } = await import("@/server/actions/wallet");
  return extendWalletExpiry({
    walletId: input.walletId ?? WALLET_ID,
    newExpiryDate: input.newExpiryDate,
    reason: input.reason ?? "顧客請假補償",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePermission.mockResolvedValue(OWNER);
  mockTx.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      customerPlanWallet: { update: (...a: unknown[]) => mockWalletUpdate(...a) },
      auditLog: { create: (...a: unknown[]) => mockAuditCreate(...a) },
      transaction: { create: (...a: unknown[]) => mockTxTransactionCreate(...a) },
    }),
  );
  mockWalletUpdate.mockResolvedValue({});
  mockAuditCreate.mockResolvedValue({});
});

describe("extendWalletExpiry — 護欄", () => {
  it("USED_UP 不可延長", async () => {
    mockWalletFindUnique.mockResolvedValue(wallet({ status: "USED_UP" }));
    const r = await run({ newExpiryDate: "2026-07-15" });
    expect(r.success).toBe(false);
    expect(mockWalletUpdate).not.toHaveBeenCalled();
  });

  it("CANCELLED 不可延長", async () => {
    mockWalletFindUnique.mockResolvedValue(wallet({ status: "CANCELLED" }));
    const r = await run({ newExpiryDate: "2026-07-15" });
    expect(r.success).toBe(false);
    expect(mockWalletUpdate).not.toHaveBeenCalled();
  });

  it("無期限（expiryDate=null）不可延長", async () => {
    mockWalletFindUnique.mockResolvedValue(wallet({ expiryDate: null }));
    const r = await run({ newExpiryDate: "2026-07-15" });
    expect(r.success).toBe(false);
    expect(mockWalletUpdate).not.toHaveBeenCalled();
  });

  it("新到期日早於今天 → 拒絕", async () => {
    mockWalletFindUnique.mockResolvedValue(
      wallet({ expiryDate: new Date("2026-05-10T00:00:00.000Z") }),
    );
    const r = await run({ newExpiryDate: "2026-05-18" }); // < today 2026-05-19
    expect(r.success).toBe(false);
    expect(mockWalletUpdate).not.toHaveBeenCalled();
  });

  it("只能延長：新到期日 = 目前到期日 → 拒絕", async () => {
    mockWalletFindUnique.mockResolvedValue(wallet());
    const r = await run({ newExpiryDate: "2026-06-30" });
    expect(r.success).toBe(false);
    expect(mockWalletUpdate).not.toHaveBeenCalled();
  });

  it("只能延長：新到期日早於目前到期日 → 拒絕", async () => {
    mockWalletFindUnique.mockResolvedValue(wallet());
    const r = await run({ newExpiryDate: "2026-06-15" });
    expect(r.success).toBe(false);
    expect(mockWalletUpdate).not.toHaveBeenCalled();
  });

  it("缺 reason → schema 拒絕", async () => {
    mockWalletFindUnique.mockResolvedValue(wallet());
    const r = await run({ newExpiryDate: "2026-07-15", reason: "" });
    expect(r.success).toBe(false);
    expect(mockWalletUpdate).not.toHaveBeenCalled();
  });
});

describe("extendWalletExpiry — 正常延長", () => {
  it("ACTIVE 延長：更新 expiryDate、不改 status、寫 AuditLog、不建 Transaction", async () => {
    mockWalletFindUnique.mockResolvedValue(wallet());
    const r = await run({ newExpiryDate: "2026-07-15" });
    expect(r.success).toBe(true);

    const upd = mockWalletUpdate.mock.calls[0][0];
    expect(upd.where).toEqual({ id: WALLET_ID });
    expect(upd.data.expiryDate).toBeInstanceOf(Date);
    expect(upd.data.expiryDate.toISOString().slice(0, 10)).toBe("2026-07-15");
    expect(upd.data).not.toHaveProperty("status"); // ACTIVE 不改 status
    expect(upd.data).not.toHaveProperty("remainingSessions");
    expect(upd.data).not.toHaveProperty("totalSessions");
    expect(upd.data).not.toHaveProperty("startDate");

    const audit = mockAuditCreate.mock.calls[0][0].data;
    expect(audit.targetType).toBe("CustomerPlanWallet");
    expect(audit.targetId).toBe(WALLET_ID);
    expect(audit.action).toBe("EXTEND_EXPIRY");
    expect(audit.beforeJson).toMatchObject({ expiryDate: "2026-06-30", status: "ACTIVE" });
    expect(audit.afterJson).toMatchObject({
      expiryDate: "2026-07-15",
      status: "ACTIVE",
      reason: "顧客請假補償",
    });

    expect(mockTxTransactionCreate).not.toHaveBeenCalled(); // 不建立 Transaction
  });

  it("非 cuid 固定 ID（staging seed）也可延長 — 不被 schema 擋", async () => {
    mockWalletFindUnique.mockResolvedValue(
      wallet({ id: "staging-wallet-001" }),
    );
    const r = await run({ walletId: "staging-wallet-001", newExpiryDate: "2026-07-15" });
    expect(r.success).toBe(true);
    expect(mockWalletUpdate.mock.calls[0][0].where).toEqual({
      id: "staging-wallet-001",
    });
  });

  it("EXPIRED 延長：恢復為 ACTIVE，audit after.status=ACTIVE", async () => {
    mockWalletFindUnique.mockResolvedValue(
      wallet({ status: "EXPIRED", expiryDate: new Date("2026-05-01T00:00:00.000Z") }),
    );
    const r = await run({ newExpiryDate: "2026-06-01" });
    expect(r.success).toBe(true);

    const upd = mockWalletUpdate.mock.calls[0][0];
    expect(upd.data.status).toBe("ACTIVE"); // EXPIRED → 恢復可用
    expect(upd.data.expiryDate.toISOString().slice(0, 10)).toBe("2026-06-01");

    const audit = mockAuditCreate.mock.calls[0][0].data;
    expect(audit.beforeJson).toMatchObject({ status: "EXPIRED", expiryDate: "2026-05-01" });
    expect(audit.afterJson).toMatchObject({ status: "ACTIVE", expiryDate: "2026-06-01" });
    expect(mockTxTransactionCreate).not.toHaveBeenCalled();
  });
});
