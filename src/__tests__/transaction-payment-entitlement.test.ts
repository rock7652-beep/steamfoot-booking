import { beforeEach, describe, expect, it, vi } from "vitest";

const transactionFindUnique = vi.fn();
const transactionUpdateMany = vi.fn();
const transactionUpdate = vi.fn();
const transactionCount = vi.fn();
const walletCreate = vi.fn();
const walletFindUnique = vi.fn();
const walletUpdate = vi.fn();
const sessionGroupBy = vi.fn();
const sessionUpdateMany = vi.fn();
const customerFindUnique = vi.fn();
const customerUpdate = vi.fn();
const seedWalletSessions = vi.fn();
const runTransaction = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    transaction: { findUnique: transactionFindUnique },
    $transaction: (cb: (tx: unknown) => Promise<unknown>) => runTransaction(cb),
  },
}));
vi.mock("@/lib/permissions", () => ({ requirePermission: vi.fn(async () => ({ role: "OWNER" })) }));
vi.mock("@/lib/manager-visibility", () => ({ assertStoreAccess: vi.fn() }));
vi.mock("@/lib/revalidation", () => ({ revalidateTransactions: vi.fn() }));
vi.mock("@/server/services/referral-points", () => ({ awardFirstTopupReferralPointsIfEligible: vi.fn() }));
vi.mock("@/server/services/wallet-session", () => ({ seedWalletSessions: (...args: unknown[]) => seedWalletSessions(...args) }));
vi.mock("@/lib/date-utils", () => ({
  toLocalDateStr: () => "2026-07-20",
  parseTaiwanDateToDbDate: (value: string) => new Date(`${value}T00:00:00.000Z`),
}));

const pending = {
  id: "tx_1", storeId: "store_1", customerId: "customer_1", paymentStatus: "PENDING",
  paymentMethod: "TRANSFER", status: "SUCCESS", customerPlanWalletId: null,
  planId: "plan_1", amount: 3000, planSessionCountSnapshot: 3,
  pendingWalletExpiryDateSnapshot: new Date("2026-12-31T00:00:00.000Z"), note: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  transactionFindUnique.mockResolvedValue(pending);
  transactionUpdateMany.mockResolvedValue({ count: 1 });
  transactionUpdate.mockResolvedValue(undefined);
  customerFindUnique.mockResolvedValue({ convertedAt: new Date("2025-01-01") });
  customerUpdate.mockResolvedValue(undefined);
  walletCreate.mockResolvedValue({ id: "wallet_1" });
  walletFindUnique.mockResolvedValue({ id: "wallet_1", totalSessions: 3, status: "ACTIVE" });
  walletUpdate.mockResolvedValue(undefined);
  sessionGroupBy.mockResolvedValue([{ status: "AVAILABLE", _count: { _all: 3 } }]);
  sessionUpdateMany.mockResolvedValue({ count: 3 });
  transactionCount.mockResolvedValue(0);
  runTransaction.mockImplementation((cb) => cb({
    transaction: { updateMany: transactionUpdateMany, update: transactionUpdate, count: transactionCount },
    customerPlanWallet: { create: walletCreate, findUnique: walletFindUnique, update: walletUpdate },
    walletSession: { groupBy: sessionGroupBy, updateMany: sessionUpdateMany },
    customer: { findUnique: customerFindUnique, update: customerUpdate },
  }));
});

describe("pending payment entitlement", () => {
  it("確認付款後才以封存 expiry 建立 wallet 與 sessions", async () => {
    const { confirmTransactionPayment } = await import("@/server/actions/transaction");
    await expect(confirmTransactionPayment("tx_1")).resolves.toMatchObject({ success: true });
    expect(walletCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      startDate: new Date("2026-07-20T00:00:00.000Z"),
      expiryDate: new Date("2026-12-31T00:00:00.000Z"), totalSessions: 3,
    }) }));
    expect(seedWalletSessions).toHaveBeenCalledWith(expect.anything(), "wallet_1", 3);
    expect(transactionUpdate).toHaveBeenCalledWith({ where: { id: "tx_1" }, data: { customerPlanWalletId: "wallet_1" } });
  });

  it("CAS 失敗不會重複建立 wallet", async () => {
    transactionUpdateMany.mockResolvedValue({ count: 0 });
    const { confirmTransactionPayment } = await import("@/server/actions/transaction");
    await expect(confirmTransactionPayment("tx_1")).resolves.toMatchObject({ success: false });
    expect(walletCreate).not.toHaveBeenCalled();
  });

  it("無期限方案以 null expiryDate 開通", async () => {
    transactionFindUnique.mockResolvedValue({ ...pending, pendingWalletExpiryDateSnapshot: null });
    const { confirmTransactionPayment } = await import("@/server/actions/transaction");
    await expect(confirmTransactionPayment("tx_1")).resolves.toMatchObject({ success: true });
    expect(walletCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ expiryDate: null }) }));
  });

  it("歷史 PENDING 已有 wallet 時確認不重建", async () => {
    transactionFindUnique.mockResolvedValue({ ...pending, customerPlanWalletId: "legacy_wallet" });
    const { confirmTransactionPayment } = await import("@/server/actions/transaction");
    await expect(confirmTransactionPayment("tx_1")).resolves.toMatchObject({ success: true });
    expect(walletCreate).not.toHaveBeenCalled();
    expect(seedWalletSessions).not.toHaveBeenCalled();
  });

  it("新式無 wallet PENDING 可直接作廢", async () => {
    const { voidPendingTransaction } = await import("@/server/actions/transaction");
    await expect(voidPendingTransaction("tx_1")).resolves.toMatchObject({ success: true });
    expect(sessionUpdateMany).not.toHaveBeenCalled();
  });

  it("歷史 PENDING 全 AVAILABLE wallet 可安全作廢", async () => {
    transactionFindUnique.mockResolvedValue({ ...pending, customerPlanWalletId: "legacy_wallet" });
    const { voidPendingTransaction } = await import("@/server/actions/transaction");
    await expect(voidPendingTransaction("tx_1")).resolves.toMatchObject({ success: true });
    expect(sessionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { walletId: "wallet_1", status: "AVAILABLE" },
      data: expect.objectContaining({ status: "VOIDED" }),
    }));
    expect(walletUpdate).toHaveBeenCalledWith({ where: { id: "wallet_1" }, data: { status: "CANCELLED", remainingSessions: 0 } });
  });

  it.each(["RESERVED", "COMPLETED"])("歷史 wallet 有 %s 時拒絕自動作廢", async (status) => {
    transactionFindUnique.mockResolvedValue({ ...pending, customerPlanWalletId: "legacy_wallet" });
    sessionGroupBy.mockResolvedValue([{ status, _count: { _all: 1 } }, { status: "AVAILABLE", _count: { _all: 2 } }]);
    const { voidPendingTransaction } = await import("@/server/actions/transaction");
    await expect(voidPendingTransaction("tx_1")).resolves.toMatchObject({ success: false });
    expect(walletUpdate).not.toHaveBeenCalled();
  });

  it("歷史 wallet 有相關調整交易時拒絕自動作廢", async () => {
    transactionFindUnique.mockResolvedValue({ ...pending, customerPlanWalletId: "legacy_wallet" });
    transactionCount.mockResolvedValue(1);
    const { voidPendingTransaction } = await import("@/server/actions/transaction");
    await expect(voidPendingTransaction("tx_1")).resolves.toMatchObject({ success: false });
    expect(walletUpdate).not.toHaveBeenCalled();
  });
});
