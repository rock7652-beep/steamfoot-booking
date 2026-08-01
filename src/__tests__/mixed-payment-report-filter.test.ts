import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: { transaction: { findMany } },
}));

import { getRevenueKpi, getStoreRevenueSummary, type ReportFilters } from "@/lib/report-queries";

const filters: ReportFilters = {
  startDate: "2026-08-01",
  endDate: "2026-08-02",
  paymentMethod: "CASH",
  storeFilter: {},
};

const mixedTransaction = {
  storeId: "store-1",
  storeNameSnapshot: "測試店",
  planType: "SINGLE",
  customerId: "customer-1",
  revenueStaffId: "staff-1",
  coachNameSnapshot: "教練",
  coachRoleSnapshot: "OWNER",
  isFirstPurchase: true,
  paymentMethod: "CASH",
  netAmount: new Prisma.Decimal(5000),
  refundAmount: new Prisma.Decimal(0),
  paymentSplits: [
    { paymentMethod: "CASH", amount: new Prisma.Decimal(2000) },
    { paymentMethod: "TRANSFER", amount: new Prisma.Decimal(3000) },
  ],
  store: { name: "測試店" },
  revenueStaff: { displayName: "教練", user: { role: "OWNER" } },
};

describe("mixed payment report filters", () => {
  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([mixedTransaction]);
  });

  it("uses only the selected CASH split in store summary and KPI, not the transaction total", async () => {
    const [summary, kpi] = await Promise.all([
      getStoreRevenueSummary(filters),
      getRevenueKpi(filters),
    ]);

    expect(summary[0]).toMatchObject({ totalRevenue: 2000, netRevenue: 2000, singleRevenue: 2000, txCount: 1 });
    expect(kpi).toMatchObject({ totalRevenue: 2000, netRevenue: 2000, txCount: 1 });
  });
});
