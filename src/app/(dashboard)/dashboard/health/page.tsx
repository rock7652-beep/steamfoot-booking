import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { PageHeader, PageShell } from "@/components/desktop";
import { DashboardLink as Link } from "@/components/dashboard-link";
import {
  listNativeHealthRecords,
  type HealthMetricFilter,
} from "@/server/queries/native-health-records";

interface PageProps {
  searchParams: Promise<{
    search?: string;
    from?: string;
    to?: string;
    metric?: string;
    page?: string;
  }>;
}

const METRICS: Array<{ value: HealthMetricFilter; label: string }> = [
  { value: "weight", label: "體重" },
  { value: "bmi", label: "BMI" },
  { value: "bodyFat", label: "體脂肪" },
  { value: "muscleMass", label: "肌肉量" },
  { value: "boneMass", label: "骨量" },
  { value: "visceralFat", label: "內臟脂肪" },
  { value: "bmr", label: "基礎代謝" },
  { value: "bodyWater", label: "體水分" },
  { value: "metabolicAge", label: "體內年齡" },
];

function normalizeMetric(value?: string): HealthMetricFilter | undefined {
  return METRICS.some((metric) => metric.value === value)
    ? (value as HealthMetricFilter)
    : undefined;
}

export default async function DashboardHealthPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "customer.read"))) {
    redirect("/dashboard");
  }

  const storeId = await getActiveStoreForRead(user);
  if (!storeId) {
    return (
      <PageShell>
        <PageHeader title="顧客健康資料" subtitle="請先選擇要查看的門店" />
      </PageShell>
    );
  }
  if (!(await hasStoreFeature(storeId, FEATURES.AI_HEALTH_SUMMARY))) {
    redirect("/dashboard/customers");
  }

  const metric = normalizeMetric(params.metric);
  const result = await listNativeHealthRecords(storeId, {
    search: params.search,
    from: params.from,
    to: params.to,
    metric,
    page: Number(params.page) || 1,
  });
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <PageShell>
      <PageHeader
        title="顧客健康資料"
        subtitle="僅顯示目前門店的顧客量測，可依顧客、日期及項目篩選"
        actions={
          <Link href="/dashboard/customers" className="rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50">
            返回顧客管理
          </Link>
        }
      />

      <form method="get" className="grid min-w-0 gap-3 rounded-xl border border-earth-200 bg-white p-4 md:grid-cols-5">
        <label className="min-w-0 md:col-span-2">
          <span className="mb-1 block text-xs font-medium text-earth-600">顧客姓名或電話</span>
          <input name="search" defaultValue={params.search} placeholder="輸入姓名或電話" className="min-h-10 w-full min-w-0 max-w-full rounded-md border border-earth-200 px-3 text-sm" />
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-xs font-medium text-earth-600">開始日期</span>
          <input type="date" name="from" defaultValue={params.from} className="block min-h-10 w-full min-w-0 max-w-full rounded-md border border-earth-200 px-3 text-sm" />
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-xs font-medium text-earth-600">結束日期</span>
          <input type="date" name="to" defaultValue={params.to} className="block min-h-10 w-full min-w-0 max-w-full rounded-md border border-earth-200 px-3 text-sm" />
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-xs font-medium text-earth-600">有量測的項目</span>
          <select name="metric" defaultValue={metric ?? ""} className="min-h-10 w-full min-w-0 max-w-full rounded-md border border-earth-200 px-3 text-sm">
            <option value="">全部</option>
            {METRICS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <div className="flex gap-2 md:col-span-5 md:justify-end">
          <Link href="/dashboard/health" className="inline-flex min-h-10 items-center rounded-md border border-earth-200 px-4 text-sm text-earth-700">清除</Link>
          <button type="submit" className="min-h-10 rounded-md bg-primary-600 px-5 text-sm font-semibold text-white">套用篩選</button>
        </div>
      </form>

      <div className="text-xs text-earth-500">共 {result.total} 筆量測紀錄</div>
      <div className="grid gap-3 md:hidden">
        {result.records.map((record) => (
          <article key={record.id} className="min-w-0 rounded-xl border border-earth-200 bg-white p-4">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/dashboard/customers/${record.customer.id}`} className="block truncate font-semibold text-earth-900 hover:text-primary-700">
                  {record.customer.name}
                </Link>
                <div className="mt-0.5 truncate text-xs text-earth-500">{record.customer.phone ?? "—"}</div>
              </div>
              <time className="shrink-0 text-sm font-medium tabular-nums text-earth-700">
                {record.measuredAt.toISOString().slice(0, 10)}
              </time>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
              <MobileMetric label="體重" value={record.weight} unit="kg" />
              <MobileMetric label="BMI" value={record.bmi} />
              <MobileMetric label="體脂肪" value={record.bodyFat} unit="%" />
              <MobileMetric label="肌肉量" value={record.muscleMass} unit="kg" />
              <MobileMetric label="骨量" value={record.boneMass} unit="kg" />
              <MobileMetric label="內臟脂肪" value={record.visceralFat} />
              <MobileMetric label="基礎代謝" value={record.bmr} unit="kcal" />
              <MobileMetric label="體水分" value={record.bodyWater} unit="%" />
              <MobileMetric label="體內年齡" value={record.metabolicAge} unit="歲" />
            </dl>
          </article>
        ))}
        {result.records.length === 0 && (
          <div className="rounded-xl border border-earth-200 bg-white px-4 py-12 text-center text-sm text-earth-500">
            找不到符合條件的量測紀錄
          </div>
        )}
      </div>
      <div className="hidden min-w-0 max-w-full overflow-x-auto rounded-xl border border-earth-200 bg-white md:block">
        <table className="min-w-[1320px] w-full text-left text-sm">
          <thead className="bg-earth-50 text-xs text-earth-600">
            <tr>
              <th className="px-4 py-3">量測日期</th><th className="px-4 py-3">顧客</th><th className="px-4 py-3">電話</th>
              <th className="px-4 py-3 text-right">體重</th><th className="px-4 py-3 text-right">BMI</th><th className="px-4 py-3 text-right">體脂</th>
              <th className="px-4 py-3 text-right">肌肉量</th><th className="px-4 py-3 text-right">骨量</th><th className="px-4 py-3 text-right">內臟脂肪</th>
              <th className="px-4 py-3 text-right">基礎代謝</th><th className="px-4 py-3 text-right">體水分</th><th className="px-4 py-3 text-right">體內年齡</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-earth-100">
            {result.records.map((record) => (
              <tr key={record.id} className="text-earth-800">
                <td className="whitespace-nowrap px-4 py-3">{record.measuredAt.toISOString().slice(0, 10)}</td>
                <td className="px-4 py-3 font-medium"><Link href={`/dashboard/customers/${record.customer.id}`} className="hover:text-primary-700">{record.customer.name}</Link></td>
                <td className="whitespace-nowrap px-4 py-3">{record.customer.phone ?? "—"}</td>
                <Metric value={record.weight} unit="kg" /><Metric value={record.bmi} /><Metric value={record.bodyFat} unit="%" />
                <Metric value={record.muscleMass} unit="kg" /><Metric value={record.boneMass} unit="kg" /><Metric value={record.visceralFat} />
                <Metric value={record.bmr} unit="kcal" /><Metric value={record.bodyWater} unit="%" /><Metric value={record.metabolicAge} unit="歲" />
              </tr>
            ))}
            {result.records.length === 0 && <tr><td colSpan={12} className="px-4 py-12 text-center text-earth-500">找不到符合條件的量測紀錄</td></tr>}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-3 text-sm">
          {result.page > 1 && <Link href={pageHref(params, result.page - 1)} className="rounded-md border border-earth-200 px-3 py-2">上一頁</Link>}
          <span className="text-earth-500">第 {result.page} / {totalPages} 頁</span>
          {result.page < totalPages && <Link href={pageHref(params, result.page + 1)} className="rounded-md border border-earth-200 px-3 py-2">下一頁</Link>}
        </div>
      )}
    </PageShell>
  );
}

function Metric({ value, unit = "" }: { value: number | null; unit?: string }) {
  return <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{value == null ? "—" : `${value}${unit}`}</td>;
}

function MobileMetric({ label, value, unit = "" }: { label: string; value: number | null; unit?: string }) {
  return (
    <div className="min-w-0 border-t border-earth-100 pt-2">
      <dt className="text-[11px] text-earth-500">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium tabular-nums text-earth-800">
        {value == null ? "—" : `${value}${unit}`}
      </dd>
    </div>
  );
}

function pageHref(params: Awaited<PageProps["searchParams"]>, page: number) {
  const query = new URLSearchParams();
  for (const key of ["search", "from", "to", "metric"] as const) {
    if (params[key]) query.set(key, params[key]);
  }
  query.set("page", String(page));
  return `/dashboard/health?${query.toString()}`;
}
