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
  primary: "bg-primary-50 text-primary-700 border-primary-100",
  blue: "bg-blue-50 text-blue-700 border-blue-100",
  amber: "bg-amber-50 text-amber-700 border-amber-100",
  earth: "bg-earth-50 text-earth-800 border-earth-100",
};

const STORE_SORT_OPTIONS = [
  { value: "county", label: "依地區" },
  { value: "visitors", label: "依來客數" },
  { value: "revenue", label: "依營業額" },
  { value: "name", label: "依店名" },
] as const satisfies { value: BrandStoreOverviewSort; label: string }[];

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
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-primary-700">Brand Operating System</p>
          <h1 className="mt-2 text-2xl font-bold text-earth-900 sm:text-3xl">品牌總覽</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-earth-600">
            品牌版圖與經營概況，作為 HQ 對外介紹蒸足的第一頁。
          </p>
        </div>
        <div className="rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm text-earth-600">
          資料更新於：<span className="font-mono text-earth-800">{overview.updatedAtLabel}</span>
        </div>
      </header>

      <BrandFootprintHero footprint={overview.footprint} periodLabel={overview.periodLabel} />

      <PeriodSelector activePeriod={overview.period} />

      <section aria-labelledby="brand-scale-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="brand-scale-heading" className="text-base font-bold text-earth-900">
            品牌規模
          </h2>
          <p className="text-xs text-earth-500">期間：{overview.periodLabel}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {KPI_ITEMS.map((item) => {
            const value = formatBrandScaleValue(item.key, overview.scale);
            return (
              <div key={item.key} className={`rounded-xl border p-4 ${TONE_CLASS[item.tone]}`}>
                <p className="text-xs opacity-75">{item.label}</p>
                <p className="mt-3 text-2xl font-bold">
                  {value}
                  <span className="ml-1 text-xs font-normal opacity-60">{item.unit}</span>
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-labelledby="regional-overview-heading" className="rounded-xl border border-earth-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
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

        <section aria-labelledby="store-overview-heading" className="rounded-xl border border-earth-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
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
      <div className="rounded-xl border border-dashed border-earth-200 bg-earth-50 px-4 py-10 text-center text-sm text-earth-500">
        目前還沒有可顯示的店舖概況資料。
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-earth-100">
      <div className="grid grid-cols-[1.2fr_0.85fr_0.9fr_1fr] bg-earth-50 px-3 py-2 text-xs font-medium text-earth-500">
        <span>店名</span>
        <span>地區</span>
        <span className="text-right">來客數</span>
        <span className="text-right">營業額</span>
      </div>
      <div className="divide-y divide-earth-100">
        {overview.stores.map((store) => (
          <div
            key={store.id}
            className="grid grid-cols-[1.2fr_0.85fr_0.9fr_1fr] items-center gap-2 px-3 py-3 text-sm"
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
      <div className="rounded-xl border border-dashed border-earth-200 bg-earth-50 px-4 py-10 text-center text-sm text-earth-500">
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
            className="grid grid-cols-[1.1fr_0.7fr_0.9fr_1fr] items-center gap-2 px-3 py-3 text-sm"
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

function PeriodSelector({ activePeriod }: { activePeriod: BrandOverviewPeriod }) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="查詢期間">
      {BRAND_OVERVIEW_PERIODS.map((period) => {
        const active = period.value === activePeriod;
        return (
          <Link
            key={period.value}
            href={`/hq/dashboard/brand-overview?period=${period.value}`}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-primary-200 bg-primary-50 text-primary-700"
                : "border-earth-200 bg-white text-earth-600 hover:bg-earth-50"
            }`}
          >
            {period.label}
          </Link>
        );
      })}
    </div>
  );
}

function BrandFootprintHero({
  footprint,
  periodLabel,
}: {
  footprint: BrandFootprint;
  periodLabel: string;
}) {
  const featuredRegions = footprint.regions.slice(0, 3);
  const regionCount = footprint.regions.length;

  return (
    <section
      className="overflow-hidden rounded-2xl border border-earth-200 bg-earth-900 text-white shadow-sm"
      aria-labelledby="brand-footprint-heading"
    >
      <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="flex min-h-[430px] flex-col justify-between px-6 py-8 sm:px-8 lg:px-10 lg:py-12">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary-100">品牌版圖</p>
            <h2 id="brand-footprint-heading" className="mt-5 max-w-2xl text-4xl font-bold leading-tight sm:text-5xl">
              從竹北出發，向更多城市展開。
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-earth-100">
              品牌版圖讓加盟主一眼看見蒸足目前已經發展到哪些地區。
            </p>
          </div>

          <div className="mt-10 grid max-w-xl grid-cols-2 gap-3">
            <div className="border-l border-primary-300/70 pl-4">
              <p className="text-sm text-earth-200">台灣</p>
              <p className="mt-2 text-3xl font-bold">{footprint.taiwanStoreCount} 家店</p>
            </div>
            <div className="border-l border-primary-300/70 pl-4">
              <p className="text-sm text-earth-200">行政區</p>
              <p className="mt-2 text-3xl font-bold">{regionCount} 個</p>
            </div>
          </div>
        </div>

        <div className="bg-white px-5 py-6 text-earth-900 sm:px-7 lg:px-8 lg:py-8">
          <div className="flex h-full min-h-[430px] flex-col justify-center">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-semibold text-earth-900">目前已展開的行政區</p>
              <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">
                Taiwan
              </span>
            </div>

            <div className="mt-6 grid gap-4">
              {(featuredRegions.length > 0 ? featuredRegions : [{ county: "準備中", storeCount: 0, stores: [] }]).map(
                (region, index) => (
                  <BrandRegionCard key={region.county} region={region} index={index} />
                ),
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 bg-white p-5 text-earth-900 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[1fr_0.72fr]">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-earth-900">行政區品牌版圖</p>
                <p className="mt-1 text-xs text-earth-500">期間：{periodLabel}</p>
              </div>
              <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700">
                展開看店舖
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {footprint.regions.length > 0 ? (
                footprint.regions.map((region) => (
                  <FootprintRegionAccordion key={region.county} region={region} />
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-earth-200 bg-earth-50 px-4 py-6 text-center text-sm text-earth-500">
                  目前還沒有可顯示的品牌版圖資料。
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-earth-200 bg-earth-50 p-4">
            <p className="text-xs font-semibold uppercase text-earth-500">Overseas</p>
            <div className="mt-3 grid gap-2">
              {footprint.overseas.map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
                  <span className="font-medium text-earth-700">{item.label}</span>
                  <span className="text-xs text-earth-400">Coming Soon</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BrandRegionCard({
  region,
  index,
}: {
  region: Pick<BrandFootprintRegion, "county" | "storeCount">;
  index: number;
}) {
  const tones = [
    "bg-primary-700 text-white",
    "bg-earth-900 text-white",
    "bg-[#d8b06a] text-earth-950",
  ];

  return (
    <div className={`rounded-lg p-5 shadow-sm ${tones[index % tones.length]}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm opacity-75">已展開</p>
          <p className="mt-3 text-4xl font-bold leading-none">{region.county}</p>
        </div>
        <p className="text-right text-sm font-semibold opacity-80">{String(index + 1).padStart(2, "0")}</p>
      </div>
      <div className="mt-8 flex items-end justify-between gap-4">
        <div className="flex gap-1.5" aria-hidden="true">
          {Array.from({ length: Math.max(region.storeCount, 1) }).map((_, dotIndex) => (
            <span key={dotIndex} className="h-2.5 w-2.5 rounded-full bg-current opacity-70" />
          ))}
        </div>
        <p className="text-lg font-bold">{region.storeCount} 家店</p>
      </div>
    </div>
  );
}

function FootprintRegionAccordion({ region }: { region: BrandFootprintRegion }) {
  return (
    <details className="group rounded-xl border border-earth-200 bg-white" open={region.storeCount <= 8}>
      <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-3 rounded-xl px-4 py-3 select-none hover:bg-earth-50 group-open:rounded-b-none">
        <span>
          <span className="font-semibold text-earth-900">{region.county}</span>
          <span className="ml-2 text-sm text-earth-500">{region.storeCount} 家</span>
        </span>
        <span className="text-xs font-medium text-primary-700 group-open:hidden">展開</span>
        <span className="hidden text-xs font-medium text-earth-500 group-open:inline">收合</span>
      </summary>
      <div className="border-t border-earth-100 px-4 py-3">
        <div className="space-y-2">
          {region.stores.map((store) => (
            <div key={store.id} className="flex items-center justify-between gap-3 rounded-lg bg-earth-50 px-3 py-2">
              <span className="text-sm font-medium text-earth-800">
                {store.name}
                {store.locationLabel ? (
                  <span className="ml-1 text-xs font-normal text-earth-500">（{store.locationLabel}）</span>
                ) : null}
              </span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-earth-500">
                {store.operatingStatus}
              </span>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
