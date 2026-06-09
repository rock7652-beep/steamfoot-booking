import { describe, it, expect, vi, beforeEach } from "vitest";

// 體驗 499 PR-3：collectTrialPayment 保證（SUCCESS-only baseline）
//  - 只在「真的收款」時建立 1 筆 TRIAL_PURCHASE 交易
//  - status=SUCCESS（snapshot）+ paymentStatus=SUCCESS（明確）+ paidAt 有值
//  - bookingId 連到該 FIRST_TRIAL 預約、paymentMethod 必填
//  - 不建 PENDING；@/lib/db mock 只暴露 booking + transaction，任何
//    prisma.customerPlanWallet.* / walletSession.* 會 throw → 測試會 fail
//    （= no Wallet / WalletSession ever）
//  - 防重複收款、狀態/型別/跨店 guard、歸屬快照、金額 clamp

const h = vi.hoisted(() => {
  const txCreate = vi.fn(async () => ({ id: "tx_1" }));
  // Race-safe duplicate guard：findFirst 已移進 prisma.$transaction，
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
    getTrialSettings: vi.fn(async () => ({
      trialEnabled: true,
      trialDefaultPrice: 499,
      trialAllowPriceEdit: true,
      trialMinPrice: 0,
      trialMaxPrice: 3000,
    })),
    bookingFindFirst: vi.fn(
      async () =>
        ({
          id: "bk_1",
          bookingType: "FIRST_TRIAL",
          bookingStatus: "PENDING",
          customerId: "cust_1",
          servicePlanId: "plan_trial",
          expectedAmount: null as number | null,
          customer: { assignedStaffId: null as string | null },
        }) as unknown,
    ),
    txRun: vi.fn(async (fn: (c: unknown) => unknown) =>
      fn({
        transaction: { create: txCreate, findFirst: txFindFirstInTx },
        $queryRaw: queryRaw,
      }),
    ),
    buildSnapshot: vi.fn(async () => ({
      transactionNo: "TXN-1",
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
      isFirstPurchase: true,
    })),
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
  // PR-3c：本次總額 clamp（與 server 端 clampTrialTotal 行為對齊）。
  clampTrialTotal: (
    input: number | null | undefined,
    people: number,
    s: {
      trialAllowPriceEdit: boolean;
      trialDefaultPrice: number;
      trialMinPrice: number;
      trialMaxPrice: number;
    },
  ) => {
    const n = Math.max(1, Math.floor(people || 1));
    if (!s.trialAllowPriceEdit) return s.trialDefaultPrice * n;
    if (input == null || !Number.isFinite(input)) return s.trialDefaultPrice * n;
    const rounded = Math.round(input);
    const lo = Math.min(s.trialMinPrice, s.trialMaxPrice) * n;
    const hi = Math.max(s.trialMinPrice, s.trialMaxPrice) * n;
    return Math.min(hi, Math.max(lo, rounded));
  },
}));
vi.mock("@/lib/transaction-snapshot", () => ({
  buildTransactionSnapshot: h.buildSnapshot,
}));
// trial-booking.ts module-level imports（collectTrialPayment 不用，但 import
// 仍會 load）— mock 掉避免 vitest 解析 next-auth / next/cache
vi.mock("@/server/services/trial-plan", () => ({
  ensureTrialPlan: vi.fn(async () => ({ id: "plan_trial" })),
}));
vi.mock("@/server/actions/customer", () => ({
  createCustomer: vi.fn(async () => ({
    success: true,
    data: { customerId: "cust_1" },
  })),
}));
vi.mock("@/server/actions/booking", () => ({
  createBooking: vi.fn(async () => ({
    success: true,
    data: { bookingId: "bk_1" },
  })),
}));
vi.mock("@/server/queries/staff", () => ({
  listStaffSelectOptions: vi.fn(async () => []),
}));
// PR-3b：trial-booking.ts 新增 module-level import @/server/actions/transaction
// （voidTransaction）→ mock 掉，避免 vitest 解析 next-auth / next/server
vi.mock("@/server/actions/transaction", () => ({ voidTransaction: vi.fn() }));
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

