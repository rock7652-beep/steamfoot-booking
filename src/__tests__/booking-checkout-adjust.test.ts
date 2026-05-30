import { describe, it, expect, vi, beforeEach } from "vitest";

// 調整結帳方式 — adjustCheckoutToPackage 行為保證（Phase 1）：
//  - 單一情境：SINGLE（未收款）→ PACKAGE_SESSION（方案扣堂）
//  - 零金流副作用：不建立任何 Transaction（tx.transaction.create 永不被呼叫）
//  - race-safe：$transaction 內先 FOR UPDATE lock Booking row → 重查 guard
//    → 再 update；順序錯了 race 還在
//  - 只「呼叫」既有 allocateSessionsFefo（preferred=所選 wallet, count=people），
//    不自行配堂；primary !== preferred 時同步 booking 欄位
//  - 寫 AuditLog（before/after），不寫 Cashbook / CashDrawer
//  - 型別 / 狀態 / 補課 / 已收款 / wallet 歸屬 / 堂數不足 guards

const h = vi.hoisted(() => {
  const txQueryRaw = vi.fn();
  const txBookingFindUnique = vi.fn();
  const txBookingUpdate = vi.fn(async () => ({}));
  const txTransactionFindFirst = vi.fn(async () => null as { id: string } | null);
  const txTransactionCreate = vi.fn(); // 必須永不被呼叫（零金流）
  const txAuditCreate = vi.fn(async () => ({ id: "audit_1" }));
  const allocateSessionsFefo = vi.fn(async () => ({
    allocations: [],
    primaryWalletId: "w_1",
  }));
  return {
    txQueryRaw,
    txBookingFindUnique,
    txBookingUpdate,
    txTransactionFindFirst,
    txTransactionCreate,
    txAuditCreate,
    allocateSessionsFefo,
    requirePermission: vi.fn(async () => ({ id: "user_1", storeId: "store_1" })),
    currentStoreId: vi.fn(() => "store_1"),
    bookingFindFirst: vi.fn(),
    transactionFindFirst: vi.fn(async () => null as { id: string } | null),
    walletFindMany: vi.fn(),
    txRun: vi.fn(async (fn: (c: unknown) => unknown) =>
      fn({
        $queryRaw: txQueryRaw,
        booking: { findUnique: txBookingFindUnique, update: txBookingUpdate },
        transaction: {
          findFirst: txTransactionFindFirst,
          create: txTransactionCreate,
        },
        auditLog: { create: txAuditCreate },
      }),
    ),
    revalidateBookings: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: { findFirst: h.bookingFindFirst },
    transaction: { findFirst: h.transactionFindFirst },
    customerPlanWallet: { findMany: h.walletFindMany },
    $transaction: h.txRun,
  },
}));
vi.mock("@/lib/permissions", () => ({ requirePermission: h.requirePermission }));
vi.mock("@/lib/store", () => ({ currentStoreId: h.currentStoreId }));
vi.mock("@/server/services/wallet-session", () => ({
  allocateSessionsFefo: h.allocateSessionsFefo,
}));
vi.mock("@/lib/revalidation", () => ({
  revalidateBookings: h.revalidateBookings,
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

import { adjustCheckoutToPackage } from "@/server/actions/booking-checkout";

const SINGLE_UNPAID = {
  id: "bk_1",
  bookingType: "SINGLE",
  bookingStatus: "PENDING",
  customerId: "cust_1",
  people: 1,
  isMakeup: false,
  servicePlanId: null as string | null,
  customerPlanWalletId: null as string | null,
};

const WALLETS = [
  {
    id: "w_1",
    planId: "plan_1",
    expiryDate: new Date("2026-06-30"),
    createdAt: new Date("2026-01-01"),
    remainingSessions: 5,
  },
  {
    id: "w_2",
    planId: "plan_2",
    expiryDate: new Date("2026-12-31"),
    createdAt: new Date("2026-02-01"),
    remainingSessions: 3,
  },
];

const base = { bookingId: "bk_1", walletId: "w_1" };

const lastUpdate = () =>
  h.txBookingUpdate.mock.calls.at(-1)?.[0] as { data: Record<string, unknown> };

beforeEach(() => {
  vi.clearAllMocks();
  h.requirePermission.mockResolvedValue({ id: "user_1", storeId: "store_1" });
  h.currentStoreId.mockReturnValue("store_1");
  h.bookingFindFirst.mockResolvedValue({ ...SINGLE_UNPAID } as unknown as never);
  h.transactionFindFirst.mockResolvedValue(null);
  h.walletFindMany.mockResolvedValue(
    WALLETS.map((w) => ({ ...w })) as unknown as never,
  );
  h.txQueryRaw.mockResolvedValue([]);
  h.txBookingFindUnique.mockResolvedValue({
    bookingType: "SINGLE",
    bookingStatus: "PENDING",
    people: 1,
  } as unknown as never);
  h.txTransactionFindFirst.mockResolvedValue(null);
  h.txBookingUpdate.mockResolvedValue({} as unknown as never);
  h.allocateSessionsFefo.mockResolvedValue({ allocations: [], primaryWalletId: "w_1" });
});

describe("adjustCheckoutToPackage — happy path (SINGLE → PACKAGE_SESSION)", () => {
  it("converts booking, allocates via FEFO, writes audit, returns walletId — zero Transaction", async () => {
    const r = await adjustCheckoutToPackage(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.walletId).toBe("w_1");

    // booking 轉成 PACKAGE_SESSION + 綁所選 wallet
    const upd = lastUpdate();
    expect(upd.data.bookingType).toBe("PACKAGE_SESSION");
    expect(upd.data.customerPlanWalletId).toBe("w_1");
    expect(upd.data.servicePlanId).toBe("plan_1");

    // 呼叫既有配堂：preferred=所選 wallet, count=people
    expect(h.allocateSessionsFefo).toHaveBeenCalledTimes(1);
    const allocArg = h.allocateSessionsFefo.mock.calls[0][1] as {
      preferredWalletId: string;
      count: number;
      bookingId: string;
    };
    expect(allocArg.preferredWalletId).toBe("w_1");
    expect(allocArg.count).toBe(1);
    expect(allocArg.bookingId).toBe("bk_1");

    // audit 寫入 before/after
    expect(h.txAuditCreate).toHaveBeenCalledTimes(1);
    const audit = h.txAuditCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(audit.data.action).toBe("ADJUST_CHECKOUT_METHOD");

    // 零金流：永不建立 Transaction、不重整 transactions
    expect(h.txTransactionCreate).not.toHaveBeenCalled();
    expect(h.revalidateBookings).toHaveBeenCalledTimes(1);
  });

  it("multi-person: count = booking.people from locked re-read", async () => {
    h.bookingFindFirst.mockResolvedValue({
      ...SINGLE_UNPAID,
      people: 2,
    } as unknown as never);
    h.txBookingFindUnique.mockResolvedValue({
      bookingType: "SINGLE",
      bookingStatus: "PENDING",
      people: 2,
    } as unknown as never);
    await adjustCheckoutToPackage(base);
    const allocArg = h.allocateSessionsFefo.mock.calls[0][1] as { count: number };
    expect(allocArg.count).toBe(2);
  });
});

describe("adjustCheckoutToPackage — FEFO primary reconciliation", () => {
  it("when actual primary differs from preferred, re-updates booking to effective wallet", async () => {
    // preferred w_1 被略過，實際 primary = w_2
    h.allocateSessionsFefo.mockResolvedValue({ allocations: [], primaryWalletId: "w_2" });
    const r = await adjustCheckoutToPackage(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.walletId).toBe("w_2");

    // 第二次 update 同步成 effective wallet + 對應 planId
    expect(h.txBookingUpdate).toHaveBeenCalledTimes(2);
    const upd = lastUpdate();
    expect(upd.data.customerPlanWalletId).toBe("w_2");
    expect(upd.data.servicePlanId).toBe("plan_2");
  });

  it("primary === preferred → only one booking.update (no redundant write)", async () => {
    await adjustCheckoutToPackage(base);
    expect(h.txBookingUpdate).toHaveBeenCalledTimes(1);
  });
});

describe("adjustCheckoutToPackage — race-safe ordering", () => {
  it("locks Booking row (FOR UPDATE) BEFORE re-read / update", async () => {
    await adjustCheckoutToPackage(base);
    expect(h.txQueryRaw).toHaveBeenCalledTimes(1);
    const lockOrder = h.txQueryRaw.mock.invocationCallOrder[0];
    const reReadOrder = h.txBookingFindUnique.mock.invocationCallOrder[0];
    const updateOrder = h.txBookingUpdate.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(reReadOrder);
    expect(reReadOrder).toBeLessThan(updateOrder);
  });

  it("FOR UPDATE query targets Booking with bookingId param", async () => {
    await adjustCheckoutToPackage(base);
    const callArgs = h.txQueryRaw.mock.calls[0];
    const strings = callArgs[0] as unknown as string[];
    const joined = strings.join("?");
    expect(joined).toContain("Booking");
    expect(joined).toContain("FOR UPDATE");
    expect(callArgs.slice(1)).toContain("bk_1");
  });

  it("CONFLICT when locked re-read shows bookingType already changed", async () => {
    h.txBookingFindUnique.mockResolvedValue({
      bookingType: "PACKAGE_SESSION",
      bookingStatus: "PENDING",
      people: 1,
    } as unknown as never);
    const r = await adjustCheckoutToPackage(base);
    expect(r.success).toBe(false);
    expect(h.txBookingUpdate).not.toHaveBeenCalled();
    expect(h.allocateSessionsFefo).not.toHaveBeenCalled();
  });

  it("CONFLICT when a SINGLE_PURCHASE SUCCESS tx appears after lock (concurrent collect)", async () => {
    h.txTransactionFindFirst.mockResolvedValue({ id: "tx_paid" });
    const r = await adjustCheckoutToPackage(base);
    expect(r.success).toBe(false);
    expect(h.txBookingUpdate).not.toHaveBeenCalled();
  });
});

describe("adjustCheckoutToPackage — pre-transaction guards", () => {
  it("rejects makeup booking", async () => {
    h.bookingFindFirst.mockResolvedValue({
      ...SINGLE_UNPAID,
      isMakeup: true,
    } as unknown as never);
    const r = await adjustCheckoutToPackage(base);
    expect(r.success).toBe(false);
    expect(h.txRun).not.toHaveBeenCalled();
  });

  it.each(["FIRST_TRIAL", "PACKAGE_SESSION"])(
    "rejects bookingType=%s (only SINGLE)",
    async (bt) => {
      h.bookingFindFirst.mockResolvedValue({
        ...SINGLE_UNPAID,
        bookingType: bt,
      } as unknown as never);
      const r = await adjustCheckoutToPackage(base);
      expect(r.success).toBe(false);
      expect(h.txRun).not.toHaveBeenCalled();
    },
  );

  it.each(["COMPLETED", "CANCELLED", "NO_SHOW"])(
    "rejects bookingStatus=%s",
    async (st) => {
      h.bookingFindFirst.mockResolvedValue({
        ...SINGLE_UNPAID,
        bookingStatus: st,
      } as unknown as never);
      const r = await adjustCheckoutToPackage(base);
      expect(r.success).toBe(false);
      expect(h.txRun).not.toHaveBeenCalled();
    },
  );

  it("rejects when a SINGLE_PURCHASE SUCCESS tx already exists (pre-tx)", async () => {
    h.transactionFindFirst.mockResolvedValue({ id: "tx_old" });
    const r = await adjustCheckoutToPackage(base);
    expect(r.success).toBe(false);
    expect(h.txRun).not.toHaveBeenCalled();
  });

  it("cross-store booking (store-scoped findFirst → null) → NOT_FOUND", async () => {
    h.bookingFindFirst.mockResolvedValue(null as unknown as never);
    const r = await adjustCheckoutToPackage(base);
    expect(r.success).toBe(false);
    expect(h.txRun).not.toHaveBeenCalled();
  });

  it("chosen wallet not in customer's ACTIVE list → NOT_FOUND", async () => {
    const r = await adjustCheckoutToPackage({ bookingId: "bk_1", walletId: "w_ghost" });
    expect(r.success).toBe(false);
    expect(h.txRun).not.toHaveBeenCalled();
  });

  it("chosen wallet has 0 remaining → BUSINESS_RULE", async () => {
    h.walletFindMany.mockResolvedValue([
      { ...WALLETS[0], remainingSessions: 0 },
      { ...WALLETS[1] },
    ] as unknown as never);
    const r = await adjustCheckoutToPackage(base);
    expect(r.success).toBe(false);
    expect(h.txRun).not.toHaveBeenCalled();
  });

  it("total remaining across wallets < people → BUSINESS_RULE", async () => {
    h.bookingFindFirst.mockResolvedValue({
      ...SINGLE_UNPAID,
      people: 10,
    } as unknown as never);
    const r = await adjustCheckoutToPackage(base);
    expect(r.success).toBe(false);
    expect(h.txRun).not.toHaveBeenCalled();
  });
});

describe("adjustCheckoutToPackageSchema", () => {
  it("accepts non-cuid ids; rejects empty", async () => {
    const { adjustCheckoutToPackageSchema } = await import(
      "@/lib/validators/booking-checkout"
    );
    expect(() =>
      adjustCheckoutToPackageSchema.parse({ bookingId: "staging-bk", walletId: "w" }),
    ).not.toThrow();
    expect(() =>
      adjustCheckoutToPackageSchema.parse({ bookingId: "", walletId: "w" }),
    ).toThrow();
    expect(() =>
      adjustCheckoutToPackageSchema.parse({ bookingId: "bk", walletId: "" }),
    ).toThrow();
  });
});
