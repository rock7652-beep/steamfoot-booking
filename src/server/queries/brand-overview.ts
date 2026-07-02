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
}

export function resolveBrandOverviewPeriod(value: string | string[] | undefined): BrandOverviewPeriod {
  const raw = Array.isArray(value) ? value[0] : value;
  return BRAND_OVERVIEW_PERIODS.some((period) => period.value === raw)
    ? (raw as BrandOverviewPeriod)
    : "month";
}

export async function getBrandOverviewFoundation(
  period: BrandOverviewPeriod,
): Promise<BrandOverviewFoundation> {
  const [storeCount, activeStoreCount] = await Promise.all([
    prisma.store.count({ where: { isDemo: false } }),
    prisma.store.count({ where: { isDemo: false, operatingStatus: "ACTIVE" } }),
  ]);
  const periodLabel = BRAND_OVERVIEW_PERIODS.find((item) => item.value === period)?.label ?? "本月";

  return {
    period,
    periodLabel,
    updatedAtLabel: formatTWDateTime().replaceAll("-", "/"),
    storeCount,
    activeStoreCount,
  };
}
