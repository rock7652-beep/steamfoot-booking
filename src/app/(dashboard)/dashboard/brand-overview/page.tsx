import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import {
  BRAND_OVERVIEW_PERIODS,
  getBrandOverviewFoundation,
  resolveBrandOverviewPeriod,
  resolveBrandStoreOverviewSort,
  type BrandOverviewPeriod,
  type BrandFootprint,
  type BrandFootprintRegion,
  type BrandRegionalOverviewRegion,
  type BrandStoreOverview,
  type BrandStoreOverviewSort,
} from "@/server/queries/brand-overview";

interface PageProps {
  searchParams: Promise<{
    period?: string | string[] | undefined;
    storeSort?: string | string[] | undefined;
  }>;
}

const KPI_ITEMS = [
  { key: "stores", label: "店數", unit: "間", tone: "primary" },
  { key: "visitors", label: "總來客數", unit: "人次", tone: "blue" },
  { key: "revenue", label: "總營業額", unit: "元", tone: "amber" },
  { key: "avgRevenue", label: "平均每店月營業額", unit: "元", tone: "earth" },
] as const;

const TONE_CLASS: Record<(typeof KPI_ITEMS)[number]["tone"], string> = {
  primary: "text-primary-700",
  blue: "text-blue-700",
  amber: "text-amber-700",
  earth: "text-earth-800",
};

const STORE_SORT_OPTIONS = [
  { value: "county", label: "依地區" },
  { value: "visitors", label: "依來客數" },
  { value: "revenue", label: "依營業額" },
  { value: "name", label: "依店名" },
] as const satisfies { value: BrandStoreOverviewSort; label: string }[];

const TAIWAN_REGION_CALLOUTS: Record<string, { x: number; y: number; side: "left" | "right" }> = {
  新竹縣: { x: 42, y: 38, side: "right" },
  新竹市: { x: 39, y: 43, side: "left" },
  台中市: { x: 46, y: 55, side: "right" },
  臺中市: { x: 46, y: 55, side: "right" },
};

