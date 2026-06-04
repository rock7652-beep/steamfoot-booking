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
  const txWalletSessionCount = vi.fn(async () => 0); // Mode B 鎖後重查已扣堂
  const allocateSessionsFefo = vi.fn(async () => ({
    allocations: [],
    primaryWalletId: "w_1",
  }));
  const releaseSessions = vi.fn(async () => ({ released: 1 })); // Mode B 釋放配堂
  return {
    txQueryRaw,
    txBookingFindUnique,
    txBookingUpdate,
    txTransactionFindFirst,
    txTransactionCreate,
    txAuditCreate,
    txWalletSessionCount,
    allocateSessionsFefo,
    releaseSessions,
    requirePermission: vi.fn(async () => ({ id: "user_1", storeId: "store_1" })),
    currentStoreId: vi.fn(() => "store_1"),
    bookingFindFirst: vi.fn(),
    transactionFindFirst: vi.fn(async () => null as { id: string } | null),
    walletFindMany: vi.fn(),
    walletSessionCount: vi.fn(async () => 0), // Mode B 已扣堂 guard（prisma-level）
    txRun: vi.fn(async (fn: (c: unknown) => unknown) =>
      fn({
        $queryRaw: txQueryRaw,
        booking: { findUnique: txBookingFindUnique, update: txBookingUpdate },
        transaction: {
          findFirst: txTransactionFindFirst,
          create: txTransactionCreate,
        },
        walletSession: { count: txWalletSessionCount },
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
    walletSession: { count: h.walletSessionCount },
    $transaction: h.txRun,
  },
}));
vi.mock("@/lib/permissions", () => ({ requirePermission: h.requirePermission }));
vi.mock("@/lib/store", () => ({ currentStoreId: h.currentStoreId }));
vi.mock("@/server/services/wallet-session", () => ({
  allocateSessionsFefo: h.allocateSessionsFefo,
  releaseSessions: h.releaseSessions,
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

import {
  adjustCheckoutToPackage,
  adjustCheckoutToSingle,
} from "@/server/actions/booking-checkout";

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
  (h.txBookingUpdate.mock.calls.at(-1) as unknown[] | undefined)?.[0] as {
    data: Record<string, unknown>;
  };

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
  // Mode B 預設：未扣堂、釋放成功
  h.walletSessionCount.mockResolvedValue(0);
  h.txWalletSessionCount.mockResolvedValue(0);
  h.releaseSessions.mockResolvedValue({ released: 1 });
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
    const allocArg = (h.allocateSessionsFefo.mock.calls[0] as unknown[])[1] as {
      preferredWalletId: string;
      count: number;
      bookingId: string;
    };
    expect(allocArg.preferredWalletId).toBe("w_1");
    expect(allocArg.count).toBe(1);
    expect(allocArg.bookingId).toBe("bk_1");

    // audit 寫入 before/after
    expect(h.txAuditCreate).toHaveBeenCalledTimes(1);
    const audit = (h.txAuditCreate.mock.calls[0] as unknown[])[0] as {
      data: Record<string, unknown>;
    };
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
    const allocArg = (h.allocateSessionsFefo.mock.calls[0] as unknown[])[1] as {
      count: number;
    };
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

// ============================================================
// Mode B — adjustCheckoutToSingle（PACKAGE_SESSION 方案扣堂 → SINGLE 單次未收款）
//  - 釋放配堂只「呼叫」既有 releaseSessions（RESERVED → AVAILABLE）
//  - 翻成乾淨單次：bookingType=SINGLE / walletId=null / servicePlanId=null /
//    expectedAmount=null
//  - 零金流：不建任何 Transaction、不收款
//  - reason 選填，空白也建立 AuditLog
//  - race-safe：$transaction 內 FOR UPDATE → 重查（型別/狀態/已扣堂/SUCCESS 交易）→ 釋放 → update
//  - guards：非 PACKAGE_SESSION / COMPLETED·CANCELLED·NO_SHOW / 補課 / 已扣堂 / 已有 SUCCESS 交易
// ============================================================

const PACKAGE_PENDING = {
  id: "bk_2",
  bookingType: "PACKAGE_SESSION",
  bookingStatus: "PENDING",
  customerId: "cust_1",
  isMakeup: false,
  servicePlanId: "plan_1",
  customerPlanWalletId: "w_1",
  expectedAmount: null as number | null,
};

const baseB = { bookingId: "bk_2", reason: "連蒸第二天優惠" };

function setupModeB() {
  h.bookingFindFirst.mockResolvedValue({ ...PACKAGE_PENDING } as unknown as never);
  h.txBookingFindUnique.mockResolvedValue({
    bookingType: "PACKAGE_SESSION",
    bookingStatus: "PENDING",
    isMakeup: false,
  } as unknown as never);
}

const lastUpdateData = () =>
  (h.txBookingUpdate.mock.calls.at(-1) as unknown[] | undefined)?.[0] as {
    data: Record<string, unknown>;
  };

describe("adjustCheckoutToSingle — happy path (PACKAGE_SESSION → SINGLE)", () => {
  it("releases sessions, flips to clean SINGLE, writes audit with reason — zero Transaction", async () => {
    setupModeB();
    const r = await adjustCheckoutToSingle(baseB);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.bookingId).toBe("bk_2");

    // 釋放既有配堂（RESERVED → AVAILABLE），對應本 booking
    expect(h.releaseSessions).toHaveBeenCalledTimes(1);
    expect((h.releaseSessions.mock.calls[0] as unknown[])[1]).toBe("bk_2");

    // 翻成乾淨單次：清方案 / wallet / 金額快照
    const upd = lastUpdateData();
    expect(upd.data.bookingType).toBe("SINGLE");
    expect(upd.data.customerPlanWalletId).toBeNull();
    expect(upd.data.servicePlanId).toBeNull();
    expect(upd.data.expectedAmount).toBeNull();

    // audit：action + reason 寫入
    expect(h.txAuditCreate).toHaveBeenCalledTimes(1);
    const audit = (h.txAuditCreate.mock.calls[0] as unknown[])[0] as {
      data: { action: string; afterJson: Record<string, unknown> };
    };
    expect(audit.data.action).toBe("ADJUST_CHECKOUT_METHOD");
    expect(audit.data.afterJson.reason).toBe("連蒸第二天優惠");

    // 零金流
    expect(h.txTransactionCreate).not.toHaveBeenCalled();
    expect(h.revalidateBookings).toHaveBeenCalledTimes(1);
  });

  it("reason omitted → still succeeds, audit reason = null", async () => {
    setupModeB();
    const r = await adjustCheckoutToSingle({ bookingId: "bk_2" });
    expect(r.success).toBe(true);
    expect(h.txAuditCreate).toHaveBeenCalledTimes(1);
    const audit = (h.txAuditCreate.mock.calls[0] as unknown[])[0] as {
      data: { afterJson: Record<string, unknown> };
    };
    expect(audit.data.afterJson.reason).toBeNull();
    expect(h.releaseSessions).toHaveBeenCalledTimes(1);
  });
});

describe("adjustCheckoutToSingle — race-safe ordering", () => {
  it("locks Booking row (FOR UPDATE) BEFORE re-read / release / update", async () => {
    setupModeB();
    await adjustCheckoutToSingle(baseB);
    const lockOrder = h.txQueryRaw.mock.invocationCallOrder[0];
    const reReadOrder = h.txBookingFindUnique.mock.invocationCallOrder[0];
    const releaseOrder = h.releaseSessions.mock.invocationCallOrder[0];
    const updateOrder = h.txBookingUpdate.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(reReadOrder);
    expect(reReadOrder).toBeLessThan(releaseOrder);
    expect(releaseOrder).toBeLessThan(updateOrder);
  });

  it("CONFLICT when locked re-read shows bookingType already changed (concurrent)", async () => {
    setupModeB();
    h.txBookingFindUnique.mockResolvedValue({
      bookingType: "SINGLE",
      bookingStatus: "PENDING",
      isMakeup: false,
    } as unknown as never);
    const r = await adjustCheckoutToSingle(baseB);
    expect(r.success).toBe(false);
    expect(h.releaseSessions).not.toHaveBeenCalled();
    expect(h.txBookingUpdate).not.toHaveBeenCalled();
  });

  it("CONFLICT when a COMPLETED WalletSession appears after lock (concurrent complete)", async () => {
    setupModeB();
    h.txWalletSessionCount.mockResolvedValue(1);
    const r = await adjustCheckoutToSingle(baseB);
    expect(r.success).toBe(false);
    expect(h.releaseSessions).not.toHaveBeenCalled();
    expect(h.txBookingUpdate).not.toHaveBeenCalled();
  });

  it("CONFLICT when a SUCCESS tx appears after lock (concurrent collect/deduct)", async () => {
    setupModeB();
    h.txTransactionFindFirst.mockResolvedValue({ id: "tx_paid" });
    const r = await adjustCheckoutToSingle(baseB);
    expect(r.success).toBe(false);
    expect(h.releaseSessions).not.toHaveBeenCalled();
    expect(h.txBookingUpdate).not.toHaveBeenCalled();
  });
});

describe("adjustCheckoutToSingle — pre-transaction guards", () => {
  it("rejects makeup booking", async () => {
    setupModeB();
    h.bookingFindFirst.mockResolvedValue({
      ...PACKAGE_PENDING,
      isMakeup: true,
    } as unknown as never);
    const r = await adjustCheckoutToSingle(baseB);
    expect(r.success).toBe(false);
    expect(h.txRun).not.toHaveBeenCalled();
  });

  it.each(["FIRST_TRIAL", "SINGLE"])(
    "rejects bookingType=%s (only PACKAGE_SESSION)",
    async (bt) => {
      setupModeB();
      h.bookingFindFirst.mockResolvedValue({
        ...PACKAGE_PENDING,
        bookingType: bt,
      } as unknown as never);
      const r = await adjustCheckoutToSingle(baseB);
      expect(r.success).toBe(false);
      expect(h.txRun).not.toHaveBeenCalled();
    },
  );

  it.each(["COMPLETED", "CANCELLED", "NO_SHOW"])(
    "rejects bookingStatus=%s",
    async (st) => {
      setupModeB();
      h.bookingFindFirst.mockResolvedValue({
        ...PACKAGE_PENDING,
        bookingStatus: st,
      } as unknown as never);
      const r = await adjustCheckoutToSingle(baseB);
      expect(r.success).toBe(false);
      expect(h.txRun).not.toHaveBeenCalled();
    },
  );

  it("rejects when already deducted (COMPLETED WalletSession exists, pre-tx)", async () => {
    setupModeB();
    h.walletSessionCount.mockResolvedValue(1);
    const r = await adjustCheckoutToSingle(baseB);
    expect(r.success).toBe(false);
    expect(h.txRun).not.toHaveBeenCalled();
  });

  it("rejects when a SUCCESS transaction already exists (pre-tx)", async () => {
    setupModeB();
    h.transactionFindFirst.mockResolvedValue({ id: "tx_old" });
    const r = await adjustCheckoutToSingle(baseB);
    expect(r.success).toBe(false);
    expect(h.txRun).not.toHaveBeenCalled();
  });

  it("cross-store booking (store-scoped findFirst → null) → NOT_FOUND", async () => {
    h.bookingFindFirst.mockResolvedValue(null as unknown as never);
    const r = await adjustCheckoutToSingle(baseB);
    expect(r.success).toBe(false);
    expect(h.txRun).not.toHaveBeenCalled();
  });
});

describe("adjustCheckoutToSingleSchema", () => {
  it("accepts with/without reason; rejects empty bookingId", async () => {
    const { adjustCheckoutToSingleSchema } = await import(
      "@/lib/validators/booking-checkout"
    );
    expect(() =>
      adjustCheckoutToSingleSchema.parse({ bookingId: "bk", reason: "促銷" }),
    ).not.toThrow();
    expect(() =>
      adjustCheckoutToSingleSchema.parse({ bookingId: "bk" }),
    ).not.toThrow();
    expect(() =>
      adjustCheckoutToSingleSchema.parse({ bookingId: "" }),
    ).toThrow();
  });
});
