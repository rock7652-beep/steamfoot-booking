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
      { entryDate: new Date("2026-09-01T00:00:00Z"), amount: 500, category: "零售-精油", customerId: "c1", staffId: "s1" },
      { entryDate: new Date("2026-09-01T00:00:00Z"), amount: 300, category: "零售-精油", customerId: "c1", staffId: "s1" },
      { entryDate: new Date("2026-09-02T00:00:00Z"), amount: 200, category: "零售-茶包", customerId: null, staffId: "s2" },
    ]);

    const result = await getRetailAnalytics("store-a", "2026-09-01", "2026-09-30", (staffId) => staffId === "s1");

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "store-a", type: "INCOME", category: { startsWith: "零售-" } }) }));
    expect(result).toEqual({
      revenue: 800,
      transactionCount: 2,
      customerCount: 1,
      items: [{ name: "精油", revenue: 800, transactionCount: 2, customerCount: 1 }],
      daily: [{ date: "2026-09-01", revenue: 800 }],
    });
  });
});
