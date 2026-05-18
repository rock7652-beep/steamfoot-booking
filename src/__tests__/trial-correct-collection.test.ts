import { describe, it, expect, vi, beforeEach } from "vitest";

// 體驗 499 PR-3b：correctTrialCollection 保證
//  - 收款更正 = void 原 TRIAL_PURCHASE + 重建新 TRIAL_PURCHASE SUCCESS
//  - OWNER-only：gate requirePermission("transaction.void")
//  - 僅 FIRST_TRIAL 且 PENDING/CONFIRMED；COMPLETED 拒絕
//  - 原交易需為同 booking 的 TRIAL_PURCHASE + SUCCESS
//  - void 失敗 → 不重收、無副作用
//  - void 成功但重收失敗 → 明確錯誤、預約回未收款
//  - 不碰 Wallet/WalletSession（@/lib/db mock 只暴露 booking/transaction）

const h = vi.hoisted(() => {
  const txCreate = vi.fn(async () => ({ id: "tx_new" }));
  return {
    txCreate,
    requirePermission: vi.fn(async () => ({
      id: "user_owner",
      role: "OWNER",
      storeId: "store_1",
      staffId: "op_staff",
    })),
    currentStoreId: vi.fn(() => "store_1"),
    getTrialSettings: vi.fn(async () => ({
      trialEnabled: true,
      trialDefaultPrice: 499,
      trialAllowPriceEdit: true,
      trialMinPrice: 0,
      trialMaxPrice: 3000,
    })),
    bookingFindFirst: vi.fn(),
    txFindFirst: vi.fn(),
    txRun: vi.fn(async (fn: (c: unknown) => unknown) =>
      fn({ transaction: { create: txCreate } }),
    ),
    buildSnapshot: vi.fn(async () => ({
      transactionNo: "TXN-9",
      transactionDate: new Date(),
      status: "SUCCESS" as const,
      coachNameSnapshot: null,
      coachRoleSnapshot: null,
      storeNameSnapshot: null,
      planId: "plan_trial",
      planNameSnapshot: null,
      planType: null,
      grossAmount: 0,
      discountAmount: 0,
      netAmount: 0,
      isFirstPurchase: false,
    })),
    revalidateBookings: vi.fn(),
    revalidateTransactions: vi.fn(),
    voidTransaction: vi.fn(
      async (): Promise<
        | { success: true; data: { transactionId: string } }
        | { success: false; error: string }
      > => ({ success: true, data: { transactionId: "tx_old" } }),
    ),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: { findFirst: h.bookingFindFirst },
    transaction: { findFirst: h.txFindFirst },
    $transaction: h.txRun,
  },
}));
vi.mock("@/lib/permissions", () => ({ requirePermission: h.requirePermission }));
vi.mock("@/lib/store", () => ({ currentStoreId: h.currentStoreId }));
vi.mock("@/lib/shop-config", () => ({
  getTrialSettings: h.getTrialSettings,
  clampTrialPrice: (
    input: number,
    s: {
      trialAllowPriceEdit: boolean;
      trialDefaultPrice: number;
      trialMinPrice: number;
      trialMaxPrice: number;
    },
  ) =>
    !s.trialAllowPriceEdit
      ? s.trialDefaultPrice
      : Math.min(
          Math.max(Math.round(input), Math.min(s.trialMinPrice, s.trialMaxPrice)),
          Math.max(s.trialMinPrice, s.trialMaxPrice),
        ),
}));
vi.mock("@/lib/transaction-snapshot", () => ({
  buildTransactionSnapshot: h.buildSnapshot,
}));
vi.mock("@/lib/revalidation", () => ({
  revalidateBookings: h.revalidateBookings,
  revalidateTransactions: h.revalidateTransactions,
}));
vi.mock("@/server/actions/transaction", () => ({
  voidTransaction: h.voidTransaction,
}));
vi.mock("@/server/services/trial-plan", () => ({
  ensureTrialPlan: vi.fn(async () => ({ id: "plan_trial" })),
}));
vi.mock("@/server/actions/customer", () => ({
  createCustomer: vi.fn(async () => ({ success: true, data: { customerId: "c" } })),
}));
vi.mock("@/server/actions/booking", () => ({
  createBooking: vi.fn(async () => ({ success: true, data: { bookingId: "b" } })),
}));
vi.mock("@/server/queries/staff", () => ({
  listStaffSelectOptions: vi.fn(async () => []),
}));
vi.mock("@/lib/errors", () => ({
  AppError: class AppError extends Error {
    code: string;
    constructor(code: string, msg: string) {
      super(msg);
      this.code = code;
    }
  },
  handleActionError: (e: unknown) => ({
    success: false,
    error: e instanceof Error ? e.message : "err",
  }),
}));

