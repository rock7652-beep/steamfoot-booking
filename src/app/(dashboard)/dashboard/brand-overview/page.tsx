import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import {
  BRAND_OVERVIEW_PERIODS,
  getBrandOverviewFoundation,
  resolveBrandOverviewPeriod,
  type BrandOverviewPeriod,
} from "@/server/queries/brand-overview";

interface PageProps {
  searchParams: Promise<{ period?: string | string[] | undefined }>;
}

const KPI_ITEMS = [
  { key: "stores", label: "店數", unit: "間", tone: "primary" },
  { key: "activeStores", label: "活躍店數", unit: "間", tone: "green" },
  { key: "visitors", label: "總來客數", unit: "人次", tone: "blue" },
  { key: "revenue", label: "總營業額", unit: "元", tone: "amber" },
  { key: "avgRevenue", label: "平均每店月營業額", unit: "元", tone: "earth" },
] as const;

const TONE_CLASS: Record<(typeof KPI_ITEMS)[number]["tone"], string> = {
  primary: "bg-primary-50 text-primary-700 border-primary-100",
  green: "bg-green-50 text-green-700 border-green-100",
  blue: "bg-blue-50 text-blue-700 border-blue-100",
  amber: "bg-amber-50 text-amber-700 border-amber-100",
  earth: "bg-earth-50 text-earth-800 border-earth-100",
};

const REGION_PLACEHOLDERS = ["北部", "中部", "南部", "東部"];
const STORE_PLACEHOLDERS = ["店名", "地區", "來客", "營業額"];

export default async function BrandOverviewPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/hq/login");
  if (user.role !== "ADMIN") notFound();
  if (!(await checkPermission(user.role, user.staffId, "report.read"))) notFound();

  const params = await searchParams;
  const period = resolveBrandOverviewPeriod(params.period);
  const overview = await getBrandOverviewFoundation(period);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-primary-700">Brand Operating System</p>
          <h1 className="mt-2 text-2xl font-bold text-earth-900 sm:text-3xl">品牌總覽</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-earth-600">
            這個畫面，能不能讓人更相信這個品牌？
          </p>
        </div>
        <div className="rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm text-earth-600">
          資料更新於：<span className="font-mono text-earth-800">{overview.updatedAtLabel}</span>
        </div>
      </header>

      <PeriodSelector activePeriod={overview.period} />

      <section className="overflow-hidden rounded-2xl border border-earth-200 bg-white">
        <div className="grid gap-0 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="relative min-h-80 bg-[linear-gradient(135deg,#f8faf7_0%,#eef5f0_48%,#f7f0e8_100%)] p-5 sm:p-6">
            <div className="absolute inset-6 rounded-[2rem] border border-white/80" />
            <div className="relative flex h-full min-h-64 items-center justify-center">
              <div className="grid w-full max-w-xl grid-cols-4 gap-3">
                {REGION_PLACEHOLDERS.map((region, index) => (
                  <div
                    key={region}
                    className={`flex h-24 items-center justify-center rounded-2xl border border-white/80 bg-white/70 text-sm font-semibold text-earth-600 shadow-sm ${
                      index === 0 ? "col-span-2 h-32 text-primary-700" : ""
                    } ${index === 3 ? "col-span-2" : ""}`}
                  >
                    {region}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="border-t border-earth-200 p-5 lg:border-l lg:border-t-0">
            <p className="text-sm font-semibold text-earth-900">品牌版圖</p>
            <p className="mt-2 text-sm leading-6 text-earth-600">
              Brand Overview 首頁不是展示資料，而是建立品牌信任。正式台灣行政地圖會在
              Brand Footprint PR 接入。
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <MiniMetric label="目前店數" value={overview.storeCount} unit="間" />
              <MiniMetric label="查詢期間" value={overview.periodLabel} />
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="brand-scale-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="brand-scale-heading" className="text-base font-bold text-earth-900">
            品牌規模
          </h2>
          <p className="text-xs text-earth-500">期間：{overview.periodLabel}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {KPI_ITEMS.map((item) => {
            const value =
              item.key === "stores"
                ? overview.storeCount
                : item.key === "activeStores"
                  ? overview.activeStoreCount
                  : "—";
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
            <h2 id="regional-overview-heading" className="text-base font-bold text-earth-900">
              地區概況
            </h2>
            <span className="rounded-full bg-earth-100 px-2 py-1 text-xs text-earth-500">Empty State</span>
          </div>
          <div className="space-y-3">
            {REGION_PLACEHOLDERS.map((region) => (
              <div key={region} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg border border-earth-100 px-3 py-3">
                <span className="font-medium text-earth-800">{region}</span>
                <span className="text-sm text-earth-400">店數 —</span>
                <span className="text-sm text-earth-400">營業額 —</span>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="store-overview-heading" className="rounded-xl border border-earth-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="store-overview-heading" className="text-base font-bold text-earth-900">
              店舖概況
            </h2>
            <span className="rounded-full bg-earth-100 px-2 py-1 text-xs text-earth-500">Foundation</span>
          </div>
          <div className="overflow-hidden rounded-lg border border-earth-100">
            <div className="grid grid-cols-4 bg-earth-50 px-3 py-2 text-xs font-medium text-earth-500">
              {STORE_PLACEHOLDERS.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className="px-3 py-10 text-center text-sm text-earth-500">
              店舖總覽資料將在 Store Overview PR 接入。
            </div>
          </div>
        </section>
      </div>
    </div>
  );
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

function MiniMetric({ label, value, unit }: { label: string; value: number | string; unit?: string }) {
  return (
    <div className="rounded-xl border border-earth-100 bg-earth-50 px-3 py-3">
      <p className="text-xs text-earth-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-earth-900">
        {value}
        {unit ? <span className="ml-1 text-xs font-normal text-earth-500">{unit}</span> : null}
      </p>
    </div>
  );
}