import { collectTrialPayment } from "@/server/actions/trial-booking";

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
  h.getTrialSettings.mockResolvedValue({
    trialEnabled: true,
    trialDefaultPrice: 499,
    trialAllowPriceEdit: true,
    trialMinPrice: 0,
    trialMaxPrice: 3000,
  });
  h.txFindFirstInTx.mockResolvedValue(null);
  h.queryRaw.mockResolvedValue([]);
  h.txCreate.mockResolvedValue({ id: "tx_1" });
  h.bookingFindFirst.mockResolvedValue({
    id: "bk_1",
    bookingType: "FIRST_TRIAL",
    bookingStatus: "PENDING",
    customerId: "cust_1",
    servicePlanId: "plan_trial",
    expectedAmount: null,
    customer: { assignedStaffId: null },
  } as unknown as never);
});

const base = { bookingId: "bk_1", paymentMethod: "CASH" as const };

describe("collectTrialPayment — SUCCESS-only real-revenue tx", () => {
  it("creates exactly ONE TRIAL_PURCHASE tx, SUCCESS+SUCCESS, paidAt set, bookingId linked", async () => {
    const r = await collectTrialPayment(base);
    expect(r.success).toBe(true);
    expect(h.txCreate).toHaveBeenCalledTimes(1);
    const t = lastTx();
    expect(t.transactionType).toBe("TRIAL_PURCHASE");
    expect(t.paymentStatus).toBe("SUCCESS");
    expect(t.status).toBe("SUCCESS"); // from snapshot
    expect(t.bookingId).toBe("bk_1");
    expect(t.paymentMethod).toBe("CASH");
    expect(t.paidAt).toBeInstanceOf(Date);
    expect(h.revalidateBookings).toHaveBeenCalledTimes(1);
    expect(h.revalidateTransactions).toHaveBeenCalledTimes(1);
  });

  it("never touches wallet/session prisma models (mock would throw on access)", async () => {
    const r = await collectTrialPayment(base);
    expect(r.success).toBe(true); // clean success ⇒ no customerPlanWallet/walletSession calls
  });
});

