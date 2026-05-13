/**
 * previewStaffSettlement — PR-2.2 攤提金額邏輯測試
 *
 * 規則矩陣對應 docs/staff-settlement-phase1-spec.md §3.7：
 *   walletId === null：
 *     - FIRST_TRIAL  → amount=0
 *     - SINGLE       → amount=0
 *     - PACKAGE      → needsReview
 *   walletId 存在：
 *     - override EXCLUDE_FROM_SETTLEMENT → needsReview, amount=null
 *     - override OVERRIDE_TOTAL → amount = overrideUnitPrice
 *     - override CONFIRM_AS_IS  → amount = purchasedPrice / totalSessions
 *     - no override + has ADJUSTMENT → needsReview（保守預設）
 *     - no override + no ADJUSTMENT → amount = formula
 *
 * 另含既有規則：PARTNER visibility / staff filter / summary 排序 / store scope。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const STORE_A = "store-zhubei";
const STAFF_A = "staff-aaa";
const STAFF_B = "staff-bbb";

const mockBookingFindMany = vi.fn();
const mockGetOverride = vi.fn();

function throwIfCalled(name: string) {
  return vi.fn((...args: unknown[]) => {
    throw new Error(`[guard] unexpected ${name}(${JSON.stringify(args)})`);
  });
}

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: {
      findMany: (...a: unknown[]) => mockBookingFindMany(...a),
      create: throwIfCalled("booking.create"),
      update: throwIfCalled("booking.update"),
      delete: throwIfCalled("booking.delete"),
    },
    customer: { update: throwIfCalled("customer.update") },
    customerPlanWallet: { update: throwIfCalled("wallet.update") },
    transaction: { create: throwIfCalled("transaction.create") },
  },
}));

const mockRequireStaffSession = vi.fn();
vi.mock("@/lib/session", () => ({
  requireStaffSession: () => mockRequireStaffSession(),
}));

const mockGetManagerReadFilter = vi.fn();
vi.mock("@/lib/manager-visibility", () => ({
  getManagerReadFilter: (...a: unknown[]) => mockGetManagerReadFilter(...a),
}));

vi.mock("@/server/services/settlement-overrides", () => ({
  getOverrideForWallet: (id: string) => mockGetOverride(id),
}));

import {
  previewStaffSettlement,
  UNASSIGNED_STAFF_TOKEN,
} from "@/server/queries/staff-settlement";

// ── Booking row factory ───────────────────────────────────────────────

interface BookingFactoryOpts {
  id: string;
  date: string;
  slot?: string;
  customerName?: string;
  bookingType?: "PACKAGE_SESSION" | "SINGLE" | "FIRST_TRIAL";
  isMakeup?: boolean;
  revenueStaffId: string | null;
  revenueStaffName?: string;
  serviceStaffId?: string | null;
  walletId?: string | null;
  walletPurchasedPrice?: number;
  walletTotalSessions?: number;
  walletHasAdjustment?: boolean;
  // For makeup bookings tracing back to original wallet:
  makeupOriginalWalletId?: string | null;
  makeupOriginalPurchasedPrice?: number;
  makeupOriginalTotalSessions?: number;
  makeupOriginalHasAdjustment?: boolean;
}

function makeBooking(o: BookingFactoryOpts) {
  const wallet = o.walletId
    ? {
        id: o.walletId,
        purchasedPrice: { toString: () => String(o.walletPurchasedPrice ?? 0) },
        totalSessions: o.walletTotalSessions ?? 0,
        transactions: o.walletHasAdjustment ? [{ id: "tx-adj" }] : [],
      }
    : null;
  const origWallet = o.makeupOriginalWalletId
    ? {
        id: o.makeupOriginalWalletId,
        purchasedPrice: {
          toString: () => String(o.makeupOriginalPurchasedPrice ?? 0),
        },
        totalSessions: o.makeupOriginalTotalSessions ?? 0,
        transactions: o.makeupOriginalHasAdjustment ? [{ id: "tx-adj-orig" }] : [],
      }
    : null;
  return {
    id: o.id,
    bookingDate: new Date(`${o.date}T00:00:00.000Z`),
    slotTime: o.slot ?? "10:00",
    bookingType: o.bookingType ?? "PACKAGE_SESSION",
    isMakeup: o.isMakeup ?? false,
    revenueStaffId: o.revenueStaffId,
    serviceStaffId: o.serviceStaffId ?? null,
    customerPlanWalletId: o.walletId ?? null,
    customer: { name: o.customerName ?? "Test" },
    revenueStaff: o.revenueStaffId
      ? { id: o.revenueStaffId, displayName: o.revenueStaffName ?? "Staff X" }
      : null,
    serviceStaff: o.serviceStaffId
      ? { id: o.serviceStaffId, displayName: "Service X" }
      : null,
    customerPlanWallet: wallet,
    makeupCredit: origWallet
      ? {
          originalBooking: {
            customerPlanWalletId: origWallet.id,
            customerPlanWallet: origWallet,
          },
        }
      : null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireStaffSession.mockResolvedValue({
    role: "OWNER",
    staffId: STAFF_A,
    storeId: STORE_A,
  });
  mockGetManagerReadFilter.mockReturnValue({ storeId: STORE_A });
  mockBookingFindMany.mockResolvedValue([]);
  mockGetOverride.mockReturnValue(null); // 預設無 override
});

// ── 無 wallet 情境 ────────────────────────────────────────────────────

describe("previewStaffSettlement — no-wallet bookings", () => {
  it("FIRST_TRIAL 無 wallet → amount=0, source=trial_no_wallet, counted=false", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      makeBooking({
        id: "b1",
        date: "2026-05-01",
        bookingType: "FIRST_TRIAL",
        revenueStaffId: STAFF_A,
        revenueStaffName: "A",
        walletId: null,
      }),
    ]);
    const r = await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    expect(r.details[0]).toMatchObject({
      amount: 0,
      amountSource: "trial_no_wallet",
      needsReview: false,
      counted: false, // amount=0 不算 counted
    });
  });

  it("SINGLE 無 wallet → amount=0, source=single_no_wallet, counted=false", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      makeBooking({
        id: "b1",
        date: "2026-05-01",
        bookingType: "SINGLE",
        revenueStaffId: STAFF_A,
        revenueStaffName: "A",
        walletId: null,
      }),
    ]);
    const r = await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    expect(r.details[0]).toMatchObject({
      amount: 0,
      amountSource: "single_no_wallet",
      needsReview: false,
    });
  });

  it("PACKAGE_SESSION 無 wallet → amount=null, source=missing_wallet, needsReview=true", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      makeBooking({
        id: "b1",
        date: "2026-05-01",
        bookingType: "PACKAGE_SESSION",
        revenueStaffId: STAFF_A,
        revenueStaffName: "A",
        walletId: null,
      }),
    ]);
    const r = await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    expect(r.details[0]).toMatchObject({
      amount: null,
      amountSource: "missing_wallet",
      needsReview: true,
    });
  });
});

// ── Override 三種 decision ────────────────────────────────────────────

describe("previewStaffSettlement — operator overrides", () => {
  it("override OVERRIDE_TOTAL → amount = overrideUnitPrice", async () => {
    mockGetOverride.mockImplementation((id: string) =>
      id === "wallet-1"
        ? {
            walletId: "wallet-1",
            decision: "OVERRIDE_TOTAL",
            overrideTotalSessions: 22,
            overrideUnitPrice: 545.45,
          }
        : null,
    );
    mockBookingFindMany.mockResolvedValueOnce([
      makeBooking({
        id: "b1",
        date: "2026-05-01",
        revenueStaffId: STAFF_A,
        revenueStaffName: "A",
        walletId: "wallet-1",
        walletPurchasedPrice: 12000,
        walletTotalSessions: 20, // 寫的是 20 但 operator override 成 22
        walletHasAdjustment: true,
      }),
    ]);
    const r = await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    expect(r.details[0].amount).toBeCloseTo(545.45);
    expect(r.details[0].amountSource).toBe("override");
    expect(r.details[0].needsReview).toBe(false);
    expect(r.details[0].counted).toBe(true);
  });

  it("override CONFIRM_AS_IS → amount = purchasedPrice / totalSessions", async () => {
    mockGetOverride.mockImplementation((id: string) =>
      id === "wallet-1"
        ? { walletId: "wallet-1", decision: "CONFIRM_AS_IS" }
        : null,
    );
    mockBookingFindMany.mockResolvedValueOnce([
      makeBooking({
        id: "b1",
        date: "2026-05-01",
        revenueStaffId: STAFF_A,
        revenueStaffName: "A",
        walletId: "wallet-1",
        walletPurchasedPrice: 12000,
        walletTotalSessions: 20,
        walletHasAdjustment: true, // 即使有 ADJUSTMENT，CONFIRM_AS_IS 仍信任公式
      }),
    ]);
    const r = await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    expect(r.details[0].amount).toBeCloseTo(600);
    expect(r.details[0].amountSource).toBe("formula_confirmed");
    expect(r.details[0].needsReview).toBe(false);
  });

  it("override CONFIRM_AS_IS 但 wallet 資料殘缺 → confirmed_but_data_missing + needsReview", async () => {
    mockGetOverride.mockImplementation((id: string) =>
      id === "wallet-1"
        ? { walletId: "wallet-1", decision: "CONFIRM_AS_IS" }
        : null,
    );
    mockBookingFindMany.mockResolvedValueOnce([
      makeBooking({
        id: "b1",
        date: "2026-05-01",
        revenueStaffId: STAFF_A,
        revenueStaffName: "A",
        walletId: "wallet-1",
        walletPurchasedPrice: 0, // 異常：confirmed 但價格 0
        walletTotalSessions: 10,
      }),
    ]);
    const r = await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    expect(r.details[0].amount).toBeNull();
    expect(r.details[0].amountSource).toBe("confirmed_but_data_missing");
    expect(r.details[0].needsReview).toBe(true);
  });

  it("override EXCLUDE_FROM_SETTLEMENT → amount=null, needsReview=true", async () => {
    mockGetOverride.mockImplementation((id: string) =>
      id === "wallet-1"
        ? { walletId: "wallet-1", decision: "EXCLUDE_FROM_SETTLEMENT" }
        : null,
    );
    mockBookingFindMany.mockResolvedValueOnce([
      makeBooking({
        id: "b1",
        date: "2026-05-01",
        revenueStaffId: STAFF_A,
        revenueStaffName: "A",
        walletId: "wallet-1",
        walletPurchasedPrice: 0, // 活動贈送方案
        walletTotalSessions: 5,
      }),
    ]);
    const r = await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    expect(r.details[0].amount).toBeNull();
    expect(r.details[0].amountSource).toBe("operator_excluded");
    expect(r.details[0].needsReview).toBe(true);
    expect(r.details[0].counted).toBe(false);
  });
});

// ── 無 override 的 fallback ──────────────────────────────────────────

describe("previewStaffSettlement — fallback when no override", () => {
  it("無 override 且無 ADJUSTMENT → formula_clean", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      makeBooking({
        id: "b1",
        date: "2026-05-01",
        revenueStaffId: STAFF_A,
        revenueStaffName: "A",
        walletId: "wallet-1",
        walletPurchasedPrice: 5000,
        walletTotalSessions: 10,
        walletHasAdjustment: false,
      }),
    ]);
    const r = await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    expect(r.details[0].amount).toBeCloseTo(500);
    expect(r.details[0].amountSource).toBe("formula_clean");
    expect(r.details[0].needsReview).toBe(false);
  });

  it("無 override 但有 ADJUSTMENT → needs_operator_review（保守預設，不算）", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      makeBooking({
        id: "b1",
        date: "2026-05-01",
        revenueStaffId: STAFF_A,
        revenueStaffName: "A",
        walletId: "wallet-1",
        walletPurchasedPrice: 12000,
        walletTotalSessions: 20,
        walletHasAdjustment: true,
      }),
    ]);
    const r = await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    expect(r.details[0].amount).toBeNull();
    expect(r.details[0].amountSource).toBe("needs_operator_review");
    expect(r.details[0].needsReview).toBe(true);
  });

  it("無 override + wallet 資料殘缺（price=0）→ data_missing", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      makeBooking({
        id: "b1",
        date: "2026-05-01",
        revenueStaffId: STAFF_A,
        revenueStaffName: "A",
        walletId: "wallet-1",
        walletPurchasedPrice: 0,
        walletTotalSessions: 10,
        walletHasAdjustment: false,
      }),
    ]);
    const r = await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    expect(r.details[0].amount).toBeNull();
    expect(r.details[0].amountSource).toBe("data_missing");
    expect(r.details[0].needsReview).toBe(true);
  });
});

// ── 補課溯源 ─────────────────────────────────────────────────────────

describe("previewStaffSettlement — makeup booking traces to original wallet", () => {
  it("補課 booking 透過 makeupCredit 溯源原 wallet 計算", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      makeBooking({
        id: "b-makeup",
        date: "2026-05-01",
        isMakeup: true,
        revenueStaffId: STAFF_A,
        revenueStaffName: "A",
        walletId: null, // 補課自己無 wallet
        makeupOriginalWalletId: "wallet-orig",
        makeupOriginalPurchasedPrice: 8000,
        makeupOriginalTotalSessions: 10,
        makeupOriginalHasAdjustment: false,
      }),
    ]);
    const r = await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    expect(r.details[0].walletId).toBe("wallet-orig");
    expect(r.details[0].amount).toBeCloseTo(800);
    expect(r.details[0].amountSource).toBe("formula_clean");
  });
});

// ── Summary aggregation ──────────────────────────────────────────────

describe("previewStaffSettlement — summary aggregation", () => {
  it("countedAmount 加總所有 amount > 0 且 revenueStaffId !== null 的 booking", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      makeBooking({
        id: "b1",
        date: "2026-05-01",
        revenueStaffId: STAFF_A,
        revenueStaffName: "A",
        walletId: "w1",
        walletPurchasedPrice: 5000,
        walletTotalSessions: 10,
      }),
      makeBooking({
        id: "b2",
        date: "2026-05-02",
        revenueStaffId: STAFF_A,
        revenueStaffName: "A",
        walletId: "w2",
        walletPurchasedPrice: 6000,
        walletTotalSessions: 10,
      }),
      // 歸店家 → counted=false
      makeBooking({
        id: "b3",
        date: "2026-05-03",
        revenueStaffId: null,
        walletId: "w3",
        walletPurchasedPrice: 5000,
        walletTotalSessions: 10,
      }),
      // needsReview → 不計入 countedAmount
      makeBooking({
        id: "b4",
        date: "2026-05-04",
        revenueStaffId: STAFF_A,
        revenueStaffName: "A",
        walletId: "w4",
        walletPurchasedPrice: 5000,
        walletTotalSessions: 10,
        walletHasAdjustment: true, // → needs_operator_review
      }),
    ]);
    const r = await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    const staffA = r.summary.find((s) => s.staffId === STAFF_A)!;
    expect(staffA.countedAmount).toBeCloseTo(500 + 600);
    expect(staffA.totalCount).toBe(3); // b1, b2, b4
    expect(staffA.needsReviewCount).toBe(1); // b4
    const homeless = r.summary.find((s) => s.staffId === null)!;
    expect(homeless.countedAmount).toBe(0);
  });

  it("歸店家 row 永遠排最下（即使 countedAmount 高）", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      makeBooking({
        id: "b1",
        date: "2026-05-01",
        revenueStaffId: null,
        walletId: "w1",
        walletPurchasedPrice: 9999,
        walletTotalSessions: 1,
      }),
      makeBooking({
        id: "b2",
        date: "2026-05-02",
        revenueStaffId: STAFF_A,
        revenueStaffName: "A",
        walletId: "w2",
        walletPurchasedPrice: 100,
        walletTotalSessions: 10,
      }),
    ]);
    const r = await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    expect(r.summary[0].staffId).toBe(STAFF_A);
    expect(r.summary[1].staffId).toBeNull();
  });

  it("regular + makeup 分開 count，amount 各自加總", async () => {
    mockBookingFindMany.mockResolvedValueOnce([
      makeBooking({
        id: "b1",
        date: "2026-05-01",
        isMakeup: false,
        revenueStaffId: STAFF_A,
        revenueStaffName: "A",
        walletId: "w1",
        walletPurchasedPrice: 5000,
        walletTotalSessions: 10,
      }),
      makeBooking({
        id: "b2",
        date: "2026-05-02",
        isMakeup: true,
        revenueStaffId: STAFF_A,
        revenueStaffName: "A",
        walletId: null,
        makeupOriginalWalletId: "w-orig",
        makeupOriginalPurchasedPrice: 6000,
        makeupOriginalTotalSessions: 10,
      }),
    ]);
    const r = await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    const staffA = r.summary[0];
    expect(staffA.regularCount).toBe(1);
    expect(staffA.makeupCount).toBe(1);
    expect(staffA.totalCount).toBe(2);
    expect(staffA.countedAmount).toBeCloseTo(500 + 600);
  });
});

// ── PARTNER visibility lockdown (regression from PR-2) ───────────────

describe("previewStaffSettlement — PARTNER visibility lockdown", () => {
  it("PARTNER manager filter 不可被 URL staffId 覆蓋", async () => {
    mockRequireStaffSession.mockResolvedValueOnce({
      role: "PARTNER",
      staffId: STAFF_A,
      storeId: STORE_A,
    });
    mockGetManagerReadFilter.mockReturnValueOnce({
      storeId: STORE_A,
      revenueStaffId: STAFF_A,
    });
    mockBookingFindMany.mockResolvedValueOnce([]);
    await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      staffId: STAFF_B, // PARTNER 想看別人
    });
    const [callArg] = mockBookingFindMany.mock.calls[0];
    expect(callArg.where.revenueStaffId).toBe(STAFF_A);
  });
});

// ── Staff filter ─────────────────────────────────────────────────────

describe("previewStaffSettlement — staff filter", () => {
  it("UNASSIGNED_STAFF_TOKEN → where.revenueStaffId = null", async () => {
    mockBookingFindMany.mockResolvedValueOnce([]);
    await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      staffId: UNASSIGNED_STAFF_TOKEN,
    });
    const [callArg] = mockBookingFindMany.mock.calls[0];
    expect(callArg.where.revenueStaffId).toBeNull();
  });

  it("特定 staffId → where.revenueStaffId = 該 id", async () => {
    mockBookingFindMany.mockResolvedValueOnce([]);
    await previewStaffSettlement({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      staffId: STAFF_B,
    });
    const [callArg] = mockBookingFindMany.mock.calls[0];
    expect(callArg.where.revenueStaffId).toBe(STAFF_B);
  });
});
