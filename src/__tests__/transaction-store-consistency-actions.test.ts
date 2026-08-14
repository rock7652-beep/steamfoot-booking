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
  txUpdate: vi.fn(),
  transactionFindUnique: vi.fn(),
  txWalletFindFirst: vi.fn(),
  walletSessionFindMany: vi.fn(),
  walletSessionUpdateMany: vi.fn(),
  txWalletUpdateMany: vi.fn(),
  txTransactionUpdateMany: vi.fn(),
  transactionAuditCreate: vi.fn(),
  txRun: vi.fn(),
  buildSnapshot: vi.fn(),
  revalidateTransactions: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: { findUnique: h.customerFindUnique },
    customerPlanWallet: { findFirst: h.walletFindFirst },
    booking: { findFirst: h.bookingFindFirst },
    transaction: { create: h.txCreate, findUnique: h.transactionFindUnique },
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
  h.txUpdate.mockResolvedValue({});
  h.transactionFindUnique.mockResolvedValue({
    id: "original-tx",
    customerId: CUSTOMER_ID,
    bookingId: BOOKING_ID,
    revenueStaffId: STAFF_ID,
    customerPlanWalletId: WALLET_ID,
    transactionType: "PACKAGE_PURCHASE",
    storeId: "store-zhubei",
    amount: 5990,
    status: "SUCCESS",
    paymentStatus: "PENDING",
    paymentMethod: "TRANSFER",
    customer: { assignedStaffId: STAFF_ID },
  });
  h.txRun.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      transaction: {
        create: h.txCreate,
        update: h.txUpdate,
        updateMany: h.txTransactionUpdateMany,
      },
      customerPlanWallet: {
        findFirst: h.txWalletFindFirst,
        updateMany: h.txWalletUpdateMany,
      },
      walletSession: {
        findMany: h.walletSessionFindMany,
        updateMany: h.walletSessionUpdateMany,
      },
      transactionAuditLog: { create: h.transactionAuditCreate },
    }),
  );
  h.txWalletFindFirst.mockResolvedValue({
    id: WALLET_ID,
    totalSessions: 10,
    remainingSessions: 10,
  });
  h.walletSessionFindMany.mockResolvedValue(
    Array.from({ length: 10 }, (_, i) => ({ id: `session-${i}`, status: "AVAILABLE", bookingId: null })),
  );
  h.walletSessionUpdateMany.mockResolvedValue({ count: 10 });
  h.txWalletUpdateMany.mockResolvedValue({ count: 1 });
  h.txTransactionUpdateMany.mockResolvedValue({ count: 1 });
  h.transactionAuditCreate.mockResolvedValue({});
});

