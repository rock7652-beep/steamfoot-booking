import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTransactionAggregate = vi.fn();
const mockStoreFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    transaction: {
      aggregate: (...args: unknown[]) => mockTransactionAggregate(...args),
    },
    store: {
      findUnique: (...args: unknown[]) => mockStoreFindUnique(...args),
    },
  },
}));

describe("service fee calculator service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransactionAggregate.mockResolvedValue({ _sum: { amount: null }, _count: { id: 0 } });
    mockStoreFindUnique.mockResolvedValue({ name: "測試店" });
  });

  it("returns zero summary when the month has no paid transactions", async () => {
    const { getServiceFeeCalculatorSummary } = await import(
      "@/server/services/service-fee-calculator"
    );

    const summary = await getServiceFeeCalculatorSummary({
      storeId: "store-1",
      month: "2026-06",
    });

    expect(summary).toMatchObject({
      month: "2026-06",
      storeId: "store-1",
      storeName: "測試店",
      grossRevenue: 0,
      refundAmount: 0,
      netRevenue: 0,
      revenueTransactionCount: 0,
      refundTransactionCount: 0,
    });
  });

  it("calculates gross revenue, refunds, and net revenue for one store and month", async () => {
    mockTransactionAggregate
      .mockResolvedValueOnce({ _sum: { amount: 12000 }, _count: { id: 4 } })
      .mockResolvedValueOnce({ _sum: { amount: -2000 }, _count: { id: 1 } });
    const { getServiceFeeCalculatorSummary } = await import(
      "@/server/services/service-fee-calculator"
    );

    const summary = await getServiceFeeCalculatorSummary({
      storeId: "store-1",
      month: "2026-06",
    });

    expect(summary.grossRevenue).toBe(12000);
    expect(summary.refundAmount).toBe(2000);
    expect(summary.netRevenue).toBe(10000);
    expect(summary.revenueTransactionCount).toBe(4);
    expect(summary.refundTransactionCount).toBe(1);
  });

  it("applies storeId, month range, and paid transaction filters", async () => {
    const { getServiceFeeCalculatorSummary } = await import(
      "@/server/services/service-fee-calculator"
    );

    await getServiceFeeCalculatorSummary({ storeId: "store-1", month: "2026-06" });

    expect(mockTransactionAggregate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-1",
          transactionType: {
            in: ["TRIAL_PURCHASE", "SINGLE_PURCHASE", "PACKAGE_PURCHASE", "SUPPLEMENT"],
          },
          status: "SUCCESS",
          paymentStatus: { in: ["SUCCESS", "CONFIRMED"] },
          transactionDate: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      }),
    );
    expect(mockTransactionAggregate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-1",
          transactionType: "REFUND",
          status: "SUCCESS",
          paymentStatus: { in: ["SUCCESS", "CONFIRMED"] },
        }),
      }),
    );
  });

  it("supports all-store view without adding a storeId filter", async () => {
    const { getServiceFeeCalculatorSummary } = await import(
      "@/server/services/service-fee-calculator"
    );

    await getServiceFeeCalculatorSummary({ storeId: null, month: "2026-06" });

    expect(mockStoreFindUnique).not.toHaveBeenCalled();
    expect(mockTransactionAggregate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.not.objectContaining({ storeId: expect.any(String) }),
      }),
    );
  });

  it("calculates receivable amount from fixed fee, share, additions, and deductions", async () => {
    const { calculateServiceFeeSettlement } = await import(
      "@/server/services/service-fee-calculator"
    );

    const result = calculateServiceFeeSettlement(
      { netRevenue: 10000 },
      {
        fixedMonthlyFee: 3000,
        revenueSharePercent: 12.5,
        additionalAmount: 800,
        deductionAmount: 300,
      },
    );

    expect(result).toEqual({
      fixedMonthlyFee: 3000,
      revenueSharePercent: 12.5,
      additionalAmount: 800,
      deductionAmount: 300,
      revenueShareAmount: 1250,
      receivableAmount: 4750,
    });
  });
});
