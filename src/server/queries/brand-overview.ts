import { prisma } from "@/lib/db";
import {
  dayRange,
  formatTWDateTime,
  monthRange,
  parseTaiwanDateToDbDate,
  toLocalDateStr,
  toLocalMonthStr,
} from "@/lib/date-utils";
import { REVENUE_NET_TYPES, REVENUE_VALID_STATUS } from "@/lib/booking-constants";
import {
  TAIWAN_REGION_ORDER,
  UNCLASSIFIED_TAIWAN_REGION,
  resolveTaiwanLocationLabel,
  resolveTaiwanRegion,
} from "@/lib/taiwan-region";

export const BRAND_OVERVIEW_PERIODS = [
  { value: "month", label: "本月" },
  { value: "last30", label: "近 30 天" },
  { value: "year", label: "今年" },
  { value: "custom", label: "自訂期間" },
] as const;

export type BrandOverviewPeriod = (typeof BRAND_OVERVIEW_PERIODS)[number]["value"];

export interface BrandOverviewFoundation {
  period: BrandOverviewPeriod;
  periodLabel: string;
  updatedAtLabel: string;
  scale: BrandScale;
  footprint: BrandFootprint;
  regionalOverview: BrandRegionalOverview;
  storeOverview: BrandStoreOverview;
}

export interface BrandScale {
  storeCount: number;
  totalVisitors: number;
  totalRevenue: number;
  averageMonthlyRevenuePerStore: number;
}

export interface BrandOverviewPeriodRange {
  createdAtStart: Date;
  createdAtEnd: Date;
  bookingDateStart: Date;
  bookingDateEnd: Date;
  monthDivisor: number;
}

export interface BrandFootprintStore {
  id: string;
  name: string;
  locationLabel: string | null;
  operatingStatus: string;
}

export interface BrandFootprintRegion {
  county: string;
  storeCount: number;
  stores: BrandFootprintStore[];
}

export interface BrandFootprint {
  taiwanStoreCount: number;
  regions: BrandFootprintRegion[];
  overseas: {
    label: string;
    status: "coming-soon";
  }[];
}

export interface BrandRegionalOverviewRegion {
  county: string;
  storeCount: number;
  totalVisitors: number;
  totalRevenue: number;
}

export interface BrandRegionalOverview {
  regions: BrandRegionalOverviewRegion[];
}

export type BrandStoreOverviewSort = "county" | "visitors" | "revenue" | "name";

export interface BrandStoreOverviewStore {
  id: string;
  name: string;
  county: string;
  locationLabel: string | null;
  totalVisitors: number;
  totalRevenue: number;
}

export interface BrandStoreOverview {
  sort: BrandStoreOverviewSort;
  stores: BrandStoreOverviewStore[];
}

export function resolveBrandOverviewPeriod(value: string | string[] | undefined): BrandOverviewPeriod {
  const raw = Array.isArray(value) ? value[0] : value;
  return BRAND_OVERVIEW_PERIODS.some((period) => period.value === raw)
    ? (raw as BrandOverviewPeriod)
    : "month";
}

export function resolveBrandOverviewPeriodRange(
  period: BrandOverviewPeriod,
  now = new Date(),
): BrandOverviewPeriodRange {
  const today = toLocalDateStr(now);
  const todayBounds = dayRange(today);

  if (period === "last30") {
    const startDate = toLocalDateStr(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));
    return {
      createdAtStart: dayRange(startDate).start,
      createdAtEnd: todayBounds.end,
      bookingDateStart: parseTaiwanDateToDbDate(startDate),
      bookingDateEnd: parseTaiwanDateToDbDate(today),
      monthDivisor: 1,
    };
  }

  if (period === "year") {
    const year = today.slice(0, 4);
    const startDate = `${year}-01-01`;
    return {
      createdAtStart: dayRange(startDate).start,
      createdAtEnd: todayBounds.end,
      bookingDateStart: parseTaiwanDateToDbDate(startDate),
      bookingDateEnd: parseTaiwanDateToDbDate(today),
      monthDivisor: Number(today.slice(5, 7)),
    };
  }

  // TODO(RFC-002/Brand Scale): wire custom start/end inputs. Until then, the
  // existing custom selector uses the current month to avoid an unbounded query.
  const currentMonth = toLocalMonthStr(now);
  const currentMonthRange = monthRange(currentMonth);
  const [year, month] = currentMonth.split("-").map(Number);
  return {
    createdAtStart: currentMonthRange.start,
    createdAtEnd: currentMonthRange.end,
    bookingDateStart: parseTaiwanDateToDbDate(`${currentMonth}-01`),
    bookingDateEnd: parseTaiwanDateToDbDate(
      `${currentMonth}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`,
    ),
    monthDivisor: 1,
  };
}

