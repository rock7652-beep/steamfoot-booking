import { beforeEach, describe, expect, it, vi } from "vitest";

const CUSTOMER_ID = "cust-taichung";
const WALLET_ID = "wallet-taichung";
const BOOKING_ID = "booking-taichung";
const STAFF_ID = "staff-taichung";
const USER_ID = "user-owner";

const h = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  requireWritablePermission: vi.fn(),
  checkCurrentStoreFeature: vi.fn(),
  customerFindUnique: vi.fn(),
  walletFindFirst: vi.fn(),
  bookingFindFirst: vi.fn(),
  txCreate: vi.fn(),
  txRun: vi.fn(),
  buildSnapshot: vi.fn(),
  revalidateTransactions: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: { findUnique: h.customerFindUnique },
    customerPlanWallet: { findFirst: h.walletFindFirst },
    booking: { findFirst: h.bookingFindFirst },
    transaction: { create: h.txCreate },
    $transaction: h.txRun,
  },
}));
vi.mock("@/lib/permissions", () => ({
  requirePermission: h.requirePermission,
  requireWritablePermission: h.requireWritablePermission,
}));
vi.mock("@/lib/feature-gate", () => ({
  checkCurrentStoreFeature: h.checkCurrentStoreFeature,
}));
vi.mock("@/lib/feature-flags", () => ({
  FEATURES: { TRANSACTION_MANAGEMENT: "transaction_management" },
}));
vi.mock("@/lib/subscription-guard", () => ({
  assertStoreSubscriptionWritable: vi.fn(async () => undefined),
}));
vi.mock("@/lib/manager-visibility", () => ({ assertStoreAccess: vi.fn() }));
vi.mock("@/lib/store", () => ({
  currentStoreId: (u: { storeId?: string | null }) => u.storeId ?? "store-taichung",
}));
vi.mock("@/lib/transaction-snapshot", () => ({
  buildTransactionSnapshot: h.buildSnapshot,
  buildRefundSnapshot: vi.fn(() => ({})),
}));
vi.mock("@/server/queries/transaction", () => ({ getTransactionDetail: vi.fn() }));
vi.mock("@/server/services/referral-points", () => ({
  awardFirstTopupReferralPointsIfEligible: vi.fn(),
}));
vi.mock("@/lib/revalidation", () => ({ revalidateTransactions: h.revalidateTransactions }));

beforeEach(() => {
  vi.clearAllMocks();
  h.requirePermission.mockResolvedValue({
    id: USER_ID,
    role: "OWNER",
    storeId: "store-taichung",
    staffId: STAFF_ID,
  });
  h.requireWritablePermission.mockResolvedValue({
    id: USER_ID,
    role: "OWNER",
    storeId: "store-taichung",
    staffId: STAFF_ID,
  });
  h.checkCurrentStoreFeature.mockResolvedValue(undefined);
  h.customerFindUnique.mockResolvedValue({
    id: CUSTOMER_ID,
    assignedStaffId: STAFF_ID,
    storeId: "store-taichung",
  });
  h.walletFindFirst.mockResolvedValue({
    id: WALLET_ID,
    customerId: CUSTOMER_ID,
    storeId: "store-taichung",
  });
  h.bookingFindFirst.mockResolvedValue({
    id: BOOKING_ID,
    customerId: CUSTOMER_ID,
    storeId: "store-taichung",
  });
  h.buildSnapshot.mockResolvedValue({
    transactionNo: "TXN-1",
    transactionDate: new Date(),
    status: "SUCCESS",
  });
  h.txCreate.mockResolvedValue({ id: "tx-1" });
  h.txRun.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({ transaction: { create: h.txCreate } }),
  );
});

describe("transaction actions — store consistency", () => {
  it("allows same-store createTransaction", async () => {
    const { createTransaction } = await import("@/server/actions/transaction");
    const result = await createTransaction({
      customerId: CUSTOMER_ID,
      customerPlanWalletId: WALLET_ID,
      bookingId: BOOKING_ID,
      transactionType: "PACKAGE_PURCHASE",
      paymentMethod: "CASH",
      amount: 5990,
    });

    expect(result.success).toBe(true);
    expect(h.txCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: CUSTOMER_ID,
          customerPlanWalletId: WALLET_ID,
          bookingId: BOOKING_ID,
          storeId: "store-taichung",
        }),
      }),
    );
  });

  it("rejects Taichung transaction + Zhubei customer before creating a transaction", async () => {
    h.customerFindUnique.mockResolvedValueOnce({
      id: CUSTOMER_ID,
      assignedStaffId: STAFF_ID,
      storeId: "store-zhubei",
    });
    const { createTransaction } = await import("@/server/actions/transaction");
    const result = await createTransaction({
      customerId: CUSTOMER_ID,
      transactionType: "PACKAGE_PURCHASE",
      paymentMethod: "CASH",
      amount: 5990,
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("STORE_CONSISTENCY_MISMATCH");
    expect(h.txCreate).not.toHaveBeenCalled();
  });

  it("rejects a cross-store wallet on createTransaction", async () => {
    h.walletFindFirst.mockResolvedValueOnce({
      id: WALLET_ID,
      customerId: CUSTOMER_ID,
      storeId: "store-zhubei",
    });
    const { createTransaction } = await import("@/server/actions/transaction");
    const result = await createTransaction({
      customerId: CUSTOMER_ID,
      customerPlanWalletId: WALLET_ID,
      transactionType: "PACKAGE_PURCHASE",
      paymentMethod: "CASH",
      amount: 5990,
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("STORE_CONSISTENCY_MISMATCH");
    expect(h.txCreate).not.toHaveBeenCalled();
  });

  it("rejects a cross-store booking on createTransaction", async () => {
    h.bookingFindFirst.mockResolvedValueOnce({
      id: BOOKING_ID,
      customerId: CUSTOMER_ID,
      storeId: "store-zhubei",
    });
    const { createTransaction } = await import("@/server/actions/transaction");
    const result = await createTransaction({
      customerId: CUSTOMER_ID,
      bookingId: BOOKING_ID,
      transactionType: "SINGLE_PURCHASE",
      paymentMethod: "CASH",
      amount: 799,
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("STORE_CONSISTENCY_MISMATCH");
    expect(h.txCreate).not.toHaveBeenCalled();
  });

  it("allows same-store createAdjustment", async () => {
    const { createAdjustment } = await import("@/server/actions/transaction");
    const result = await createAdjustment({
      customerId: CUSTOMER_ID,
      amount: 100,
      note: "補差額",
    });

    expect(result.success).toBe(true);
    expect(h.txCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: CUSTOMER_ID,
          storeId: "store-taichung",
        }),
      }),
    );
  });
});
