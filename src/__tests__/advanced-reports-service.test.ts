import { beforeEach, describe, expect, it, vi } from "vitest";

const mockBookingFindMany = vi.fn();
const mockCustomerFindMany = vi.fn();
const mockCustomerCount = vi.fn();
const mockWalletFindMany = vi.fn();
const mockTransactionAggregate = vi.fn();
const mockTransactionFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: {
      findMany: (...args: unknown[]) => mockBookingFindMany(...args),
    },
    customer: {
      findMany: (...args: unknown[]) => mockCustomerFindMany(...args),
      count: (...args: unknown[]) => mockCustomerCount(...args),
    },
    customerPlanWallet: {
      findMany: (...args: unknown[]) => mockWalletFindMany(...args),
    },
    transaction: {
      aggregate: (...args: unknown[]) => mockTransactionAggregate(...args),
      findMany: (...args: unknown[]) => mockTransactionFindMany(...args),
    },
  },
}));

function setupEmptyMocks() {
  mockBookingFindMany.mockResolvedValue([]);
  mockCustomerFindMany.mockResolvedValue([]);
  mockWalletFindMany.mockResolvedValue([]);
  mockCustomerCount.mockResolvedValue(0);
  mockTransactionAggregate.mockResolvedValue({ _sum: { amount: null }, _count: { id: 0 } });
  mockTransactionFindMany.mockResolvedValue([]);
}

describe("advanced reports metrics service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmptyMocks();
  });

  it("returns zero metrics and empty trend when there is no data", async () => {
    const { getAdvancedReportsMetrics } = await import("@/server/services/advanced-reports");

    const metrics = await getAdvancedReportsMetrics({ storeId: "store-1", month: "2026-06" });

    expect(metrics.trialConversion).toEqual({ numerator: 0, denominator: 0, rate: 0 });
    expect(metrics.renewal).toEqual({ numerator: 0, denominator: 0, rate: 0 });
    expect(metrics.revisit).toEqual({ numerator: 0, denominator: 0, rate: 0 });
    expect(metrics.averageOrderValue).toEqual({
      revenue: 0,
      transactionCount: 0,
      averageOrderValue: 0,
    });
    expect(metrics.customerActivity).toEqual({
      activeCustomers: 0,
      dormantCustomers: 0,
      totalCustomers: 0,
    });
    expect(metrics.monthlyRevenueTrend).toEqual([]);
  });

  it("calculates conversion, renewal, revisit, AOV, activity, and monthly revenue trend", async () => {
    mockBookingFindMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.bookingType === "FIRST_TRIAL") {
        return [{ customerId: "customer-a" }, { customerId: "customer-b" }];
      }
      const bookingDate = where.bookingDate as { lt?: Date; gte?: Date };
      if (bookingDate.lt) {
        return [{ customerId: "customer-a" }, { customerId: "customer-c" }];
      }
      return [{ customerId: "customer-a" }, { customerId: "customer-d" }];
    });
    mockCustomerFindMany.mockResolvedValue([{ id: "customer-a" }]);
    mockWalletFindMany
      .mockResolvedValueOnce([{ customerId: "customer-a" }, { customerId: "customer-b" }])
      .mockResolvedValueOnce([{ customerId: "customer-a" }]);
    mockTransactionAggregate.mockResolvedValue({ _sum: { amount: 3000 }, _count: { id: 3 } });
    mockCustomerCount
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2);
    mockTransactionFindMany.mockResolvedValue([
      {
        storeId: "store-1",
        storeNameSnapshot: "測試店",
        transactionDate: new Date("2026-06-10T04:00:00.000Z"),
        amount: 2000,
        store: { name: "Store One" },
      },
      {
        storeId: "store-1",
        storeNameSnapshot: "測試店",
        transactionDate: new Date("2026-06-15T04:00:00.000Z"),
        amount: -500,
        store: { name: "Store One" },
      },
      {
        storeId: "store-1",
        storeNameSnapshot: "測試店",
        transactionDate: new Date("2026-05-20T04:00:00.000Z"),
        amount: 1000,
        store: { name: "Store One" },
      },
    ]);
    const { getAdvancedReportsMetrics } = await import("@/server/services/advanced-reports");

    const metrics = await getAdvancedReportsMetrics({ storeId: "store-1", month: "2026-06" });

    expect(metrics.trialConversion).toEqual({ numerator: 1, denominator: 2, rate: 50 });
    expect(metrics.renewal).toEqual({ numerator: 1, denominator: 2, rate: 50 });
    expect(metrics.revisit).toEqual({ numerator: 1, denominator: 2, rate: 50 });
    expect(metrics.averageOrderValue).toEqual({
      revenue: 3000,
      transactionCount: 3,
      averageOrderValue: 1000,
    });
    expect(metrics.customerActivity).toEqual({
      totalCustomers: 10,
      activeCustomers: 4,
      dormantCustomers: 2,
    });
    expect(metrics.monthlyRevenueTrend).toEqual([
      {
        month: "2026-05",
        storeId: "store-1",
        storeName: "測試店",
        revenue: 1000,
        transactionCount: 1,
      },
      {
        month: "2026-06",
        storeId: "store-1",
        storeName: "測試店",
        revenue: 1500,
        transactionCount: 2,
      },
    ]);
  });

  it("applies storeId, month range, and paid transaction filters to data queries", async () => {
    const { getAdvancedReportsMetrics } = await import("@/server/services/advanced-reports");

    await getAdvancedReportsMetrics({ storeId: "store-1", month: "2026-06" });

    expect(mockBookingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-1",
          bookingType: "FIRST_TRIAL",
          bookingStatus: "COMPLETED",
          bookingDate: expect.objectContaining({
            gte: new Date(Date.UTC(2026, 5, 1)),
            lte: new Date(Date.UTC(2026, 5, 30)),
          }),
        }),
      }),
    );
    expect(mockCustomerFindMany).not.toHaveBeenCalled();
    expect(mockTransactionAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-1",
          transactionType: { in: ["TRIAL_PURCHASE", "SINGLE_PURCHASE", "PACKAGE_PURCHASE", "SUPPLEMENT"] },
          status: "SUCCESS",
          paymentStatus: { in: ["SUCCESS", "CONFIRMED"] },
          transactionDate: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      }),
    );
    expect(mockTransactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-1",
          transactionType: {
            in: ["TRIAL_PURCHASE", "SINGLE_PURCHASE", "PACKAGE_PURCHASE", "SUPPLEMENT", "REFUND"],
          },
          status: "SUCCESS",
          paymentStatus: { in: ["SUCCESS", "CONFIRMED"] },
        }),
      }),
    );
  });

  it("supports explicit date range filters", async () => {
    const { getAdvancedReportsMetrics } = await import("@/server/services/advanced-reports");

    const metrics = await getAdvancedReportsMetrics({
      storeId: "store-1",
      startDate: "2026-06-10",
      endDate: "2026-06-20",
    });

    expect(metrics.range.startDate).toBe("2026-06-10");
    expect(metrics.range.endDate).toBe("2026-06-20");
    expect(mockBookingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          bookingDate: expect.objectContaining({
            gte: new Date(Date.UTC(2026, 5, 10)),
            lte: new Date(Date.UTC(2026, 5, 20)),
          }),
        }),
      }),
    );
    expect(mockTransactionAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          transactionDate: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      }),
    );
  });
});
