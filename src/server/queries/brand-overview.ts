import { prisma } from "@/lib/db";
import { formatTWDateTime } from "@/lib/date-utils";

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
  storeCount: number;
  activeStoreCount: number;
  footprint: BrandFootprint;
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

const TAIWAN_COUNTY_ORDER = [
  "台北市",
  "新北市",
  "基隆市",
  "桃園市",
  "新竹縣",
  "新竹市",
  "苗栗縣",
  "台中市",
  "彰化縣",
  "南投縣",
  "雲林縣",
  "嘉義縣",
  "嘉義市",
  "台南市",
  "高雄市",
  "屏東縣",
  "宜蘭縣",
  "花蓮縣",
  "台東縣",
  "澎湖縣",
  "金門縣",
  "連江縣",
] as const;

const COUNTY_ALIASES: Record<string, string> = {
  臺北市: "台北市",
  臺中市: "台中市",
  臺南市: "台南市",
  臺東縣: "台東縣",
};

const DISTRICT_TO_COUNTY: Record<string, string> = {
  竹北: "新竹縣",
  zhubei: "新竹縣",
  新竹: "新竹市",
  台中: "台中市",
  臺中: "台中市",
  台南: "台南市",
  臺南: "台南市",
  台北: "台北市",
  臺北: "台北市",
  新北: "新北市",
  桃園: "桃園市",
  高雄: "高雄市",
};

export function resolveBrandOverviewPeriod(value: string | string[] | undefined): BrandOverviewPeriod {
  const raw = Array.isArray(value) ? value[0] : value;
  return BRAND_OVERVIEW_PERIODS.some((period) => period.value === raw)
    ? (raw as BrandOverviewPeriod)
    : "month";
}

export function resolveTaiwanCounty(input: string | null | undefined): string | null {
  if (!input) return null;
  const normalized = Object.entries(COUNTY_ALIASES).reduce(
    (value, [from, to]) => value.replaceAll(from, to),
    input,
  );

  const directCounty = TAIWAN_COUNTY_ORDER.find((county) => normalized.includes(county));
  if (directCounty) return directCounty;

  const districtMatch = Object.entries(DISTRICT_TO_COUNTY).find(([keyword]) =>
    normalized.includes(keyword),
  );
  return districtMatch?.[1] ?? null;
}

function resolveStoreLocationLabel(address: string | null | undefined): string | null {
  if (!address) return null;
  const withoutPostalCode = Object.entries(COUNTY_ALIASES).reduce(
    (value, [from, to]) => value.replaceAll(from, to),
    address.replace(/^\d{3,5}/, ""),
  );
  const county = resolveTaiwanCounty(withoutPostalCode);
  const addressAfterCounty = county
    ? withoutPostalCode.slice(withoutPostalCode.indexOf(county) + county.length)
    : withoutPostalCode;
  const match = addressAfterCounty.match(/^(.+?[鄉鎮市區])/);
  return match?.[1] ?? null;
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
    const county = resolveTaiwanCounty(source) ?? "未分類";
    const locationLabel = resolveStoreLocationLabel(store.shopConfig?.address) ?? resolveTaiwanCounty(source);
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
    TAIWAN_COUNTY_ORDER.map((county, index) => [county, index]),
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

export async function getBrandOverviewFoundation(
  period: BrandOverviewPeriod,
): Promise<BrandOverviewFoundation> {
  const [storeCount, activeStoreCount, footprintStores] = await Promise.all([
    prisma.store.count({ where: { isDemo: false } }),
    prisma.store.count({ where: { isDemo: false, operatingStatus: "ACTIVE" } }),
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
  ]);
  const periodLabel = BRAND_OVERVIEW_PERIODS.find((item) => item.value === period)?.label ?? "本月";

  return {
    period,
    periodLabel,
    updatedAtLabel: formatTWDateTime().replaceAll("-", "/"),
    storeCount,
    activeStoreCount,
    footprint: buildBrandFootprint(footprintStores),
  };
}
