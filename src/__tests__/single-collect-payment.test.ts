import { describe, it, expect, vi, beforeEach } from "vitest";

// 單次（SINGLE，不扣堂）現場收款 — collectSinglePayment 行為保證：
//  - 只在「真的收款」時建立 1 筆 SINGLE_PURCHASE 交易
//  - status=SUCCESS（snapshot）+ paymentStatus=SUCCESS（明確）+ paidAt 有值
//  - bookingId 連到該 SINGLE 預約、paymentMethod 必填
//  - 不建 PENDING；@/lib/db mock 只暴露 booking + transaction，任何
//    prisma.customerPlanWallet.* / walletSession.* 會 throw → 測試會 fail
//    （= wallet-free / 不扣堂保證）
//  - 防重複收款、型別/狀態/跨店 guard、歸屬快照、金額上限校驗

const h = vi.hoisted(() => {
  const txCreate = vi.fn(async () => ({ id: "tx_1" }));
  // P1 race-safe duplicate guard：findFirst 已移進 prisma.$transaction，
  // 所以這支 mock 是給 txClient.transaction.findFirst 用，不是給外層 prisma 用。
  const txFindFirstInTx = vi.fn(async () => null as { id: string } | null);
  // FOR UPDATE row lock — 紀錄被呼叫即可，回傳值不重要。
  const queryRaw: ReturnType<typeof vi.fn> = vi.fn();
  return {
    txCreate,
    txFindFirstInTx,
    queryRaw,
    requirePermission: vi.fn(async () => ({
      storeId: "store_1",
      staffId: "op_staff",
    })),
    currentStoreId: vi.fn(() => "store_1"),
    bookingFindFirst: vi.fn(
      async () =>
        ({
          id: "bk_1",
          bookingType: "SINGLE",
          bookingStatus: "PENDING",
          customerId: "cust_1",
          revenueStaffId: null as string | null,
          servicePlanId: "plan_single",
          servicePlan: { price: 799 },
          customer: { assignedStaffId: null as string | null },
        }) as unknown,
    ),
    txRun: vi.fn(async (fn: (c: unknown) => unknown) =>
      fn({
        transaction: { create: txCreate, findFirst: txFindFirstInTx },
        $queryRaw: queryRaw,
      }),
    ),
    buildSnapshot: vi.fn(
      async (
        _tx: unknown,
        params: { grossAmount: number; netAmount: number },
      ) => ({
        transactionNo: "TXN-1",
        transactionDate: new Date(),
        status: "SUCCESS" as const,
        coachNameSnapshot: null,
        coachRoleSnapshot: null,
        storeNameSnapshot: null,
        planId: "plan_single",
        planNameSnapshot: null,
        planType: null,
        grossAmount: params.grossAmount,
        discountAmount: Math.max(0, params.grossAmount - params.netAmount),
        netAmount: params.netAmount,
        isFirstPurchase: true,
      }),
    ),
    revalidateBookings: vi.fn(),
    revalidateTransactions: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: { findFirst: h.bookingFindFirst },
    $transaction: h.txRun,
  },
}));
vi.mock("@/lib/permissions", () => ({
  requirePermission: h.requirePermission,
  requireWritablePermission: h.requirePermission,
}));
vi.mock("@/lib/store", () => ({ currentStoreId: h.currentStoreId }));
vi.mock("@/lib/transaction-snapshot", () => ({
  buildTransactionSnapshot: h.buildSnapshot,
}));
vi.mock("@/lib/revalidation", () => ({
  revalidateBookings: h.revalidateBookings,
  revalidateTransactions: h.revalidateTransactions,
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

import { collectSinglePayment } from "@/server/actions/single-booking";

type TxArg = {
  customerId: string;
  bookingId: string;
  revenueStaffId: string;
  serviceStaffId: string | null;
  soldByStaffId: string | null;
  transactionType: string;
  paymentMethod: string;
  paymentStatus: string;
  paidAt: Date;
  amount: number;
  storeId: string;
  status: string;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  discountReason: string | null;
  note: string | null;
  customerPlanWalletId?: string | null;
};
const lastTx = (): TxArg =>
  (h.txCreate.mock.calls.at(-1) as unknown as [{ data: TxArg }])[0].data;

beforeEach(() => {
  vi.clearAllMocks();
  h.requirePermission.mockResolvedValue({
    storeId: "store_1",
    staffId: "op_staff",
  });
  h.currentStoreId.mockReturnValue("store_1");
  h.txFindFirstInTx.mockResolvedValue(null);
  h.queryRaw.mockResolvedValue([]);
  h.txCreate.mockResolvedValue({ id: "tx_1" });
  h.bookingFindFirst.mockResolvedValue({
    id: "bk_1",
    bookingType: "SINGLE",
    bookingStatus: "PENDING",
    customerId: "cust_1",
    revenueStaffId: null,
    servicePlanId: "plan_single",
    servicePlan: { price: 799 },
    customer: { assignedStaffId: null },
  } as unknown as never);
});

const base = { bookingId: "bk_1", paymentMethod: "CASH" as const };

describe("collectSinglePayment — SUCCESS-only real-revenue tx", () => {
  it("creates exactly ONE SINGLE_PURCHASE tx, SUCCESS+SUCCESS, paidAt set, bookingId linked", async () => {
    const r = await collectSinglePayment(base);
    expect(r.success).toBe(true);
    expect(h.txCreate).toHaveBeenCalledTimes(1);
    const t = lastTx();
    expect(t.transactionType).toBe("SINGLE_PURCHASE");
    expect(t.paymentStatus).toBe("SUCCESS");
    expect(t.status).toBe("SUCCESS"); // from snapshot
    expect(t.bookingId).toBe("bk_1");
    expect(t.paymentMethod).toBe("CASH");
    expect(t.paidAt).toBeInstanceOf(Date);
    expect(h.revalidateBookings).toHaveBeenCalledTimes(1);
    expect(h.revalidateTransactions).toHaveBeenCalledTimes(1);
  });

  it("wallet-free: no customerPlanWalletId on tx; never touches wallet/session prisma models", async () => {
    const r = await collectSinglePayment(base);
    expect(r.success).toBe(true); // clean success ⇒ no customerPlanWallet/walletSession calls
    const t = lastTx();
    // 不應該寫 customerPlanWalletId（防扣堂污染）
    expect(t.customerPlanWalletId ?? null).toBeNull();
  });
});

describe("collectSinglePayment — double-collect guard (race-safe)", () => {
  it("rejects when a SINGLE_PURCHASE SUCCESS tx already exists; no second create", async () => {
    h.txFindFirstInTx.mockResolvedValue({ id: "tx_old" });
    const r = await collectSinglePayment(base);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/重複收款/);
    expect(h.txCreate).not.toHaveBeenCalled();
  });

  it("acquires Booking row lock BEFORE checking duplicates (race-safe)", async () => {
    await collectSinglePayment(base);
    // P1 防呆：FOR UPDATE 必須先發、findFirst 之後發、create 最後發。
    // 順序錯了 → race condition 還在。
    expect(h.queryRaw).toHaveBeenCalledTimes(1);
    expect(h.txFindFirstInTx).toHaveBeenCalledTimes(1);
    expect(h.txCreate).toHaveBeenCalledTimes(1);
    const queryRawOrder = h.queryRaw.mock.invocationCallOrder[0];
    const findFirstOrder = h.txFindFirstInTx.mock.invocationCallOrder[0];
    const createOrder = h.txCreate.mock.invocationCallOrder[0];
    expect(queryRawOrder).toBeLessThan(findFirstOrder);
    expect(findFirstOrder).toBeLessThan(createOrder);
  });

  it("FOR UPDATE query includes bookingId param + correct lock clause", async () => {
    await collectSinglePayment(base);
    const callArgs = h.queryRaw.mock.calls[0];
    // Prisma tagged template: first arg is the TemplateStringsArray (strings),
    // subsequent args are the interpolations. 確認 SQL 結構正確且 bookingId 有帶。
    const strings = callArgs[0] as unknown as string[];
    const joined = strings.join("?");
    expect(joined).toContain("Booking");
    expect(joined).toContain("FOR UPDATE");
    expect(callArgs.slice(1)).toContain("bk_1");
  });
});

describe("collectSinglePayment — type / status / store guards", () => {
  it.each(["FIRST_TRIAL", "PACKAGE_SESSION"])(
    "rejects bookingType=%s (only SINGLE)",
    async (bt) => {
      h.bookingFindFirst.mockResolvedValue({
        id: "bk_1",
        bookingType: bt,
        bookingStatus: "PENDING",
        customerId: "cust_1",
        revenueStaffId: null,
        servicePlanId: null,
        servicePlan: null,
        customer: { assignedStaffId: null },
      } as unknown as never);
      const r = await collectSinglePayment(base);
      expect(r.success).toBe(false);
      expect(h.txCreate).not.toHaveBeenCalled();
    },
  );

  it.each(["COMPLETED", "CANCELLED", "NO_SHOW"])(
    "rejects bookingStatus=%s",
    async (st) => {
      h.bookingFindFirst.mockResolvedValue({
        id: "bk_1",
        bookingType: "SINGLE",
        bookingStatus: st,
        customerId: "cust_1",
        revenueStaffId: null,
        servicePlanId: "plan_single",
        servicePlan: { price: 799 },
        customer: { assignedStaffId: null },
      } as unknown as never);
      const r = await collectSinglePayment(base);
      expect(r.success).toBe(false);
      expect(h.txCreate).not.toHaveBeenCalled();
    },
  );

  it("cross-store booking (store-scoped findFirst → null) → NOT_FOUND, no create", async () => {
    h.bookingFindFirst.mockResolvedValue(null as unknown as never);
    const r = await collectSinglePayment(base);
    expect(r.success).toBe(false);
    expect(h.txCreate).not.toHaveBeenCalled();
  });
});

describe("collectSinglePayment — original-price source + amount", () => {
  it("uses Steamfoot expectedAmount snapshot before the retained package price", async () => {
    h.bookingFindFirst.mockResolvedValue({
      id: "bk_converted",
      bookingType: "SINGLE",
      bookingStatus: "PENDING",
      customerId: "cust_1",
      revenueStaffId: null,
      servicePlanId: "plan_package",
      expectedAmount: 799,
      treatmentPriceSnapshot: null,
      servicePlan: { price: 5990 },
      customer: { assignedStaffId: null },
    } as unknown as never);

    await collectSinglePayment({ ...base, bookingId: "bk_converted" });

    expect(lastTx().grossAmount).toBe(799);
    expect(lastTx().amount).toBe(799);
  });

  it("uses the SPA treatment price snapshot before legacy servicePlan price", async () => {
    h.bookingFindFirst.mockResolvedValue({
      id: "bk_spa",
      bookingType: "SINGLE",
      bookingStatus: "PENDING",
      customerId: "cust_1",
      revenueStaffId: null,
      serviceStaffId: "spa_staff_10",
      servicePlanId: null,
      treatmentPriceSnapshot: 1680,
      servicePlan: null,
      customer: { assignedStaffId: null },
    } as unknown as never);
    await collectSinglePayment({ ...base, bookingId: "bk_spa", amount: 1680 });
    expect(lastTx().grossAmount).toBe(1680);
    expect(lastTx().amount).toBe(1680);
    expect(lastTx().serviceStaffId).toBe("spa_staff_10");
  });

  it("no amount + servicePlan.price=899 → originalAmount=899, netAmount=899 (default = full)", async () => {
    h.bookingFindFirst.mockResolvedValue({
      id: "bk_1",
      bookingType: "SINGLE",
      bookingStatus: "PENDING",
      customerId: "cust_1",
      revenueStaffId: null,
      servicePlanId: "plan_single",
      servicePlan: { price: 899 },
      customer: { assignedStaffId: null },
    } as unknown as never);
    await collectSinglePayment(base);
    const t = lastTx();
    expect(t.amount).toBe(899);
    expect(t.grossAmount).toBe(899);
    expect(t.discountAmount).toBe(0);
  });

  it("no amount + servicePlan=null → fallback 799", async () => {
    h.bookingFindFirst.mockResolvedValue({
      id: "bk_1",
      bookingType: "SINGLE",
      bookingStatus: "PENDING",
      customerId: "cust_1",
      revenueStaffId: null,
      servicePlanId: null,
      servicePlan: null,
      customer: { assignedStaffId: null },
    } as unknown as never);
    await collectSinglePayment(base);
    const t = lastTx();
    expect(t.amount).toBe(799);
    expect(t.grossAmount).toBe(799);
  });

  it("amount=600 with original=799 → discountAmount=199 reflected via snapshot", async () => {
    const r = await collectSinglePayment({
      ...base,
      amount: 600,
      discountReason: "好友介紹",
    });
    expect(r.success).toBe(true);
    const t = lastTx();
    expect(t.amount).toBe(600);
    expect(t.grossAmount).toBe(799);
    expect(t.discountAmount).toBe(199);
    expect(t.discountReason).toBe("好友介紹");
  });

  it("amount > original → VALIDATION, no create", async () => {
    const r = await collectSinglePayment({ ...base, amount: 1500 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/不可高於原價/);
    expect(h.txCreate).not.toHaveBeenCalled();
  });
});

describe("collectSinglePayment — revenue staff attribution snapshot", () => {
  it("uses booking.revenueStaffId first (highest priority per spec)", async () => {
    h.bookingFindFirst.mockResolvedValue({
      id: "bk_1",
      bookingType: "SINGLE",
      bookingStatus: "PENDING",
      customerId: "cust_1",
      revenueStaffId: "booking_owner",
      servicePlanId: "plan_single",
      servicePlan: { price: 799 },
      customer: { assignedStaffId: "assigned_owner" },
    } as unknown as never);
    await collectSinglePayment(base);
    const t = lastTx();
    expect(t.revenueStaffId).toBe("booking_owner");
    expect(t.soldByStaffId).toBe("op_staff");
    expect(t.serviceStaffId).toBe("op_staff");
  });

  it("falls back to customer.assignedStaffId when booking.revenueStaffId null", async () => {
    h.bookingFindFirst.mockResolvedValue({
      id: "bk_1",
      bookingType: "SINGLE",
      bookingStatus: "PENDING",
      customerId: "cust_1",
      revenueStaffId: null,
      servicePlanId: "plan_single",
      servicePlan: { price: 799 },
      customer: { assignedStaffId: "assigned_owner" },
    } as unknown as never);
    await collectSinglePayment(base);
    expect(lastTx().revenueStaffId).toBe("assigned_owner");
  });

  it("falls back to operator.staffId when both are null", async () => {
    await collectSinglePayment(base);
    expect(lastTx().revenueStaffId).toBe("op_staff");
  });

  it("FORBIDDEN when none resolves", async () => {
    h.requirePermission.mockResolvedValue({
      storeId: "store_1",
      staffId: null,
    } as unknown as { storeId: string; staffId: string });
    const r = await collectSinglePayment(base);
    expect(r.success).toBe(false);
    expect(h.txCreate).not.toHaveBeenCalled();
  });
});

// Validator: non-cuid bookingId accepted; empty rejected; UNPAID rejected;
// discountReason / note bounded.
describe("collectSinglePaymentSchema", () => {
  it("accepts non-cuid bookingId + valid method + optional discountReason", async () => {
    const { collectSinglePaymentSchema } =
      await import("@/lib/validators/single-booking");
    expect(() =>
      collectSinglePaymentSchema.parse({
        bookingId: "staging-bk-001",
        paymentMethod: "TRANSFER",
        amount: 700,
        discountReason: "好友介紹",
      }),
    ).not.toThrow();
  });
  it("rejects empty bookingId", async () => {
    const { collectSinglePaymentSchema } =
      await import("@/lib/validators/single-booking");
    expect(() =>
      collectSinglePaymentSchema.parse({
        bookingId: "",
        paymentMethod: "CASH",
      }),
    ).toThrow();
  });
  it("rejects UNPAID payment method (SUCCESS-only)", async () => {
    const { collectSinglePaymentSchema } =
      await import("@/lib/validators/single-booking");
    expect(() =>
      collectSinglePaymentSchema.parse({
        bookingId: "bk_1",
        paymentMethod: "UNPAID",
      }),
    ).toThrow();
  });
  it("rejects amount=0 (SINGLE is paid service; no 0元 success)", async () => {
    const { collectSinglePaymentSchema } =
      await import("@/lib/validators/single-booking");
    expect(() =>
      collectSinglePaymentSchema.parse({
        bookingId: "bk_1",
        paymentMethod: "CASH",
        amount: 0,
      }),
    ).toThrow();
  });
  it("rejects discountReason > 500 chars", async () => {
    const { collectSinglePaymentSchema } =
      await import("@/lib/validators/single-booking");
    expect(() =>
      collectSinglePaymentSchema.parse({
        bookingId: "bk_1",
        paymentMethod: "CASH",
        discountReason: "x".repeat(501),
      }),
    ).toThrow();
  });
});