export default async function BrandOverviewPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/hq/login");
  if (user.role !== "ADMIN") notFound();
  if (!(await checkPermission(user.role, user.staffId, "report.read"))) notFound();

  const params = await searchParams;
  const period = resolveBrandOverviewPeriod(params.period);
  const storeSort = resolveBrandStoreOverviewSort(params.storeSort);
  const overview = await getBrandOverviewFoundation(period, storeSort);

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:px-6 lg:px-8">
      <BrandFootprintHero
        activePeriod={overview.period}
        footprint={overview.footprint}
        updatedAtLabel={overview.updatedAtLabel}
      />

      <section aria-labelledby="brand-scale-heading" className="rounded-2xl border border-earth-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-earth-400">Brand Scale</p>
            <h2 id="brand-scale-heading" className="mt-1 text-base font-bold text-earth-900">
              品牌規模
            </h2>
          </div>
          <p className="text-xs text-earth-500">期間：{overview.periodLabel}</p>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {KPI_ITEMS.map((item) => {
            const value = formatBrandScaleValue(item.key, overview.scale);
            return (
              <div key={item.key} className="rounded-xl border border-earth-100 bg-earth-50/60 px-4 py-3">
                <p className="text-xs text-earth-500">{item.label}</p>
                <p className={`mt-2 text-xl font-bold ${TONE_CLASS[item.tone]}`}>
                  {value}
                  <span className="ml-1 text-xs font-normal text-earth-400">{item.unit}</span>
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <section aria-labelledby="regional-overview-heading" className="rounded-2xl border border-earth-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 id="regional-overview-heading" className="text-base font-bold text-earth-900">
                地區概況
              </h2>
              <p className="mt-1 text-xs text-earth-500">期間：{overview.periodLabel}</p>
            </div>
            <span className="rounded-full bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700">
              行政區
            </span>
          </div>
          <RegionalOverview regions={overview.regionalOverview.regions} />
        </section>

        <section aria-labelledby="store-overview-heading" className="rounded-2xl border border-earth-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 id="store-overview-heading" className="text-base font-bold text-earth-900">
                店舖概況
              </h2>
              <p className="mt-1 text-xs text-earth-500">期間：{overview.periodLabel}</p>
            </div>
            <StoreSortControls activeSort={overview.storeOverview.sort} period={overview.period} />
          </div>
          <StoreOverview overview={overview.storeOverview} />
        </section>
      </div>
    </div>
  );
}

function StoreSortControls({
  activeSort,
  period,
}: {
  activeSort: BrandStoreOverviewSort;
  period: BrandOverviewPeriod;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1" aria-label="店舖概況排序">
      {STORE_SORT_OPTIONS.map((option) => {
        const active = option.value === activeSort;
        return (
          <Link
            key={option.value}
            href={`/hq/dashboard/brand-overview?period=${period}&storeSort=${option.value}`}
            className={`rounded-full border px-2 py-1 text-xs font-medium transition-colors ${
              active
                ? "border-primary-200 bg-primary-50 text-primary-700"
                : "border-earth-200 bg-white text-earth-500 hover:bg-earth-50"
            }`}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}

function StoreOverview({ overview }: { overview: BrandStoreOverview }) {
  if (overview.stores.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-earth-200 bg-earth-50 px-4 py-8 text-center text-sm text-earth-500">
        目前還沒有可顯示的店舖概況資料。
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-earth-100">
      <div className="grid grid-cols-[1.2fr_0.85fr_0.8fr_0.95fr] bg-earth-50 px-3 py-2 text-xs font-medium text-earth-500">
        <span>店名</span>
        <span>地區</span>
        <span className="text-right">來客數</span>
        <span className="text-right">營業額</span>
      </div>
      <div className="divide-y divide-earth-100">
        {overview.stores.map((store) => (
          <div
            key={store.id}
            className="grid grid-cols-[1.2fr_0.85fr_0.8fr_0.95fr] items-center gap-2 px-3 py-2.5 text-sm"
          >
            <span className="min-w-0 font-semibold text-earth-900">{store.name}</span>
            <span className="min-w-0 text-earth-600">
              {store.county}
              {store.locationLabel ? (
                <span className="ml-1 text-xs text-earth-400">（{store.locationLabel}）</span>
              ) : null}
            </span>
            <span className="text-right text-earth-600">{store.totalVisitors.toLocaleString("zh-TW")} 人次</span>
            <span className="text-right font-medium text-earth-800">
              {store.totalRevenue.toLocaleString("zh-TW")} 元
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RegionalOverview({ regions }: { regions: BrandRegionalOverviewRegion[] }) {
  if (regions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-earth-200 bg-earth-50 px-4 py-8 text-center text-sm text-earth-500">
        目前還沒有可顯示的地區概況資料。
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-earth-100">
      <div className="grid grid-cols-[1.1fr_0.7fr_0.9fr_1fr] bg-earth-50 px-3 py-2 text-xs font-medium text-earth-500">
        <span>地區</span>
        <span className="text-right">店數</span>
        <span className="text-right">來客數</span>
        <span className="text-right">營業額</span>
      </div>
      <div className="divide-y divide-earth-100">
        {regions.map((region) => (
          <div
            key={region.county}
            className="grid grid-cols-[1.1fr_0.7fr_0.9fr_1fr] items-center gap-2 px-3 py-2.5 text-sm"
          >
            <span className="font-semibold text-earth-900">{region.county}</span>
            <span className="text-right text-earth-600">{region.storeCount.toLocaleString("zh-TW")} 間</span>
            <span className="text-right text-earth-600">{region.totalVisitors.toLocaleString("zh-TW")} 人次</span>
            <span className="text-right font-medium text-earth-800">
              {region.totalRevenue.toLocaleString("zh-TW")} 元
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatBrandScaleValue(
  key: (typeof KPI_ITEMS)[number]["key"],
  scale: {
    storeCount: number;
    totalVisitors: number;
    totalRevenue: number;
    averageMonthlyRevenuePerStore: number;
  },
) {
  if (key === "stores") return scale.storeCount.toLocaleString("zh-TW");
  if (key === "visitors") return scale.totalVisitors.toLocaleString("zh-TW");
  if (key === "revenue") return scale.totalRevenue.toLocaleString("zh-TW");
  return scale.averageMonthlyRevenuePerStore.toLocaleString("zh-TW");
}

function PeriodSelector({
  activePeriod,
}: {
  activePeriod: BrandOverviewPeriod;
}) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="查詢期間">
      {BRAND_OVERVIEW_PERIODS.map((period) => {
        const active = period.value === activePeriod;
        const className = active
          ? "border-primary-200 bg-primary-50 text-primary-700"
          : "border-earth-200 bg-white/80 text-earth-600 hover:bg-white";
        return (
          <Link
            key={period.value}
            href={`/hq/dashboard/brand-overview?period=${period.value}`}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:py-2 sm:text-sm ${className}`}
          >
            {period.label}
          </Link>
        );
      })}
    </div>
  );
}

function BrandFootprintHero({
  activePeriod,
  footprint,
  updatedAtLabel,
}: {
  activePeriod: BrandOverviewPeriod;
  footprint: BrandFootprint;
  updatedAtLabel: string;
}) {
  const featuredRegions = footprint.regions.slice(0, 3);
  const regionCount = footprint.regions.length;

  return (
    <section
      className="overflow-hidden rounded-3xl border border-[#eadfce] bg-gradient-to-br from-white via-[#fbf7ef] to-[#f3eadc] shadow-sm"
      aria-labelledby="brand-footprint-heading"
    >
      <div className="grid gap-5 px-5 py-5 sm:grid-cols-[0.35fr_0.65fr] sm:gap-8 sm:px-8 sm:py-7 lg:min-h-[400px] lg:items-center lg:px-10 lg:py-10 xl:px-12">
        <div>
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-primary-700">品牌總覽</p>
            <h2 id="brand-footprint-heading" className="mt-3 max-w-2xl text-2xl font-bold leading-tight text-earth-950 sm:mt-4 sm:text-4xl xl:text-5xl">
              從竹北出發，
              <br />
              向更多城市展開。
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-earth-700 sm:mt-5 sm:text-base sm:leading-7">
              品牌版圖讓加盟主一眼看見蒸足目前已經發展到哪些地區。
            </p>
          </div>

          <div className="mt-5 grid max-w-md grid-cols-2 gap-2 sm:mt-7 sm:gap-3">
            <div className="rounded-xl border border-[#eadfce] bg-white/85 px-3 py-2 sm:px-4 sm:py-3">
              <p className="text-xs text-earth-500">台灣</p>
              <p className="mt-1 text-xl font-bold text-earth-950 sm:text-2xl">{footprint.taiwanStoreCount} 家店</p>
            </div>
            <div className="rounded-xl border border-[#eadfce] bg-white/85 px-3 py-2 sm:px-4 sm:py-3">
              <p className="text-xs text-earth-500">行政區</p>
              <p className="mt-1 text-xl font-bold text-earth-950 sm:text-2xl">{regionCount} 個</p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:mt-5 xl:flex-row xl:items-center xl:justify-between">
            <PeriodSelector activePeriod={activePeriod} />
            <p className="text-xs text-earth-500">資料更新於 {updatedAtLabel}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[#eadfce] bg-white/70 p-3 sm:rounded-3xl sm:p-5">
          <TaiwanFootprintVisual regions={featuredRegions} />

          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[#eadfce] pt-2 sm:mt-3 sm:gap-2 sm:pt-3">
            {footprint.overseas.map((item) => (
              <div key={item.label} className="rounded-lg border border-earth-100 bg-white/80 px-2.5 py-1.5 sm:px-3 sm:py-2">
                <p className="whitespace-nowrap text-xs font-medium text-earth-700">{item.label}</p>
                <p className="mt-1 whitespace-nowrap text-[11px] text-earth-400">Coming Soon</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function TaiwanFootprintVisual({ regions }: { regions: Pick<BrandFootprintRegion, "county" | "storeCount">[] }) {
  const displayRegions = regions.length > 0 ? regions : [{ county: "準備中", storeCount: 0 }];

  return (
    <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center xl:grid-cols-[minmax(0,1fr)_240px]">
      <div className="relative min-h-[220px] overflow-hidden rounded-2xl border border-[#dfd3bf] bg-[#edf3e7] px-3 py-3 sm:min-h-[300px] sm:px-5 sm:py-5 lg:min-h-[360px]">
        <Image
          src="/brand/taiwan-brand-footprint.svg"
          alt="台灣品牌版圖"
          width={1920}
          height={1080}
          priority
          unoptimized
          className="relative z-0 h-full min-h-[194px] w-full object-contain sm:min-h-[260px] lg:min-h-[320px]"
        />
        {displayRegions.map((region, index) => (
          <TaiwanRegionOverlay key={region.county} index={index} region={region} />
        ))}
        <div className="absolute left-3 top-3 rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-primary-700 sm:left-5 sm:top-5">
          台灣
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-earth-500">Taiwan</p>
        <h3 className="mt-1 text-sm font-bold text-earth-950 sm:text-lg">台灣品牌版圖</h3>
        <p className="mt-1 text-xs leading-5 text-earth-500 sm:text-sm">已展開行政區</p>

        <div className="mt-3 grid gap-2">
          {displayRegions.map((region, index) => (
            <BrandRegionCallout key={region.county} index={index} region={region} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TaiwanRegionOverlay({
  region,
  index,
}: {
  region: Pick<BrandFootprintRegion, "county" | "storeCount">;
  index: number;
}) {
  const fallbackX = 42 + index * 4;
  const fallbackY = 40 + index * 8;
  const callout = TAIWAN_REGION_CALLOUTS[region.county] ?? {
    x: fallbackX,
    y: fallbackY,
    side: "right" as const,
  };
  const translateClass = callout.side === "left" ? "-translate-x-full -translate-y-1/2" : "-translate-y-1/2";

  return (
    <div
      className={`absolute z-10 flex items-center gap-1.5 rounded-full border border-primary-100 bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-earth-900 shadow-sm sm:px-3 sm:py-1.5 sm:text-xs ${translateClass}`}
      style={{ left: `${callout.x}%`, top: `${callout.y}%` }}
    >
      <span className="h-2 w-2 rounded-full bg-primary-600 shadow-[0_0_0_3px_rgba(47,95,70,0.16)]" />
      <span className="whitespace-nowrap">{region.county}</span>
      <span className="whitespace-nowrap text-primary-700">{region.storeCount} 家</span>
    </div>
  );
}

function BrandRegionCallout({
  region,
  index,
}: {
  region: Pick<BrandFootprintRegion, "county" | "storeCount">;
  index: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-[#eadfce] bg-white px-2.5 py-2 shadow-sm sm:px-3 sm:py-2.5">
      <span className="flex items-center gap-2 sm:gap-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-50 text-[11px] font-semibold text-primary-700 sm:h-7 sm:w-7 sm:text-xs">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="whitespace-nowrap text-xs font-bold text-earth-950 sm:text-sm">{region.county}</span>
      </span>
      <span className="whitespace-nowrap text-xs font-semibold text-primary-700">{region.storeCount} 家</span>
    </div>
  );
}
