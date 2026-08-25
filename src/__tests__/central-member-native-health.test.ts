import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    customerHealthRecord: {
      findMany: (...args: unknown[]) => h.findMany(...args),
      count: (...args: unknown[]) => h.count(...args),
      findFirst: (...args: unknown[]) => h.findFirst(...args),
    },
  },
}));

import { getNativeHealthSummaryForMemberships } from "@/lib/native-health-service";

describe("customer-owned cross-store native health summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.findMany.mockResolvedValue([]);
    h.count.mockResolvedValue(0);
    h.findFirst.mockResolvedValue(null);
  });

  it("queries exact store and customer pairs and deduplicates memberships", async () => {
    await getNativeHealthSummaryForMemberships([
      { storeId: "store-a", customerId: "customer-a", storeName: "A", storeSlug: "a" },
      { storeId: "store-b", customerId: "customer-b", storeName: "B", storeSlug: "b" },
      { storeId: "store-a", customerId: "customer-a", storeName: "A", storeSlug: "a" },
    ]);

    const expectedWhere = {
      OR: [
        { storeId: "store-a", customerId: "customer-a" },
        { storeId: "store-b", customerId: "customer-b" },
      ],
    };
    expect(h.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere }));
    expect(h.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(h.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expectedWhere }));
  });

  it("does not touch the database when there are no verified memberships", async () => {
    await expect(getNativeHealthSummaryForMemberships([])).resolves.toEqual({
      latest: null,
      trend: [],
      alerts: [],
      meta: { totalRecords: 0, daysSinceLastMeasure: null, firstMeasuredAt: null },
    });
    expect(h.findMany).not.toHaveBeenCalled();
    expect(h.count).not.toHaveBeenCalled();
    expect(h.findFirst).not.toHaveBeenCalled();
  });
});
