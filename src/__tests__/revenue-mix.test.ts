import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transactions: vi.fn(), cashbook: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    transaction: { findMany: (...args: unknown[]) => mocks.transactions(...args) },
    cashbookEntry: { findMany: (...args: unknown[]) => mocks.cashbook(...args) },
  },
}));

import { getRevenueMix } from "@/server/queries/revenue-mix";

beforeEach(() => {
  mocks.transactions.mockReset();
  mocks.cashbook.mockReset();
});

describe("income composition", () => {
  it("reconciles package, retail and other income, refunds, and real expenses across Taipei dates", async () => {
    mocks.transactions.mockResolvedValue([
      { createdAt: new Date("2026-09-01T17:00:00Z"), transactionType: "PACKAGE_PURCHASE", paymentStatus: "SUCCESS", amount: 12000 },
      { createdAt: new Date("2026-09-02T03:00:00Z"), transactionType: "TRIAL_PURCHASE", paymentStatus: "SUCCESS", amount: 500 },
      { createdAt: new Date("2026-09-02T04:00:00Z"), transactionType: "PACKAGE_PURCHASE", paymentStatus: "PENDING", amount: 3000 },
      { createdAt: new Date("2026-09-03T03:00:00Z"), transactionType: "REFUND", paymentStatus: "SUCCESS", amount: -1000 },
    ]);
    mocks.cashbook.mockResolvedValue([
      { entryDate: new Date("2026-09-02T00:00:00Z"), type: "INCOME", category: "零售-保養品", amount: 300 },
      { entryDate: new Date("2026-09-03T00:00:00Z"), type: "INCOME", category: "其他", amount: 200 },
      { entryDate: new Date("2026-09-03T00:00:00Z"), type: "EXPENSE", category: "材料", amount: 400 },
    ]);

    const result = await getRevenueMix("store-1", "2026-09-01", "2026-09-03");
    expect(result).toMatchObject({
      packageRevenue: 12000, retailRevenue: 300, otherRevenue: 700,
      grossRevenue: 13000, refunds: 1000, netRevenue: 12000,
      expense: 400, balance: 11600, pendingRevenue: 3000, manualIncome: 500,
    });
    expect(result.packageShare).toBeCloseTo(12000 / 13000 * 100);
    expect(result.points.find((p) => p.key === "2026-09-02")).toMatchObject({
      packageRevenue: 12000, retailRevenue: 300, otherRevenue: 500,
    });
    expect(mocks.transactions).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: "store-1", status: "SUCCESS" }),
    }));
    expect(mocks.cashbook).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: "store-1", type: { in: ["INCOME", "EXPENSE"] } }),
    }));
  });

  it("shows seven daily points for today while keeping its summary limited to today", async () => {
    mocks.transactions.mockResolvedValue([
      { createdAt: new Date("2026-09-17T04:00:00Z"), transactionType: "PACKAGE_PURCHASE", paymentStatus: "SUCCESS", amount: 2000 },
      { createdAt: new Date("2026-09-23T04:00:00Z"), transactionType: "PACKAGE_PURCHASE", paymentStatus: "SUCCESS", amount: 3000 },
    ]);
    mocks.cashbook.mockResolvedValue([]);

    const result = await getRevenueMix("store-1", "2026-09-23", "2026-09-23");
    expect(result.points).toHaveLength(7);
    expect(result.packageRevenue).toBe(3000);
    expect(result.points[0].packageRevenue).toBe(2000);
  });
});
