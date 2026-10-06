// Cost access is covered by inventory-finance-access.test.ts; these cases retain their original finance scope.
vi.mock("@/server/inventory-finance-access",()=>({requireInventoryFinanceAccess:async()=>{},canReadInventoryFinance:async()=>true,inventoryCashbookReadFilter:async()=>({})}));
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  industry: vi.fn(), legacy: vi.fn(), cashbook: vi.fn(),
  receipts: vi.fn(), sales: vi.fn(), spaRefunds: vi.fn(), voids: vi.fn(),
  purchases: vi.fn(), courseRefunds: vi.fn(), trials: vi.fn(),
}));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: mocks.industry }));
vi.mock("@/server/queries/revenue-mix", () => ({ getRevenueMix: mocks.legacy }));
vi.mock("@/lib/db", () => ({ prisma: { cashbookEntry: { findMany: mocks.cashbook } } }));
vi.mock("@/lib/spa-db", () => ({ spaPrisma: {
  spaReceipt: { findMany: mocks.receipts }, spaCreditSale: { findMany: mocks.sales },
  spaRefund: { findMany: mocks.spaRefunds }, spaPaymentRevision: { findMany: mocks.voids },
} }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: {
  coursePurchase: { findMany: mocks.purchases }, coursePurchaseRefund: { findMany: mocks.courseRefunds },
  courseTrialPayment: { findMany: mocks.trials },
} }));

import { getIndustryRevenueMix, getIndustrySixMonthRevenueMixTrend } from "@/server/queries/industry-revenue-mix";

it("recognizes work-order collections once in their collection month, not unpaid order totals", async () => {
  mocks.industry.mockResolvedValue("music");
  expect((await getIndustryRevenueMix("store", "2026-09-01", "2026-09-30")).netRevenue).toBe(0);
  mocks.cashbook.mockResolvedValue([
    { id: "inventory:partial:goods", entryDate: new Date("2026-09-30T00:00:00Z"), type: "INCOME", category: "工單收入", amount: 100 },
    { id: "inventory:remaining:goods", entryDate: new Date("2026-10-01T00:00:00Z"), type: "INCOME", category: "工單收入", amount: 256 },
  ]);
  expect(await getIndustryRevenueMix("store", "2026-09-01", "2026-09-30")).toMatchObject({ otherRevenue: 100, netRevenue: 100, manualIncome: 0 });
  expect(await getIndustryRevenueMix("store", "2026-10-01", "2026-10-31")).toMatchObject({ otherRevenue: 256, netRevenue: 256, manualIncome: 0 });
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [mocks.cashbook, mocks.receipts, mocks.sales, mocks.spaRefunds, mocks.voids,
    mocks.purchases, mocks.courseRefunds, mocks.trials]) fn.mockResolvedValue([]);
});

it("keeps SPA voids and internal uses out of collected revenue, but includes cashbook only once", async () => {
  mocks.industry.mockResolvedValue("spa");
  mocks.receipts.mockResolvedValue([
    { id: "good", paidAt: new Date("2026-09-02T04:00:00Z"), amount: 900, paymentMethod: "CASH" },
    { id: "void", paidAt: new Date("2026-09-02T04:00:00Z"), amount: 800, paymentMethod: "CASH" },
    { id: "used", paidAt: new Date("2026-09-02T04:00:00Z"), amount: 200, paymentMethod: "ENTITLEMENT" },
  ]);
  mocks.sales.mockResolvedValue([{ id: "sale", createdAt: new Date("2026-09-03T04:00:00Z"), kind: "PACKAGE", amount: 4000, paymentMethod: "TRANSFER" }]);
  mocks.spaRefunds.mockResolvedValue([{ id: "refund", createdAt: new Date("2026-09-04T04:00:00Z"), amount: 100, paymentMethod: "CASH" }]);
  mocks.voids.mockResolvedValue([{ kind: "RECEIPT", sourceId: "void", refundId: null }]);
  mocks.cashbook.mockResolvedValue([
    { entryDate: new Date("2026-09-04T00:00:00Z"), type: "INCOME", category: "零售-商品", amount: 300 },
    { entryDate: new Date("2026-09-04T00:00:00Z"), type: "EXPENSE", category: "材料", amount: 200 },
  ]);
  const mix = await getIndustryRevenueMix("spa-store", "2026-09-01", "2026-09-30");
  expect(mix).toMatchObject({ packageRevenue: 4000, otherRevenue: 900, retailRevenue: 300,
    refunds: 100, expense: 200, netRevenue: 5100, balance: 4900 });
  expect(mocks.receipts).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "spa-store" }) }));
});

it("groups course receipts and refunds by their own business months", async () => {
  mocks.industry.mockResolvedValue("course");
  mocks.cashbook.mockResolvedValue([
    { id: "course-purchase:p", entryDate: new Date("2026-04-10T00:00:00Z"), type: "INCOME", amount: 1200 },
    { id: "course-refund:r", entryDate: new Date("2026-09-10T00:00:00Z"), type: "EXPENSE", amount: 200 },
    { id: "course-trial:t:0", entryDate: new Date("2026-09-03T00:00:00Z"), type: "INCOME", amount: 300 },
  ]);
  const points = await getIndustrySixMonthRevenueMixTrend("course-store", "2026-09-23");
  expect(points.map((p) => p.key)).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
  expect(points[0].netRevenue).toBe(1200);
  expect(points[5]).toMatchObject({ netRevenue: 100, balance: 100 });
  expect(mocks.purchases).not.toHaveBeenCalled();
  expect(mocks.cashbook).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "course-store" }) }));
});

it("counts linked course collections once, separates reversals and keeps retail income", async () => {
  mocks.industry.mockResolvedValue("course");
  mocks.purchases.mockResolvedValue([{ confirmedAt: new Date("2026-09-03T02:00:00Z"), price: 1200 }]);
  const entryDate = new Date("2026-09-03T00:00:00Z");
  mocks.cashbook.mockResolvedValue([
    { id: "course-purchase:p", entryDate, type: "INCOME", amount: 1200 },
    { id: "course-trial:t:0", entryDate, type: "INCOME", amount: 100 },
    { id: "course-trial:t:1", entryDate, type: "INCOME", amount: 200 },
    { id: "course-trial-void:t:0", entryDate, type: "EXPENSE", amount: 100 },
    { id: "course-trial-void:t:1", entryDate, type: "EXPENSE", amount: 200 },
    { id: "course-fee:f", entryDate, type: "EXPENSE", amount: 400 },
    { id: "course-fee-void:f", entryDate, type: "INCOME", amount: 400 },
    { id: "inventory:p:goods", entryDate, type: "INCOME", category: "零售-商品銷售", amount: 500 },
  ]);
  expect(await getIndustryRevenueMix("store", "2026-09-01", "2026-09-30")).toMatchObject({
    packageRevenue: 1200, otherRevenue: 300, retailRevenue: 500, refunds: 300, expense: 0, netRevenue: 1700, balance: 1700, manualIncome: 0,
  });
  expect(mocks.purchases).not.toHaveBeenCalled();
});
