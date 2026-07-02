import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    store: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe("brand overview foundation", () => {
  it("defaults to this month when period is missing or invalid", async () => {
    const { resolveBrandOverviewPeriod } = await import("@/server/queries/brand-overview");

    expect(resolveBrandOverviewPeriod(undefined)).toBe("month");
    expect(resolveBrandOverviewPeriod("unknown")).toBe("month");
  });

  it("accepts supported period values and normalizes arrays", async () => {
    const { resolveBrandOverviewPeriod } = await import("@/server/queries/brand-overview");

    expect(resolveBrandOverviewPeriod("last30")).toBe("last30");
    expect(resolveBrandOverviewPeriod("year")).toBe("year");
    expect(resolveBrandOverviewPeriod("custom")).toBe("custom");
    expect(resolveBrandOverviewPeriod(["year", "month"])).toBe("year");
  });

  it("resolves Taiwan counties from address and common store labels", async () => {
    const { resolveTaiwanCounty } = await import("@/server/queries/brand-overview");

    expect(resolveTaiwanCounty("302新竹縣竹北市中崙里科大一路80號")).toBe("新竹縣");
    expect(resolveTaiwanCounty("台中測試店")).toBe("台中市");
    expect(resolveTaiwanCounty("暖暖蒸足 zhubei")).toBe("新竹縣");
    expect(resolveTaiwanCounty("海外測試店")).toBeNull();
  });

  it("builds brand footprint as region to store without analytics aggregates", async () => {
    const { buildBrandFootprint } = await import("@/server/queries/brand-overview");

    const footprint = buildBrandFootprint([
      {
        id: "store-1",
        name: "暖暖蒸足",
        slug: "zhubei",
        operatingStatus: "ACTIVE",
        shopConfig: { address: "302新竹縣竹北市中崙里科大一路80號" },
      },
      {
        id: "store-2",
        name: "以斯帖蒸足坊",
        slug: "esther",
        operatingStatus: "ACTIVE",
        shopConfig: { address: "300新竹市東區中央路1號" },
      },
      {
        id: "store-3",
        name: "御嵐軒",
        slug: "royal-zhubei",
        operatingStatus: "TRIAL",
        shopConfig: null,
      },
    ]);

    expect(footprint.taiwanStoreCount).toBe(3);
    expect(footprint.regions).toMatchObject([
      {
        county: "新竹縣",
        storeCount: 2,
        stores: expect.arrayContaining([
          expect.objectContaining({ name: "暖暖蒸足", locationLabel: "竹北市" }),
          expect.objectContaining({ name: "御嵐軒", locationLabel: "新竹縣" }),
        ]),
      },
      {
        county: "新竹市",
        storeCount: 1,
        stores: [expect.objectContaining({ name: "以斯帖蒸足坊", locationLabel: "東區" })],
      },
    ]);
    expect(footprint.overseas).toEqual([
      { label: "馬來西亞", status: "coming-soon" },
      { label: "日本", status: "coming-soon" },
      { label: "海外", status: "coming-soon" },
    ]);
    expect(JSON.stringify(footprint)).not.toMatch(/revenue|customers|bookings|reports/i);
  });
});