describe("collectTrialPayment — double-collect guard (race-safe)", () => {
  it("rejects when a TRIAL_PURCHASE SUCCESS tx already exists; no second create", async () => {
    h.txFindFirstInTx.mockResolvedValue({ id: "tx_old" });
    const r = await collectTrialPayment(base);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/重複收款/);
    expect(h.txCreate).not.toHaveBeenCalled();
  });

  it("acquires Booking row lock BEFORE checking duplicates (race-safe)", async () => {
    await collectTrialPayment(base);
    // 防 race condition：FOR UPDATE 必須先發、findFirst 之後發、create 最後發。
    // 順序錯了 → race condition 還在。模式同 PR #166 collectSinglePayment。
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
    await collectTrialPayment(base);
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

describe("collectTrialPayment — status / type / store guards", () => {
  it.each(["COMPLETED", "CANCELLED", "NO_SHOW"])(
    "rejects bookingStatus=%s",
    async (st) => {
      h.bookingFindFirst.mockResolvedValue({
        id: "bk_1",
        bookingType: "FIRST_TRIAL",
        bookingStatus: st,
        customerId: "cust_1",
        servicePlanId: "plan_trial",
        expectedAmount: null,
        customer: { assignedStaffId: null },
      } as unknown as never);
      const r = await collectTrialPayment(base);
      expect(r.success).toBe(false);
      expect(h.txCreate).not.toHaveBeenCalled();
    },
  );

  it.each(["SINGLE", "PACKAGE_SESSION"])(
    "rejects bookingType=%s (only FIRST_TRIAL)",
    async (bt) => {
      h.bookingFindFirst.mockResolvedValue({
        id: "bk_1",
        bookingType: bt,
        bookingStatus: "PENDING",
        customerId: "cust_1",
        servicePlanId: null,
        expectedAmount: null,
        customer: { assignedStaffId: null },
      } as unknown as never);
      const r = await collectTrialPayment(base);
      expect(r.success).toBe(false);
      expect(h.txCreate).not.toHaveBeenCalled();
    },
  );

  it("cross-store booking (store-scoped findFirst → null) → NOT_FOUND, no create", async () => {
    h.bookingFindFirst.mockResolvedValue(null as unknown as never);
    const r = await collectTrialPayment(base);
    expect(r.success).toBe(false);
    expect(h.txCreate).not.toHaveBeenCalled();
  });
});

describe("collectTrialPayment — revenue staff attribution snapshot", () => {
  it("uses customer.assignedStaffId when present", async () => {
    h.bookingFindFirst.mockResolvedValue({
      id: "bk_1",
      bookingType: "FIRST_TRIAL",
      bookingStatus: "PENDING",
      customerId: "cust_1",
      servicePlanId: "plan_trial",
      expectedAmount: null,
      customer: { assignedStaffId: "assigned_owner" },
    } as unknown as never);
    await collectTrialPayment(base);
    const t = lastTx();
    expect(t.revenueStaffId).toBe("assigned_owner");
    expect(t.soldByStaffId).toBe("op_staff");
    expect(t.serviceStaffId).toBe("op_staff");
  });

  it("falls back to operator when customer has no assignedStaffId", async () => {
    await collectTrialPayment(base);
    expect(lastTx().revenueStaffId).toBe("op_staff");
  });

  it("FORBIDDEN when neither assignedStaffId nor operator staffId resolves", async () => {
    h.requirePermission.mockResolvedValue({
      storeId: "store_1",
      staffId: null,
    } as unknown as { storeId: string; staffId: string });
    const r = await collectTrialPayment(base);
    expect(r.success).toBe(false);
    expect(h.txCreate).not.toHaveBeenCalled();
  });
});

describe("collectTrialPayment — amount snapshot / clamp", () => {
  it("no amount + expectedAmount null → store default 499", async () => {
    await collectTrialPayment(base);
    expect(lastTx().amount).toBe(499);
  });

  it("no amount + expectedAmount snapshot (400) → 400", async () => {
    h.bookingFindFirst.mockResolvedValue({
      id: "bk_1",
      bookingType: "FIRST_TRIAL",
      bookingStatus: "PENDING",
      customerId: "cust_1",
      servicePlanId: "plan_trial",
      expectedAmount: 400,
      customer: { assignedStaffId: null },
    } as unknown as never);
    await collectTrialPayment(base);
    expect(lastTx().amount).toBe(400);
  });

  it("allowEdit=false → forced to default, ignoring input amount", async () => {
    h.getTrialSettings.mockResolvedValue({
      trialEnabled: true,
      trialDefaultPrice: 499,
      trialAllowPriceEdit: false,
      trialMinPrice: 0,
      trialMaxPrice: 3000,
    });
    await collectTrialPayment({ ...base, amount: 999 });
    expect(lastTx().amount).toBe(499);
  });

  it("clamps over-max (5000 → 3000)", async () => {
    await collectTrialPayment({ ...base, amount: 5000 });
    expect(lastTx().amount).toBe(3000);
  });
});

describe("collectTrialPayment — PR-3c people × amount", () => {
  // booking.people=2，未傳 amount、無 snapshot → default × people = 998
  it("people=2 + no input + no snapshot → 499 × 2 = 998", async () => {
    h.bookingFindFirst.mockResolvedValue({
      id: "bk_1",
      bookingType: "FIRST_TRIAL",
      bookingStatus: "PENDING",
      customerId: "cust_1",
      servicePlanId: "plan_trial",
      expectedAmount: null,
      people: 2,
      customer: { assignedStaffId: null },
    } as unknown as never);
    await collectTrialPayment(base);
    expect(lastTx().amount).toBe(998);
  });

  // booking.expectedAmount=998（建立時快照已是總額）→ 沿用 998（不重複 ×）
  it("people=2 + snapshot 998 (total) → 998 (no double-multiplication)", async () => {
    h.bookingFindFirst.mockResolvedValue({
      id: "bk_1",
      bookingType: "FIRST_TRIAL",
      bookingStatus: "PENDING",
      customerId: "cust_1",
      servicePlanId: "plan_trial",
      expectedAmount: 998,
      people: 2,
      customer: { assignedStaffId: null },
    } as unknown as never);
    await collectTrialPayment(base);
    expect(lastTx().amount).toBe(998);
  });

  // 店長手動輸入「本次合計」899（雙人優惠）→ 直接用 899
  it("people=2 + manual total 899 → 899 (treated as total, NOT × people)", async () => {
    h.bookingFindFirst.mockResolvedValue({
      id: "bk_1",
      bookingType: "FIRST_TRIAL",
      bookingStatus: "PENDING",
      customerId: "cust_1",
      servicePlanId: "plan_trial",
      expectedAmount: 998,
      people: 2,
      customer: { assignedStaffId: null },
    } as unknown as never);
    await collectTrialPayment({ ...base, amount: 899 });
    expect(lastTx().amount).toBe(899);
  });

  // 人數=2 時 clamp 上限 = 3000 × 2 = 6000
  it("people=2 + 99999 → clamps to 6000 (max × people)", async () => {
    h.bookingFindFirst.mockResolvedValue({
      id: "bk_1",
      bookingType: "FIRST_TRIAL",
      bookingStatus: "PENDING",
      customerId: "cust_1",
      servicePlanId: "plan_trial",
      expectedAmount: null,
      people: 2,
      customer: { assignedStaffId: null },
    } as unknown as never);
    await collectTrialPayment({ ...base, amount: 99999 });
    expect(lastTx().amount).toBe(6000);
  });

  // allowEdit=false：people=2 強制 default × people = 998（忽略 input）
  it("people=2 + allowEdit=false → forced to 998 ignoring input", async () => {
    h.getTrialSettings.mockResolvedValue({
      trialEnabled: true,
      trialDefaultPrice: 499,
      trialAllowPriceEdit: false,
      trialMinPrice: 0,
      trialMaxPrice: 3000,
    });
    h.bookingFindFirst.mockResolvedValue({
      id: "bk_1",
      bookingType: "FIRST_TRIAL",
      bookingStatus: "PENDING",
      customerId: "cust_1",
      servicePlanId: "plan_trial",
      expectedAmount: 998,
      people: 2,
      customer: { assignedStaffId: null },
    } as unknown as never);
    await collectTrialPayment({ ...base, amount: 1234 });
    expect(lastTx().amount).toBe(998);
  });
});

describe("collectTrialPayment — PR-3d partial attendance (effectivePeople = attendedPeople ?? people)", () => {
  // 部分到店：people=2、attendedPeople=1、無 snapshot、未傳 amount
  // → server 用 effectivePeople=1 計算 default × 1 = 499
  it("people=2 + attendedPeople=1 + 無 snapshot + 未傳 amount → 499", async () => {
    h.bookingFindFirst.mockResolvedValue({
      id: "bk_1",
      bookingType: "FIRST_TRIAL",
      bookingStatus: "PENDING",
      customerId: "cust_1",
      servicePlanId: "plan_trial",
      expectedAmount: null,
      people: 2,
      attendedPeople: 1,
      customer: { assignedStaffId: null },
    } as unknown as never);
    await collectTrialPayment(base);
    expect(lastTx().amount).toBe(499);
  });

  // expectedAmount=998（原 PR-3 快照）但實到 1 → server 不接管「重算」職責，
  // 沿用 snapshot 998；clamp 範圍是 effectivePeople=1 的 [0, 3000]，998 仍在範圍內。
  // （前端在 modal 才會把預設改成 499；server 尊重明確的 snapshot 為 caller 意圖。）
  it("people=2 + attendedPeople=1 + snapshot 998 + 未傳 amount → 998（server 不重算 snapshot）", async () => {
    h.bookingFindFirst.mockResolvedValue({
      id: "bk_1",
      bookingType: "FIRST_TRIAL",
      bookingStatus: "PENDING",
      customerId: "cust_1",
      servicePlanId: "plan_trial",
      expectedAmount: 998,
      people: 2,
      attendedPeople: 1,
      customer: { assignedStaffId: null },
    } as unknown as never);
    await collectTrialPayment(base);
    expect(lastTx().amount).toBe(998);
  });

  // 店長手動傳 amount → 視為本次合計，clamp 到 effectivePeople 範圍
  it("people=2 + attendedPeople=1 + manual 499 → 499", async () => {
    h.bookingFindFirst.mockResolvedValue({
      id: "bk_1",
      bookingType: "FIRST_TRIAL",
      bookingStatus: "PENDING",
      customerId: "cust_1",
      servicePlanId: "plan_trial",
      expectedAmount: 998,
      people: 2,
      attendedPeople: 1,
      customer: { assignedStaffId: null },
    } as unknown as never);
    await collectTrialPayment({ ...base, amount: 499 });
    expect(lastTx().amount).toBe(499);
  });

  // clamp 範圍依 effectivePeople=1（max 3000），手動 99999 → 3000（非 6000）
  it("people=2 + attendedPeople=1 + 99999 → clamps to 3000 (max × effectivePeople)", async () => {
    h.bookingFindFirst.mockResolvedValue({
      id: "bk_1",
      bookingType: "FIRST_TRIAL",
      bookingStatus: "PENDING",
      customerId: "cust_1",
      servicePlanId: "plan_trial",
      expectedAmount: null,
      people: 2,
      attendedPeople: 1,
      customer: { assignedStaffId: null },
    } as unknown as never);
    await collectTrialPayment({ ...base, amount: 99999 });
    expect(lastTx().amount).toBe(3000);
  });

  // attendedPeople=null（向後相容；沒記錄部分到店）→ 沿用 people 行為
  it("attendedPeople=null → falls back to people (PR-3c baseline)", async () => {
    h.bookingFindFirst.mockResolvedValue({
      id: "bk_1",
      bookingType: "FIRST_TRIAL",
      bookingStatus: "PENDING",
      customerId: "cust_1",
      servicePlanId: "plan_trial",
      expectedAmount: null,
      people: 2,
      attendedPeople: null,
      customer: { assignedStaffId: null },
    } as unknown as never);
    await collectTrialPayment(base);
    expect(lastTx().amount).toBe(998);
  });
});

// Validator: non-cuid bookingId accepted (staging/import IDs); empty rejected;
// UNPAID payment method rejected (no 待確認 path).
describe("collectTrialPaymentSchema", () => {
  it("accepts non-cuid bookingId + valid method", async () => {
    const { collectTrialPaymentSchema } = await import(
      "@/lib/validators/trial-booking"
    );
    expect(() =>
      collectTrialPaymentSchema.parse({
        bookingId: "staging-bk-001",
        paymentMethod: "TRANSFER",
      }),
    ).not.toThrow();
  });
  it("rejects empty bookingId", async () => {
    const { collectTrialPaymentSchema } = await import(
      "@/lib/validators/trial-booking"
    );
    expect(() =>
      collectTrialPaymentSchema.parse({ bookingId: "", paymentMethod: "CASH" }),
    ).toThrow();
  });
  it("rejects UNPAID payment method (SUCCESS-only: no 待確認)", async () => {
    const { collectTrialPaymentSchema } = await import(
      "@/lib/validators/trial-booking"
    );
    expect(() =>
      collectTrialPaymentSchema.parse({
        bookingId: "bk_1",
        paymentMethod: "UNPAID",
      }),
    ).toThrow();
  });
});