export function buildBrandScale(input: {
  storeCount: number;
  totalVisitors: number | null | undefined;
  totalRevenue: number | null | undefined;
  monthDivisor: number;
}): BrandScale {
  const safeStoreCount = Math.max(input.storeCount, 0);
  const safeMonthDivisor = Math.max(input.monthDivisor, 1);
  const totalRevenue = Math.round(input.totalRevenue ?? 0);

  return {
    storeCount: safeStoreCount,
    totalVisitors: input.totalVisitors ?? 0,
    totalRevenue,
    averageMonthlyRevenuePerStore:
      safeStoreCount > 0 ? Math.round(totalRevenue / safeStoreCount / safeMonthDivisor) : 0,
  };
}

export function buildBrandFootprint(
  stores: {
    id: string;
    name: string;
    slug: string;
    operatingStatus: string;
    shopConfig: { address: string | null } | null;
  }[],
): BrandFootprint {
  const grouped = new Map<string, BrandFootprintStore[]>();

  for (const store of stores) {
    const source = [store.shopConfig?.address, store.name, store.slug].filter(Boolean).join(" ");
    const county = resolveTaiwanRegion(source);
    const resolvedLocationLabel = resolveTaiwanLocationLabel(store.shopConfig?.address);
    const locationLabel =
      resolvedLocationLabel ??
      (county === UNCLASSIFIED_TAIWAN_REGION ? null : county);
    const list = grouped.get(county) ?? [];
    list.push({
      id: store.id,
      name: store.name,
      locationLabel,
      operatingStatus: store.operatingStatus,
    });
    grouped.set(county, list);
  }

  const countyRank = new Map<string, number>(
    TAIWAN_REGION_ORDER.map((county, index) => [county, index]),
  );

  const regions = Array.from(grouped.entries())
    .map(([county, stores]) => ({
      county,
      storeCount: stores.length,
      stores: stores.sort((a, b) => a.name.localeCompare(b.name, "zh-Hant")),
    }))
    .sort((a, b) => {
      const rankA = countyRank.get(a.county) ?? Number.MAX_SAFE_INTEGER;
      const rankB = countyRank.get(b.county) ?? Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) return rankA - rankB;
      return a.county.localeCompare(b.county, "zh-Hant");
    });

  return {
    taiwanStoreCount: stores.length,
    regions,
    overseas: [
      { label: "馬來西亞", status: "coming-soon" },
      { label: "日本", status: "coming-soon" },
      { label: "海外", status: "coming-soon" },
    ],
  };
}

export function buildBrandRegionalOverview(input: {
  footprint: BrandFootprint;
  visitorByStoreId: Map<string, number>;
  revenueByStoreId: Map<string, number>;
}): BrandRegionalOverview {
  return {
    regions: input.footprint.regions.map((region) => {
      const storeIds = region.stores.map((store) => store.id);
      return {
        county: region.county,
        storeCount: region.storeCount,
        totalVisitors: storeIds.reduce(
          (sum, storeId) => sum + (input.visitorByStoreId.get(storeId) ?? 0),
          0,
        ),
        totalRevenue: Math.round(
          storeIds.reduce((sum, storeId) => sum + (input.revenueByStoreId.get(storeId) ?? 0), 0),
        ),
      };
    }),
  };
}

