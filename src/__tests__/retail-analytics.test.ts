import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: { cashbookEntry: { findMany } } }));

import { getRetailAnalytics } from "@/server/queries/retail-analytics";

describe("retail analytics", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://test");
    findMany.mockReset();
  });

  it("summarizes retail items, buyers and daily revenue within one store", async () => {
    findMany.mockResolvedValue([
      { id: "entry", entryDate: new Date("2026-09-01T00:00:00Z"), amount: 500, category: "零售-精油", customerId: "c1", staffId: "s1" },
      { id: "entry", entryDate: new Date("2026-09-01T00:00:00Z"), amount: 300, category: "零售-精油", customerId: "c1", staffId: "s1" },
      { id: "entry", entryDate: new Date("2026-09-02T00:00:00Z"), amount: 200, category: "零售-茶包", customerId: null, staffId: "s2" },
    ]);

    const result = await getRetailAnalytics("store-a", "2026-09-01", "2026-09-30", (staffId) => staffId === "s1");

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "store-a", type: "INCOME" }) }));
    expect(result).toMatchObject({
      revenue: 800,
      transactionCount: 2,
      customerCount: 1,
      items: [{ name: "精油", revenue: 800, transactionCount: 2, customerCount: 1 }],
      daily: [{ date: "2026-09-01", revenue: 800 }],
    });
  });
});

it("keeps 三寶 other income visible without inflating retail revenue", async () => {
  findMany.mockResolvedValue([
    { id:"other", entryDate:new Date("2026-09-23T00:00:00Z"),amount:100,category:"其他收入",note:"三寶",paymentMethod:"CASH",customerId:"c1",customer:{name:"顧客"},staffId:"s1" },
    { id:"course-purchase:order", entryDate:new Date("2026-09-23T00:00:00Z"),amount:2300,category:"課程方案",note:"方案",paymentMethod:"OTHER",customerId:"c1",customer:{name:"顧客"},staffId:"s1" },
    { id:"retail", entryDate:new Date("2026-09-23T00:00:00Z"),amount:200,category:"零售-瑜珈墊",note:null,paymentMethod:"OTHER",customerId:null,customer:null,staffId:"s1" },
  ]);
  const r=await getRetailAnalytics("store-a","2026-09-01","2026-09-30");
  expect(r).toMatchObject({revenue:200,transactionCount:1,otherIncome:{revenue:100,transactionCount:1}});
  expect(r.transactions).toHaveLength(2);
  expect(r.transactions).toContainEqual(expect.objectContaining({id:"other",kind:"其他收入",name:"三寶",amount:100,customerName:"顧客"}));
});