describe("transaction actions — store consistency", () => {
  it("voids every PACKAGE_PURCHASE wallet session with the acting staff audit id", async () => {
    const { voidTransaction } = await import("@/server/actions/transaction");
    const result = await voidTransaction({ transactionId: "void-package", reason: "重複建單" });

    expect(result.success).toBe(true);
    expect(h.walletSessionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "VOIDED",
        voidedByStaffId: STAFF_ID,
      }),
    }));
  });

  it("allows a paid mistake entry when every session is still unused", async () => {
    h.transactionFindUnique.mockResolvedValueOnce({
      id: "paid-mistake",
      storeId: "store-taichung",
      customerId: CUSTOMER_ID,
      status: "SUCCESS",
      paymentStatus: "PAID",
      paymentMethod: "CASH",
      transactionType: "PACKAGE_PURCHASE",
      customerPlanWalletId: WALLET_ID,
      amount: 5990,
      note: null,
    });

    const { voidTransaction } = await import("@/server/actions/transaction");
    const result = await voidTransaction({ transactionId: "paid-mistake", reason: "入錯帳" });

    expect(result.success).toBe(true);
    expect(h.walletSessionUpdateMany).toHaveBeenCalled();
    expect(h.txWalletUpdateMany).toHaveBeenCalled();
    expect(h.txTransactionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ paymentStatus: "PAID" }),
      data: expect.objectContaining({ status: "VOIDED" }),
    }));
  });

  it.each(["RESERVED", "COMPLETED"])(
    "still rejects a paid mistake entry when a session is %s",
    async (sessionStatus) => {
      h.transactionFindUnique.mockResolvedValueOnce({
        id: `paid-${sessionStatus.toLowerCase()}`,
        storeId: "store-taichung",
        customerId: CUSTOMER_ID,
        status: "SUCCESS",
        paymentStatus: "PAID",
        paymentMethod: "CASH",
        transactionType: "PACKAGE_PURCHASE",
        customerPlanWalletId: WALLET_ID,
        amount: 5990,
        note: null,
      });
      h.walletSessionFindMany.mockResolvedValueOnce([
        { id: "changed-session", status: sessionStatus, bookingId: sessionStatus === "RESERVED" ? "booking-1" : null },
        ...Array.from({ length: 9 }, (_, i) => ({
          id: `available-${i}`,
          status: "AVAILABLE",
          bookingId: null,
        })),
      ]);

      const { voidTransaction } = await import("@/server/actions/transaction");
      const result = await voidTransaction({
        transactionId: `paid-${sessionStatus.toLowerCase()}`,
        reason: "入錯帳",
      });

      expect(result.success).toBe(false);
      expect(h.walletSessionUpdateMany).not.toHaveBeenCalled();
      expect(h.txWalletUpdateMany).not.toHaveBeenCalled();
      expect(h.txTransactionUpdateMany).not.toHaveBeenCalled();
    },
  );

  it("voids a SINGLE_PURCHASE wallet session with the acting staff audit id", async () => {
    h.transactionFindUnique.mockResolvedValueOnce({
      id: "single-void",
      storeId: "store-taichung",
      customerId: CUSTOMER_ID,
      status: "SUCCESS",
      paymentStatus: "PENDING",
      paymentMethod: "TRANSFER",
      transactionType: "SINGLE_PURCHASE",
      customerPlanWalletId: WALLET_ID,
      amount: 0,
      note: null,
    });
    h.txWalletFindFirst.mockResolvedValueOnce({ id: WALLET_ID, totalSessions: 1, remainingSessions: 1 });
    h.walletSessionFindMany.mockResolvedValueOnce([{ id: "single-session", status: "AVAILABLE", bookingId: null }]);
    h.walletSessionUpdateMany.mockResolvedValueOnce({ count: 1 });

    const { voidTransaction } = await import("@/server/actions/transaction");
    const result = await voidTransaction({ transactionId: "single-void", reason: "重複贈送" });

    expect(result.success).toBe(true);
    expect(h.walletSessionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ voidedByStaffId: STAFF_ID }),
    }));
  });

  it("permits an owner without staffId and records a null session audit staff", async () => {
    h.requireWritablePermission.mockResolvedValueOnce({
      id: USER_ID,
      role: "ADMIN",
      storeId: "store-taichung",
      staffId: null,
    });
    const { voidTransaction } = await import("@/server/actions/transaction");
    const result = await voidTransaction({ transactionId: "void-no-staff", reason: "重複建單" });

    expect(result.success).toBe(true);
    expect(h.walletSessionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ voidedByStaffId: null }),
    }));
  });

  it("stops before wallet and transaction writes when the session CAS count changes", async () => {
    h.walletSessionUpdateMany.mockResolvedValueOnce({ count: 9 });
    const { voidTransaction } = await import("@/server/actions/transaction");
    const result = await voidTransaction({ transactionId: "void-race", reason: "重複建單" });

    expect(result.success).toBe(false);
    expect(h.txWalletUpdateMany).not.toHaveBeenCalled();
    expect(h.txTransactionUpdateMany).not.toHaveBeenCalled();
  });

  it("does not overwrite audit fields when a transaction is already voided", async () => {
    h.transactionFindUnique.mockResolvedValueOnce({
      id: "already-voided",
      storeId: "store-taichung",
      customerId: CUSTOMER_ID,
      status: "VOIDED",
      paymentStatus: "CANCELLED",
      paymentMethod: "TRANSFER",
      transactionType: "SINGLE_PURCHASE",
      customerPlanWalletId: WALLET_ID,
      amount: 0,
      note: null,
    });
    const { voidTransaction } = await import("@/server/actions/transaction");
    const result = await voidTransaction({ transactionId: "already-voided", reason: "retry" });

    expect(result.success).toBe(false);
    expect(h.walletSessionUpdateMany).not.toHaveBeenCalled();
    expect(h.txTransactionUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects a PACKAGE_PURCHASE without a wallet link before any writes", async () => {
    h.transactionFindUnique.mockResolvedValueOnce({
      id: "package-without-wallet", storeId: "store-taichung", customerId: CUSTOMER_ID,
      status: "SUCCESS", paymentStatus: "PENDING", paymentMethod: "TRANSFER",
      transactionType: "PACKAGE_PURCHASE", customerPlanWalletId: null, amount: 0, note: null,
    });
    const { voidTransaction } = await import("@/server/actions/transaction");
    const result = await voidTransaction({ transactionId: "package-without-wallet", reason: "repair" });
    expect(result.success).toBe(false);
    expect(h.walletSessionUpdateMany).not.toHaveBeenCalled();
    expect(h.txWalletUpdateMany).not.toHaveBeenCalled();
    expect(h.txTransactionUpdateMany).not.toHaveBeenCalled();
  });

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

  it("legacy refund keeps the original transaction storeId", async () => {
    const { refundTransactionLegacy } = await import("@/server/actions/transaction");
    const result = await refundTransactionLegacy("original-tx", {
      amount: 1000,
      paymentMethod: "CASH",
      note: "退款",
    });

    expect(result.success).toBe(true);
    expect(h.txCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: CUSTOMER_ID,
          storeId: "store-zhubei",
          amount: -1000,
        }),
      }),
    );
  });
});
