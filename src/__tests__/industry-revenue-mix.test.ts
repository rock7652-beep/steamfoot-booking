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
it("reduces collected work-order revenue by refund month without treating refunds as operating expenses",async()=>{
  mocks.industry.mockResolvedValue("music");
  mocks.cashbook.mockResolvedValue([
    {id:"inventory:p:goods",entryDate:new Date("2026-09-30T00:00:00Z"),type:"INCOME",category:"工單收入",amount:500},
    {id:"inventory:r:refund",entryDate:new Date("2026-10-01T00:00:00Z"),type:"EXPENSE",category:"工單退款",amount:400},
  ]);
  expect(await getIndustryRevenueMix("store","2026-09-01","2026-09-30")).toMatchObject({netRevenue:500,refunds:0});
  expect(await getIndustryRevenueMix("store","2026-10-01","2026-10-31")).toMatchObject({netRevenue:-400,refunds:400,expense:0,manualIncome:0});
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [mocks.cashbook, mocks.receipts, mocks.sales, mocks.spaRefunds, mocks.voids,
    mocks.purchases, mocks.courseRefunds, mocks.trials]) fn.mockResolvedValue([]);
});

it("does not read either financial ledger when store module resolution denies a retired store", async () => {
  mocks.industry.mockRejectedValueOnce(new Error("SPA 模組已移除"));
  await expect(getIndustryRevenueMix("spa-store","2026-09-01","2026-09-30")).rejects.toThrow("SPA 模組已移除");
  for(const query of [mocks.legacy,mocks.cashbook,mocks.receipts,mocks.sales,mocks.spaRefunds,mocks.voids]) expect(query).not.toHaveBeenCalled();
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

it("keeps sales refunds and receipt corrections out of operating expense",async()=>{
  mocks.industry.mockResolvedValue("music");
  mocks.cashbook.mockResolvedValue([
    {id:"inventory:p:goods",entryDate:new Date("2026-10-01"),type:"INCOME",category:"零售-商品銷售",amount:500},
    {id:"inventory:c:correction:goods",entryDate:new Date("2026-10-02"),type:"EXPENSE",category:"零售-商品銷售",amount:500},
    {id:"inventory:new:goods",entryDate:new Date("2026-10-02"),type:"INCOME",category:"零售-商品銷售",amount:500},
    {id:"inventory:r:refund",entryDate:new Date("2026-10-03"),type:"EXPENSE",category:"銷貨退款",amount:200},
  ]);
  expect(await getIndustryRevenueMix("store","2026-10-01","2026-10-31")).toMatchObject({retailRevenue:500,refunds:200,expense:0,netRevenue:300,manualIncome:0});
});