export function resolveBrandStoreOverviewSort(
  value: string | string[] | undefined,
): BrandStoreOverviewSort {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "visitors" || raw === "revenue" || raw === "name" ? raw : "county";
}

export function buildBrandStoreOverview(input: {
  footprint: BrandFootprint;
  visitorByStoreId: Map<string, number>;
  revenueByStoreId: Map<string, number>;
  sort: BrandStoreOverviewSort;
}): BrandStoreOverview {
  const stores = input.footprint.regions.flatMap((region) =>
    region.stores.map((store) => ({
      id: store.id,
      name: store.name,
      county: region.county,
      locationLabel: store.locationLabel,
      totalVisitors: input.visitorByStoreId.get(store.id) ?? 0,
      totalRevenue: Math.round(input.revenueByStoreId.get(store.id) ?? 0),
    })),
  );

  return {
    sort: input.sort,
    stores: stores.sort((a, b) => {
      if (input.sort === "visitors" && a.totalVisitors !== b.totalVisitors) {
        return b.totalVisitors - a.totalVisitors;
      }
      if (input.sort === "revenue" && a.totalRevenue !== b.totalRevenue) {
        return b.totalRevenue - a.totalRevenue;
      }
      if (input.sort === "name") return a.name.localeCompare(b.name, "zh-Hant");
      if (a.county !== b.county) return a.county.localeCompare(b.county, "zh-Hant");
      return a.name.localeCompare(b.name, "zh-Hant");
    }),
  };
}

export async function getBrandOverviewFoundation(
  period: BrandOverviewPeriod,
  storeSort: BrandStoreOverviewSort = "county",
): Promise<BrandOverviewFoundation> {
  const range = resolveBrandOverviewPeriodRange(period);
  // TODO(Brand Overview 100+ stores): promote these bounded groupBy aggregates
  // to cache or materialized view when query volume requires it.
  const [footprintStores, visitorByStoreAggregates, revenueByStoreAggregates] = await Promise.all([
    prisma.store.findMany({
      where: { isDemo: false },
      select: {
        id: true,
        name: true,
        slug: true,
        operatingStatus: true,
        shopConfig: { select: { address: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.booking.groupBy({
      by: ["storeId"],
      where: {
        bookingStatus: "COMPLETED",
        bookingDate: { gte: range.bookingDateStart, lte: range.bookingDateEnd },
        store: { isDemo: false },
      },
      _sum: { people: true },
    }),
    prisma.transaction.groupBy({
      by: ["storeId"],
      where: {
        transactionType: { in: REVENUE_NET_TYPES as never },
        status: REVENUE_VALID_STATUS,
        createdAt: { gte: range.createdAtStart, lte: range.createdAtEnd },
        store: { isDemo: false },
      },
      _sum: { amount: true },
    }),
  ]);
  const periodLabel = BRAND_OVERVIEW_PERIODS.find((item) => item.value === period)?.label ?? "本月";
  const storeCount = footprintStores.length;
  const footprint = buildBrandFootprint(footprintStores);
  const visitorByStoreId = new Map(
    visitorByStoreAggregates.map((item) => [item.storeId, item._sum.people ?? 0]),
  );
  const revenueByStoreId = new Map(
    revenueByStoreAggregates.map((item) => [item.storeId, Number(item._sum.amount ?? 0)]),
  );
  const totalVisitors = Array.from(visitorByStoreId.values()).reduce((sum, value) => sum + value, 0);
  const totalRevenue = Array.from(revenueByStoreId.values()).reduce((sum, value) => sum + value, 0);
  const scale = buildBrandScale({
    storeCount,
    totalVisitors,
    totalRevenue,
    monthDivisor: range.monthDivisor,
  });

  return {
    period,
    periodLabel,
    updatedAtLabel: formatTWDateTime().replaceAll("-", "/"),
    scale,
    footprint,
    regionalOverview: buildBrandRegionalOverview({
      footprint,
      visitorByStoreId,
      revenueByStoreId,
    }),
    storeOverview: buildBrandStoreOverview({
      footprint,
      visitorByStoreId,
      revenueByStoreId,
      sort: storeSort,
    }),
  };
}
