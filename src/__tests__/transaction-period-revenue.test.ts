import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  aggregate: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
  requireStaffSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    transaction: {
      aggregate: mocks.aggregate,
      count: mocks.count,
      findMany: mocks.findMany,
    },
  },
}));

vi.mock("@/lib/session", () => ({
  requireSession: mocks.requireStaffSession,
  requireStaffSession: mocks.requireStaffSession,
}));

describe("listTransactions period revenue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireStaffSession.mockResolvedValue({
      id: "user-1",
      role: "OWNER",
      staffId: "staff-owner",
      storeId: "store-1",
    });
    mocks.findMany.mockResolvedValue(Array.from({ length: 30 }, (_, index) => ({ id: `tx-${index}` })));
    mocks.count.mockResolvedValue(91);
    mocks.aggregate.mockResolvedValue({ _sum: { amount: 45678 } });
  });

  it("aggregates all matching successful revenue transactions without page limits", async () => {
    const { listTransactions } = await import("@/server/queries/transaction");

    const result = await listTransactions({
      activeStoreId: "store-1",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      revenueStaffId: "staff-2",
      page: 3,
      pageSize: 30,
    });

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 60, take: 30 }));
    expect(mocks.aggregate).toHaveBeenCalledWith({
      where: {
        AND: [
          expect.objectContaining({
            storeId: "store-1",
            revenueStaffId: "staff-2",
            createdAt: {
              gte: new Date("2026-06-30T16:00:00.000Z"),
              lte: new Date("2026-07-31T15:59:59.999Z"),
            },
          }),
          {
            transactionType: {
              in: ["TRIAL_PURCHASE", "SINGLE_PURCHASE", "PACKAGE_PURCHASE", "SUPPLEMENT"],
            },
            status: "SUCCESS",
          },
        ],
      },
      _sum: { amount: true },
    });
    expect(result).toMatchObject({ total: 91, page: 3, pageSize: 30, periodRevenue: 45678 });
  });
});
