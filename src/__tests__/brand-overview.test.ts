import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: {
      aggregate: vi.fn(),
    },
    store: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    transaction: {
      aggregate: vi.fn(),
    },
  },
}));

describe("brand overview foundation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("resolves bounded period ranges for Brand Scale aggregates", async () => {
    const { resolveBrandOverviewPeriodRange } = await import("@/server/queries/brand-overview");
    const now = new Date("2026-07-02T02:00:00.000Z");

    const month = resolveBrandOverviewPeriodRange("month", now);
    const last30 = resolveBrandOverviewPeriodRange("last30", now);
    const year = resolveBrandOverviewPeriodRange("year", now);
    const custom = resolveBrandOverviewPeriodRange("custom", now);

    expect(month.createdAtStart.toISOString()).toBe("2026-06-30T16:00:00.000Z");
    expect(month.createdAtEnd.toISOString()).toBe("2026-07-31T15:59:59.999Z");
    expect(month.bookingDateStart.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(month.bookingDateEnd.toISOString()).toBe("2026-07-31T00:00:00.000Z");
    expect(month.monthDivisor).toBe(1);

    expect(last30.createdAtStart.toISOString()).toBe("2026-06-02T16:00:00.000Z");
    expect(last30.createdAtEnd.toISOString()).toBe("2026-07-02T15:59:59.999Z");
    expect(last30.bookingDateStart.toISOString()).toBe("2026-06-03T00:00:00.000Z");
    expect(last30.bookingDateEnd.toISOString()).toBe("2026-07-02T00:00:00.000Z");
    expect(last30.monthDivisor).toBe(1);

    expect(year.createdAtStart.toISOString()).toBe("2025-12-31T16:00:00.000Z");
    expect(year.createdAtEnd.toISOString()).toBe("2026-07-02T15:59:59.999Z");
    expect(year.bookingDateStart.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(year.bookingDateEnd.toISOString()).toBe("2026-07-02T00:00:00.000Z");
    expect(year.monthDivisor).toBe(7);

    expect(custom.createdAtStart.toISOString()).toBe(month.createdAtStart.toISOString());
    expect(custom.bookingDateEnd.toISOString()).toBe(month.bookingDateEnd.toISOString());
  });

  it("builds Brand Scale without ranking or regional breakdowns", async () => {
    const { buildBrandScale } = await import("@/server/queries/brand-overview");

    const scale = buildBrandScale({
      storeCount: 3,
      totalVisitors: 120,
      totalRevenue: 90000,
      monthDivisor: 3,
    });

    expect(scale).toMatchObject({
      storeCount: 3,
      totalVisitors: 120,
      totalRevenue: 90000,
      averageMonthlyRevenuePerStore: 10000,
    });
    expect(JSON.stringify(scale)).not.toMatch(/ranking|region|storeDetail|export/i);
  });

  it("loads Brand Scale with minimal bounded aggregate queries", async () => {
    const { prisma } = await import("@/lib/db");
    const { getBrandOverviewFoundation } = await import("@/server/queries/brand-overview");
    const storeCount = vi.mocked(prisma.store.count);
    const storeFindMany = vi.mocked(prisma.store.findMany);
    const bookingAggregate = vi.mocked(prisma.booking.aggregate);
    const transactionAggregate = vi.mocked(prisma.transaction.aggregate);

    storeFindMany.mockResolvedValue([
      {
        id: "store-1",
        name: "暖暖蒸足",
        slug: "zhubei",
        operatingStatus: "ACTIVE",
        shopConfig: { address: "302新竹縣竹北市中崙里科大一路80號" },
      },
      {
        id: "store-2",
        name: "蒸足台中店",
        slug: "taichung",
        operatingStatus: "ACTIVE",
        shopConfig: { address: "台中市西屯區台灣大道三段1號" },
      },
    ] as never);
    bookingAggregate.mockResolvedValue({ _sum: { people: 30 } } as never);
    transactionAggregate.mockResolvedValue({ _sum: { amount: 60000 } } as never);

    const overview = await getBrandOverviewFoundation("month");

    expect(storeCount).not.toHaveBeenCalled();
    expect(storeFindMany).toHaveBeenCalledWith({
      where: { isDemo: false },
      select: {
        id: true,
        name: true,
        slug: true,
        operatingStatus: true,
        shopConfig: { select: { address: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    expect(bookingAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          bookingStatus: "COMPLETED",
          store: { isDemo: false },
        }),
        _sum: { people: true },
      }),
    );
    expect(transactionAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "SUCCESS",
          store: { isDemo: false },
        }),
        _sum: { amount: true },
      }),
    );
    expect(overview.scale).toMatchObject({
      storeCount: 2,
      totalVisitors: 30,
      totalRevenue: 60000,
      averageMonthlyRevenuePerStore: 30000,
    });
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