import { correctTrialCollection } from "@/server/actions/trial-booking";

type TxArg = { transactionType: string; paymentStatus: string; amount: number; bookingId: string; status: string };
const lastNewTx = (): TxArg =>
  (h.txCreate.mock.calls.at(-1) as unknown as [{ data: TxArg }])[0].data;

const BOOKING_OK = {
  id: "bk_1",
  bookingType: "FIRST_TRIAL",
  bookingStatus: "PENDING",
  customerId: "cust_1",
  servicePlanId: "plan_trial",
  expectedAmount: null,
  customer: { assignedStaffId: "assigned_owner" },
};
const ORIGINAL_OK = {
  id: "tx_old",
  bookingId: "bk_1",
  transactionType: "TRIAL_PURCHASE",
  status: "SUCCESS",
};
const base = {
  bookingId: "bk_1",
  originalTransactionId: "tx_old",
  paymentMethod: "CASH" as const,
  reason: "雙人優惠，調整為 400",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.requirePermission.mockResolvedValue({
    id: "user_owner",
    role: "OWNER",
    storeId: "store_1",
    staffId: "op_staff",
  });
  h.currentStoreId.mockReturnValue("store_1");
  h.getTrialSettings.mockResolvedValue({
    trialEnabled: true,
    trialDefaultPrice: 499,
    trialAllowPriceEdit: true,
    trialMinPrice: 0,
    trialMaxPrice: 3000,
  });
  h.voidTransaction.mockResolvedValue({ success: true, data: { transactionId: "tx_old" } });
  h.txCreate.mockResolvedValue({ id: "tx_new" });
  // booking.findFirst: call#1 correctTrialCollection, call#2 collectTrialPayment
  h.bookingFindFirst.mockResolvedValue(BOOKING_OK as unknown as never);
  // transaction.findFirst: call#1 = original lookup (SUCCESS), call#2 = double-collect (null)
  h.txFindFirst.mockReset();
  h.txFindFirst.mockResolvedValueOnce(ORIGINAL_OK as unknown as never);
  h.txFindFirst.mockResolvedValue(null);
});

describe("correctTrialCollection — happy path (void + recollect)", () => {
  it("voids original then creates a new TRIAL_PURCHASE SUCCESS, returns new id", async () => {
    const r = await correctTrialCollection({ ...base, amount: 400 });
    expect(r.success).toBe(true);
    expect(h.voidTransaction).toHaveBeenCalledWith({
      transactionId: "tx_old",
      reason: "雙人優惠，調整為 400",
    });
    expect(h.txCreate).toHaveBeenCalledTimes(1);
    const t = lastNewTx();
    expect(t.transactionType).toBe("TRIAL_PURCHASE");
    expect(t.status).toBe("SUCCESS");
    expect(t.paymentStatus).toBe("SUCCESS");
    expect(t.amount).toBe(400);
    expect(t.bookingId).toBe("bk_1");
    expect((r as { data: { transactionId: string } }).data.transactionId).toBe("tx_new");
    expect(h.revalidateBookings).toHaveBeenCalled();
    expect(h.revalidateTransactions).toHaveBeenCalled();
  });

  it("clamps over-max new amount (5000 → 3000)", async () => {
    const r = await correctTrialCollection({ ...base, amount: 5000 });
    expect(r.success).toBe(true);
    expect(lastNewTx().amount).toBe(3000);
  });
});

