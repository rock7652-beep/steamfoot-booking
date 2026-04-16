import {
  monthlyStoreSummary,
  monthlyRevenueByCategory,
} from "@/server/queries/report";
import { getReportSnapshot } from "@/server/queries/report-snapshot";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getCurrentStorePlan } from "@/lib/store-plan";
import { hasFeature, FEATURES } from "@/lib/feature-flags";
import { ServerTiming, withTiming } from "@/lib/perf";
import { FeatureGate } from "@/components/feature-gate";
import { UpgradeNoticePage } from "@/components/upgrade-notice";
import { getActiveStoreForRead } from "@/lib/store";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import ReportDateRange from "@/components/report-date-range";
import { toLocalDateStr, getPresetDateRange, type DateRangePreset } from "@/lib/date-utils";

interface PageProps {
  searchParams: Promise<{
    preset?: string;
    startDate?: string;
    endDate?: string;
    month?: string;
  }>;
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "report.read"))) {
    redirect("/dashboard");
  }

  // PricingPlan feature gate: 進階報表需 GROWTH+
  const pricingPlan = await getCurrentStorePlan();
  if (!hasFeature(pricingPlan, FEATURES.ADVANCED_REPORTS)) {
    return (
      <UpgradeNoticePage
        title="進階報表需升級方案"
        description="此功能需升級至「成長版」方案才能使用。升級後可享有完整報表、AI 健康分析等進階功能。"
      />
    );
  }

  const today = toLocalDateStr();

  let startDate: string;
  let endDate: string;
  let activePreset = params.preset || "month";
  let displayLabel: string;

  if (params.startDate && params.endDate) {
    startDate = params.startDate;
    endDate = params.endDate;
    activePreset = "custom";
    displayLabel = `${startDate} ~ ${endDate}`;
  } else if (params.preset && ["today", "month", "quarter"].includes(params.preset)) {
    const range = getPresetDateRange(params.preset as DateRangePreset);
    startDate = range.startDate;
    endDate = range.endDate;
    displayLabel = range.label;
  } else {
    const range = getPresetDateRange("month");
    startDate = range.startDate;
    endDate = range.endDate;
    displayLabel = range.label;
  }

  const month = startDate.slice(0, 7);
  const currentMonth = toLocalDateStr().slice(0, 7);
  const activeStoreId = await getActiveStoreForRead(user);

  const timer = new ServerTiming("/dashboard/reports");

  // For past complete months with default preset, try pre-computed snapshot first
  const isFullPastMonth = month < currentMonth && activePreset === "month";
  const dateRangeOpts = { startDate, endDate, activeStoreId };

  type StoreSummary = Awaited<ReturnType<typeof monthlyStoreSummary>>;
  type RevenueByCategory = Awaited<ReturnType<typeof monthlyRevenueByCategory>>;

  let storeSummary: StoreSummary;
  let revenueByCategory: RevenueByCategory;
  let plan: Awaited<ReturnType<typeof getCurrentStorePlan>>;

  if (isFullPastMonth) {
    const [ssSnap, rcSnap, sp] = await Promise.all([
      withTiming("snapshotStoreSummary", timer, () => getReportSnapshot(activeStoreId || user.storeId!, month, "STORE_SUMMARY")),
      withTiming("snapshotRevenueByCategory", timer, () => getReportSnapshot(activeStoreId || user.storeId!, month, "REVENUE_BY_CATEGORY")),
      withTiming("getCurrentStorePlan", timer, () => getCurrentStorePlan()),
    ]);
    plan = sp;
    if (ssSnap && rcSnap) {
      storeSummary = ssSnap as StoreSummary;
      revenueByCategory = rcSnap as RevenueByCategory;
    } else {
      [storeSummary, revenueByCategory] = await Promise.all([
        withTiming("monthlyStoreSummary", timer, () => monthlyStoreSummary(month, dateRangeOpts)),
        withTiming("monthlyRevenueByCategory", timer, () => monthlyRevenueByCategory(month, dateRangeOpts)),
      ]);
    }
  } else {
    [storeSummary, revenueByCategory, plan] = await Promise.all([
      withTiming("monthlyStoreSummary", timer, () => monthlyStoreSummary(month, dateRangeOpts)),
      withTiming("monthlyRevenueByCategory", timer, () => monthlyRevenueByCategory(month, dateRangeOpts)),
      withTiming("getCurrentStorePlan", timer, () => getCurrentStorePlan()),
    ]);
  }

  timer.finish();

  return (
    <FeatureGate plan={plan} feature={FEATURES.BASIC_REPORTS}>
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-bold text-earth-900">報表</h1>
      </div>

      {/* Date range filter */}
      <ReportDateRange
        activePreset={activePreset}
        startDate={startDate}
        endDate={endDate}
      />

      {/* Period label */}
      <p className="mt-4 mb-4 text-sm text-earth-500">
        {displayLabel} 營收摘要
      </p>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-earth-200 bg-white p-3.5 shadow-sm">
          <p className="text-xs text-earth-500">課程總收入</p>
          <p className="text-lg font-bold text-earth-900">
            ${storeSummary.totalCourseRevenue.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-earth-200 bg-white p-3.5 shadow-sm">
          <p className="text-xs text-earth-500">退款</p>
          <p className="text-lg font-bold text-red-600">
            ${Math.abs(storeSummary.totalRefund).toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-earth-200 bg-white p-3.5 shadow-sm">
          <p className="text-xs text-earth-500">完成服務</p>
          <p className="text-lg font-bold text-earth-900">{storeSummary.completedBookings} 堂</p>
        </div>
        <div className="rounded-xl border border-primary-200 bg-primary-50 p-3.5 shadow-sm">
          <p className="text-xs text-primary-600">淨收入</p>
          <p className="text-lg font-bold text-primary-700">
            ${storeSummary.netCourseRevenue.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Staff breakdown */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-earth-800">店長明細</h2>
        <div className="space-y-2">
          {storeSummary.staffBreakdown.length === 0 ? (
            <EmptyState icon="empty" title="本期無資料" description="選擇的期間內沒有店長績效資料" />
          ) : (
            storeSummary.staffBreakdown.map((r) => (
              <div key={r.staffId} className="rounded-xl border border-earth-200 bg-white p-3.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-earth-900">{r.staffName}</span>
                  <span className="text-sm font-semibold text-primary-700">
                    ${r.netRevenue.toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-earth-500">
                  <span>顧客 {r.customerCount}</span>
                  <span>有效 {r.activeCustomerCount}</span>
                  <span>服務 {r.completedBookings} 堂</span>
                  {r.spaceFee > 0 && (
                    <span className="text-red-500">空間費 ${r.spaceFee.toLocaleString()}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Revenue by category */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-earth-800">收入類型</h2>
        {revenueByCategory.length === 0 ? (
          <EmptyState icon="empty" title="本期無資料" description="選擇的期間內沒有收入類型資料" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-earth-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-earth-100 bg-earth-50/50">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium text-earth-600">店長</th>
                  <th className="px-3 py-2.5 text-right font-medium text-earth-600">體驗</th>
                  <th className="px-3 py-2.5 text-right font-medium text-earth-600">單次</th>
                  <th className="px-3 py-2.5 text-right font-medium text-earth-600">課程</th>
                  <th className="px-3 py-2.5 text-right font-medium text-earth-600">淨收</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-earth-100">
                {revenueByCategory.map((r) => (
                  <tr key={r.staffId} className="hover:bg-earth-50/50 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-earth-800">{r.staffName}</td>
                    <td className="px-3 py-2.5 text-right text-earth-600">
                      {r.trialRevenue > 0 ? `$${r.trialRevenue.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-earth-600">
                      {r.singleRevenue > 0 ? `$${r.singleRevenue.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-earth-600">
                      {r.packageRevenue > 0 ? `$${r.packageRevenue.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-primary-700">
                      ${r.netRevenue.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Export */}
      <section className="mb-4">
        <h2 className="mb-2 text-sm font-semibold text-earth-800">匯出</h2>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/export/store-monthly?month=${month}`}
            className="rounded-lg border border-earth-300 bg-white px-3 py-1.5 text-sm font-medium text-earth-700 hover:bg-earth-50 transition-colors"
            download
          >
            全店月報 CSV
          </a>
          <a
            href={`/api/export/staff-monthly?month=${month}`}
            className="rounded-lg border border-earth-300 bg-white px-3 py-1.5 text-sm font-medium text-earth-700 hover:bg-earth-50 transition-colors"
            download
          >
            店長月報 CSV
          </a>
        </div>
      </section>
    </div>
    </FeatureGate>
  );
}
