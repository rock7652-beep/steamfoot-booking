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

import {
  getNativeHealthSummary,
  getNativeHealthSummaryForMemberships,
} from "@/lib/native-health-service";

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

  it("keeps the original measurement store on the latest record and trend", async () => {
    h.findMany.mockResolvedValue([
      {
        measuredAt: new Date("2026-08-25T00:00:00.000Z"),
        createdAt: new Date("2026-08-25T01:00:00.000Z"),
        weight: 72,
        bmi: 24.3,
        bodyFat: 23,
        muscleMass: 60,
        boneMass: 2.9,
        visceralFat: 8,
        bmr: 1750,
        bodyWater: 55,
        metabolicAge: 40,
        note: null,
        store: { name: "暖暖蒸足", slug: "zhubei" },
      },
    ]);
    h.count.mockResolvedValue(1);
    h.findFirst.mockResolvedValue({
      measuredAt: new Date("2026-08-25T00:00:00.000Z"),
    });

    const summary = await getNativeHealthSummaryForMemberships([
      {
        storeId: "store-a",
        customerId: "customer-a",
        storeName: "暖暖蒸足",
        storeSlug: "zhubei",
      },
    ]);

    expect(summary.latest).toMatchObject({
      storeName: "暖暖蒸足",
      storeSlug: "zhubei",
    });
    expect(summary.trend[0]).toMatchObject({
      storeName: "暖暖蒸足",
      storeSlug: "zhubei",
    });
  });

  it("also returns the original store on a single-store summary without another query", async () => {
    h.findMany.mockResolvedValue([
      {
        measuredAt: new Date("2026-08-25T00:00:00.000Z"),
        createdAt: new Date("2026-08-25T01:00:00.000Z"),
        weight: 72,
        bmi: 24.3,
        bodyFat: 23,
        muscleMass: 60,
        boneMass: 2.9,
        visceralFat: 8,
        bmr: 1750,
        bodyWater: 55,
        metabolicAge: 40,
        note: null,
        store: { name: "暖暖蒸足", slug: "zhubei" },
      },
    ]);
    h.count.mockResolvedValue(1);
    h.findFirst.mockResolvedValue({
      measuredAt: new Date("2026-08-25T00:00:00.000Z"),
    });

    const summary = await getNativeHealthSummary("customer-a", "store-a");

    expect(h.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerId: "customer-a", storeId: "store-a" },
        include: { store: { select: { name: true, slug: true } } },
      }),
    );
    expect(summary.latest?.storeName).toBe("暖暖蒸足");
    expect(summary.trend[0]?.storeName).toBe("暖暖蒸足");
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