describe("correctTrialCollection — guards (no void, no new tx)", () => {
  it("rejects when caller lacks transaction.void permission", async () => {
    h.requirePermission.mockRejectedValueOnce(new Error("您沒有此操作的權限"));
    const r = await correctTrialCollection(base);
    expect(r.success).toBe(false);
    expect(h.voidTransaction).not.toHaveBeenCalled();
    expect(h.txCreate).not.toHaveBeenCalled();
  });

  it("rejects non-FIRST_TRIAL booking", async () => {
    h.bookingFindFirst.mockReset();
    h.bookingFindFirst.mockResolvedValue({ ...BOOKING_OK, bookingType: "SINGLE" } as unknown as never);
    const r = await correctTrialCollection(base);
    expect(r.success).toBe(false);
    expect(h.voidTransaction).not.toHaveBeenCalled();
  });

  it("rejects COMPLETED booking (decision B)", async () => {
    h.bookingFindFirst.mockReset();
    h.bookingFindFirst.mockResolvedValue({ ...BOOKING_OK, bookingStatus: "COMPLETED" } as unknown as never);
    const r = await correctTrialCollection(base);
    expect(r.success).toBe(false);
    expect(h.voidTransaction).not.toHaveBeenCalled();
    expect(h.txCreate).not.toHaveBeenCalled();
  });

  it("rejects when original tx is not this booking's TRIAL_PURCHASE SUCCESS", async () => {
    h.txFindFirst.mockReset();
    h.txFindFirst.mockResolvedValue({ ...ORIGINAL_OK, status: "VOIDED" } as unknown as never);
    const r = await correctTrialCollection(base);
    expect(r.success).toBe(false);
    expect(h.voidTransaction).not.toHaveBeenCalled();
  });
});

describe("correctTrialCollection — failure handling", () => {
  it("void fails → returns void error, no new collection", async () => {
    h.voidTransaction.mockResolvedValue({ success: false, error: "此交易狀態已變更，無法取消" });
    const r = await correctTrialCollection(base);
    expect(r.success).toBe(false);
    expect((r as { error: string }).error).toBe("此交易狀態已變更，無法取消");
    expect(h.txCreate).not.toHaveBeenCalled();
  });

  it("void ok but recollect fails → distinct '原收款已作廢' message", async () => {
    // double-collect guard sees an existing SUCCESS → collectTrialPayment throws
    h.txFindFirst.mockReset();
    h.txFindFirst.mockResolvedValueOnce(ORIGINAL_OK as unknown as never); // original lookup
    h.txFindFirst.mockResolvedValue({ id: "tx_dup" }); // collect double-collect guard
    const r = await correctTrialCollection(base);
    expect(r.success).toBe(false);
    expect((r as { error: string }).error).toContain("原收款已作廢");
    expect(h.voidTransaction).toHaveBeenCalledTimes(1);
    expect(h.txCreate).not.toHaveBeenCalled();
  });
});

describe("correctTrialCollectionSchema", () => {
  it("accepts non-cuid ids + valid method + reason", async () => {
    const { correctTrialCollectionSchema } = await import("@/lib/validators/trial-booking");
    expect(() =>
      correctTrialCollectionSchema.parse({
        bookingId: "staging-bk-1",
        originalTransactionId: "staging-tx-1",
        paymentMethod: "CASH",
        reason: "誤收金額",
      }),
    ).not.toThrow();
  });
  it("rejects empty reason", async () => {
    const { correctTrialCollectionSchema } = await import("@/lib/validators/trial-booking");
    expect(() =>
      correctTrialCollectionSchema.parse({
        bookingId: "bk_1",
        originalTransactionId: "tx_old",
        paymentMethod: "CASH",
        reason: "",
      }),
    ).toThrow();
  });
  it("rejects UNPAID payment method", async () => {
    const { correctTrialCollectionSchema } = await import("@/lib/validators/trial-booking");
    expect(() =>
      correctTrialCollectionSchema.parse({
        bookingId: "bk_1",
        originalTransactionId: "tx_old",
        paymentMethod: "UNPAID",
        reason: "x",
      }),
    ).toThrow();
  });
});
