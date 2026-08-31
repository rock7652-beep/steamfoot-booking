import {
  monthlyStoreSummary,
  monthlyRevenueByCategory,
} from "@/server/queries/report";
import {
  getCustomerFlowMetrics,
  type CustomerFlowComparison,
} from "@/server/queries/customer-flow-metrics";
import {
  getConversionMetrics,
  type ConversionComparison,
} from "@/server/queries/conversion-metrics";
import {
  getRetentionMetrics,
  type RetentionComparison,
} from "@/server/queries/retention-metrics";
import { getStorePerformanceTrends } from "@/server/queries/performance-trends";
import {
  getReportSnapshotWithMeta,
  upsertReportSnapshot,
} from "@/server/queries/report-snapshot";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getCachedStorePlan } from "@/lib/query-cache";
import { FEATURES } from "@/lib/feature-flags";
import { hasStoreFeature } from "@/lib/feature-gate";
import {
  DATA_EXPORT_LOCKED_MESSAGE,
  DATA_EXPORT_SELECT_STORE_MESSAGE,
  hasDataExportFeature,
} from "@/lib/data-export-gate";
import { ServerTiming, withTiming } from "@/lib/perf";
import { FeatureGate } from "@/components/feature-gate";
import { UpgradeNoticePage } from "@/components/upgrade-notice";
import { getActiveStoreForRead } from "@/lib/store";
import {
  resolveStoreViewContextFromCookie,
  storeIdForViewContext,
} from "@/lib/store-view-context-server";
import { redirect } from "next/navigation";
import ReportDateRange from "@/components/report-date-range";
import { toLocalDateStr, getPresetDateRange, type DateRangePreset } from "@/lib/date-utils";
import {
  PageShell,
  PageHeader,
  KpiStrip,
  DataTable,
  EmptyRow,
  type Column,
} from "@/components/desktop";
import { DashboardLink } from "@/components/dashboard-link";
import { PerformanceTrendChart } from "./performance-trend-chart";

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

  const activeStoreId = await getActiveStoreForRead(user);
  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  const isViewMode = storeViewContext?.isViewMode ?? false;
  const reportsStoreId = storeIdForViewContext(activeStoreId, storeViewContext);
  const canExportData = !isViewMode && (await hasDataExportFeature(reportsStoreId).catch(() => false));
  const dataExportLockedLabel = reportsStoreId
    ? DATA_EXPORT_LOCKED_MESSAGE
    : DATA_EXPORT_SELECT_STORE_MESSAGE;

  const gateStoreId = reportsStoreId ?? activeStoreId;
  if (gateStoreId && !(await hasStoreFeature(gateStoreId, FEATURES.BASIC_REPORTS))) {
    return (
      <UpgradeNoticePage
        title="營運分析尚未開通"
        description="請聯絡總部開通營運分析功能。"
      />
    );
  }

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
  const timer = new ServerTiming("/dashboard/reports");

  type StoreSummary = Awaited<ReturnType<typeof monthlyStoreSummary>>;
  type RevenueByCategory = Awaited<ReturnType<typeof monthlyRevenueByCategory>>;

  const snapshotStoreId = reportsStoreId || user.storeId!;
  const isMonthPreset = activePreset === "month";
  const isPastMonth = month < currentMonth;
  const isCurrentMonth = month === currentMonth;
  const CURRENT_MONTH_TTL_MS = 60 * 60 * 1000;
  const dateRangeOpts = { startDate, endDate, activeStoreId: reportsStoreId };

  let storeSummary: StoreSummary;
  let revenueByCategory: RevenueByCategory;
  let plan: Awaited<ReturnType<typeof getCachedStorePlan>>;
  let snapshotHit = false;

  if (isMonthPreset && (isPastMonth || isCurrentMonth)) {
    const [ssSnap, rcSnap, sp] = await Promise.all([
      withTiming("snapshotStoreSummary", timer, () =>
        getReportSnapshotWithMeta(snapshotStoreId, month, "STORE_SUMMARY"),
      ),
      withTiming("snapshotRevenueByCategory", timer, () =>
        getReportSnapshotWithMeta(snapshotStoreId, month, "REVENUE_BY_CATEGORY"),
      ),
      withTiming("getCachedStorePlan", timer, () =>
        getCachedStorePlan(reportsStoreId ?? user.storeId ?? undefined),
      ),
    ]);
    plan = sp;
    const nowMs = Date.now();
    const fresh = (m: { updatedAt: Date } | null) => {
      if (!m) return false;
      if (isPastMonth) return true;
      return nowMs - m.updatedAt.getTime() < CURRENT_MONTH_TTL_MS;
    };

    if (ssSnap && rcSnap && fresh(ssSnap) && fresh(rcSnap)) {
      storeSummary = ssSnap.data as StoreSummary;
      revenueByCategory = rcSnap.data as RevenueByCategory;
      snapshotHit = true;
    } else {
      [storeSummary, revenueByCategory] = await Promise.all([
        withTiming("monthlyStoreSummary", timer, () => monthlyStoreSummary(month, dateRangeOpts)),
        withTiming("monthlyRevenueByCategory", timer, () => monthlyRevenueByCategory(month, dateRangeOpts)),
      ]);
      void upsertReportSnapshot(snapshotStoreId, month, "STORE_SUMMARY", storeSummary).catch((e) =>
        console.error("[reports] snapshot store summary upsert failed", e),
      );
      void upsertReportSnapshot(snapshotStoreId, month, "REVENUE_BY_CATEGORY", revenueByCategory).catch((e) =>
        console.error("[reports] snapshot revenue by category upsert failed", e),
      );
    }
  } else {
    [storeSummary, revenueByCategory, plan] = await Promise.all([
      withTiming("monthlyStoreSummary", timer, () => monthlyStoreSummary(month, dateRangeOpts)),
      withTiming("monthlyRevenueByCategory", timer, () => monthlyRevenueByCategory(month, dateRangeOpts)),
      withTiming("getCachedStorePlan", timer, () =>
        getCachedStorePlan(reportsStoreId ?? user.storeId ?? undefined),
      ),
    ]);
  }

  timer.cacheStatus("reports-snapshot", snapshotHit ? "hit" : "miss");
  const [customerFlowMetrics, conversionMetrics, retentionMetrics, performanceTrends] = reportsStoreId
    ? await Promise.all([
        withTiming("customerFlowMetrics", timer, () => getCustomerFlowMetrics(reportsStoreId, month)),
        withTiming("conversionMetrics", timer, () => getConversionMetrics(reportsStoreId, month)),
        withTiming("retentionMetrics", timer, () => getRetentionMetrics(reportsStoreId, month)),
        withTiming("performanceTrends", timer, () => getStorePerformanceTrends(reportsStoreId, month)),
      ])
    : [null, null, null, null];
  timer.finish();

  const totalOrders = storeSummary.staffBreakdown.reduce((s, r) => s + r.transactionCount, 0);
  const currentTrend = isMonthPreset ? performanceTrends?.at(-1) : null;
  const totalRevenue = storeSummary.netCourseRevenue + storeSummary.cashbookIncome;
  const completedServices = currentTrend?.completedServices ?? storeSummary.completedBookings;

  type StaffRow = StoreSummary["staffBreakdown"][number];
  const staffColumns: Column<StaffRow>[] = [
    {
      key: "name",
      header: "店長",
      accessor: (r) => <span className="text-sm font-medium text-earth-900">{r.staffName}</span>,
    },
    {
      key: "customers",
      header: "顧客",
      align: "right",
      priority: "secondary",
      accessor: (r) => (
        <span className="tabular-nums">
          {r.customerCount}
          <span className="ml-0.5 text-[10px] text-earth-400">/{r.activeCustomerCount}</span>
        </span>
      ),
    },
    {
      key: "completed",
      header: "完成服務",
      align: "right",
      accessor: (r) => <span className="tabular-nums">{r.completedBookings} 筆</span>,
    },
    {
      key: "orders",
      header: "訂單",
      align: "right",
      priority: "secondary",
      accessor: (r) => <span className="tabular-nums">{r.transactionCount}</span>,
    },
    {
      key: "revenue",
      header: "系統收入",
      align: "right",
      accessor: (r) => <span className="tabular-nums text-earth-900">NT$ {r.totalRevenue.toLocaleString()}</span>,
    },
    {
      key: "fee",
      header: "空間費",
      align: "right",
      priority: "secondary",
      accessor: (r) => r.spaceFee > 0 ? (
        <span className="tabular-nums text-red-600">-NT$ {r.spaceFee.toLocaleString()}</span>
      ) : <span className="text-earth-300">—</span>,
    },
    {
      key: "net",
      header: "淨收",
      align: "right",
      accessor: (r) => <span className="font-semibold tabular-nums text-primary-700">NT$ {r.netRevenue.toLocaleString()}</span>,
    },
  ];

  type CategoryRow = RevenueByCategory[number];
  const categoryColumns: Column<CategoryRow>[] = [
    { key: "name", header: "店長", accessor: (r) => <span className="text-sm font-medium text-earth-900">{r.staffName}</span> },
    {
      key: "trial", header: "體驗", align: "right",
      accessor: (r) => r.trialRevenue > 0 ? <span className="tabular-nums">NT$ {r.trialRevenue.toLocaleString()}</span> : <span className="text-earth-300">—</span>,
    },
    {
      key: "single", header: "單次", align: "right",
      accessor: (r) => r.singleRevenue > 0 ? <span className="tabular-nums">NT$ {r.singleRevenue.toLocaleString()}</span> : <span className="text-earth-300">—</span>,
    },
    {
      key: "package", header: "課程", align: "right",
      accessor: (r) => r.packageRevenue > 0 ? <span className="tabular-nums">NT$ {r.packageRevenue.toLocaleString()}</span> : <span className="text-earth-300">—</span>,
    },
    {
      key: "net", header: "淨收", align: "right",
      accessor: (r) => <span className="font-semibold tabular-nums text-primary-700">NT$ {r.netRevenue.toLocaleString()}</span>,
    },
  ];

  return (
    <FeatureGate plan={plan} feature={FEATURES.BASIC_REPORTS}>
      <PageShell>
        <PageHeader
          title="營運分析"
          subtitle={`${displayLabel} 營收摘要`}
          actions={
            <>
              {isViewMode ? (
                <span className="rounded-md border border-earth-200 bg-earth-50 px-3 py-1.5 text-xs font-medium text-earth-500">查看模式不可匯出</span>
              ) : !canExportData ? (
                <span className="rounded-md border border-earth-200 bg-earth-50 px-3 py-1.5 text-xs font-medium text-earth-500">{dataExportLockedLabel}</span>
              ) : (
                <>
                  <a href={`/api/export/store-monthly?month=${month}`} className="rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50" download>全店 CSV</a>
                  <a href={`/api/export/staff-monthly?month=${month}`} className="rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50" download>店長 CSV</a>
                </>
              )}
              <a href="/dashboard/advanced-reports" className="rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50">經營診斷 →</a>
              <a href="/dashboard/service-fee-calculator" className="rounded-md border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100">月結管理 →</a>
            </>
          }
        />

        <ReportDateRange activePreset={activePreset} startDate={startDate} endDate={endDate} />

        <section aria-labelledby="operations-summary-title">
          <div className="mb-2">
            <h2 id="operations-summary-title" className="text-sm font-semibold text-earth-800">營運摘要</h2>
            <p className="mt-0.5 text-[11px] text-earth-400">掌握本期營收、完成服務、訂單與退款概況。</p>
          </div>
          <KpiStrip
            items={[
              { label: "本期營收", value: `NT$ ${totalRevenue.toLocaleString()}`, tone: "primary" },
              { label: "完成服務", value: `${completedServices} 人次`, tone: "green" },
              { label: "訂單數", value: `${totalOrders} 筆`, tone: "blue" },
              {
                label: "退款",
                value: `${storeSummary.totalRefund < 0 ? "-" : ""}NT$ ${Math.abs(storeSummary.totalRefund).toLocaleString()}`,
                tone: storeSummary.totalRefund < 0 ? "amber" : "earth",
              },
            ]}
          />
          {storeSummary.cashbookIncome > 0 && (
            <p className="mt-1 text-[11px] text-earth-400">本期營收已包含手動登錄收入 NT$ {storeSummary.cashbookIncome.toLocaleString()}。</p>
          )}
        </section>

        <section aria-labelledby="customer-flow-title" className="rounded-xl border border-earth-200 bg-white p-3">
          <div>
            <h2 id="customer-flow-title" className="text-sm font-semibold text-earth-800">客流分析</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-earth-400">
              顧客數以 customerId 去重；體驗另外顯示實際到店人次與預約組數，多人同行不再只算 1 人。
            </p>
          </div>
          {customerFlowMetrics ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {[
                ["本月來客數", customerFlowMetrics.uniqueVisitors, "monthly-customers", "位"],
                ["新客數", customerFlowMetrics.newVisitors, "monthly-new", "位"],
                ["舊客數", customerFlowMetrics.returningVisitors, "monthly-returning", "位"],
                ["體驗人次", customerFlowMetrics.trialAttendees, null, "人次"],
                ["體驗組數", customerFlowMetrics.trialBookingGroups, "monthly-trial", "組"],
              ].map(([label, metric, segment, unit]) => {
                const value = metric as (typeof customerFlowMetrics)["uniqueVisitors"];
                return (
                  <div key={label as string} className="rounded-lg bg-earth-50/70 p-3">
                    <p className="text-[11px] font-medium text-earth-500">{label as string}</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-earth-900">{value.current} {unit as string}</p>
                    <div className="mt-2 space-y-1 text-[11px] text-earth-500">
                      <p>較上月：{formatCustomerFlowComparison(value.mom, unit as string)}</p>
                      <p>去年同月：{formatCustomerFlowComparison(value.yoy, unit as string)}</p>
                    </div>
                    {segment ? (
                      <DashboardLink href={`/dashboard/growth?segment=${segment as string}&month=${month}`} className="mt-2 inline-flex text-[11px] font-medium text-primary-700 hover:text-primary-800">查看顧客 →</DashboardLink>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 rounded-lg bg-earth-50 px-3 py-2 text-xs text-earth-500">HQ 全店視角暫不提供客流唯一顧客數；請先選擇店舖，避免跨店重複顧客被錯誤加總。</p>
          )}
        </section>

        <section aria-labelledby="conversion-analysis-title" className="rounded-xl border border-earth-200 bg-white p-3">
          <div>
            <h2 id="conversion-analysis-title" className="text-sm font-semibold text-earth-800">成交分析</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-earth-400">
              開卡歸實際購買月份；當月總開卡分為本月體驗開卡與過往體驗追蹤開卡，已結算的體驗月份不回寫。
            </p>
          </div>
          {conversionMetrics ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
              {[
                ["體驗人次", conversionMetrics.trialAttendees, "count", null, "人次"],
                ["本月體驗開卡", conversionMetrics.currentTrialConversions, "count", "monthly-current-trial-converted", "位"],
                ["追蹤開卡", conversionMetrics.trackedConversions, "count", "monthly-tracked-converted", "位"],
                ["當月總開卡", conversionMetrics.convertedCustomers, "count", "monthly-converted", "位"],
                ["本月體驗開卡率", conversionMetrics.conversionRate, "rate", null, "%"],
                ["未開卡人次", conversionMetrics.unconvertedCustomers, "count", null, "人次"],
              ].map(([label, metric, kind, segment, unit]) => {
                const value = metric as (typeof conversionMetrics)["convertedCustomers"];
                const isRate = kind === "rate";
                return (
                  <div key={label as string} className="rounded-lg bg-earth-50/70 p-3">
                    <p className="text-[11px] font-medium text-earth-500">{label as string}</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-earth-900">
                      {isRate ? `${value.current.toFixed(1)}%` : `${value.current} ${unit as string}`}
                    </p>
                    <div className="mt-2 space-y-1 text-[11px] text-earth-500">
                      <p>較上月：{formatConversionComparison(value.mom, isRate, unit as string)}</p>
                      <p>去年同月：{formatConversionComparison(value.yoy, isRate, unit as string)}</p>
                    </div>
                    {segment ? (
                      <DashboardLink href={`/dashboard/growth?segment=${segment as string}&month=${month}`} className="mt-2 inline-flex text-[11px] font-medium text-primary-700 hover:text-primary-800">查看顧客 →</DashboardLink>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 rounded-lg bg-earth-50 px-3 py-2 text-xs text-earth-500">HQ 全店視角暫不提供成交分析；請先選擇店舖，避免跨店顧客被錯誤加總。</p>
          )}
        </section>

        {performanceTrends ? <PerformanceTrendChart data={performanceTrends} /> : null}

        <section aria-labelledby="retention-analysis-title" className="rounded-xl border border-earth-200 bg-white p-3">
          <div>
            <h2 id="retention-analysis-title" className="text-sm font-semibold text-earth-800">留存分析</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-earth-400">上個月來的顧客，這個月有多少人再次回來？僅計完成服務的唯一顧客，取消與未到不計。</p>
          </div>
          {retentionMetrics ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                ["本月回流人數", retentionMetrics.returnedCustomers, "count", "monthly-returned"],
                ["上月顧客回流率", retentionMetrics.retentionRate, "rate", null],
                ["本月未回流人數", retentionMetrics.unreturnedCustomers, "count", "monthly-not-returned"],
              ].map(([label, metric, kind, segment]) => {
                const value = metric as (typeof retentionMetrics)["returnedCustomers"];
                const isRate = kind === "rate";
                return (
                  <div key={label as string} className="rounded-lg bg-earth-50/70 p-3">
                    <p className="text-[11px] font-medium text-earth-500">{label as string}</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-earth-900">{isRate ? `${value.current.toFixed(1)}%` : `${value.current} 位`}</p>
                    <div className="mt-2 space-y-1 text-[11px] text-earth-500">
                      <p>較上月：{formatRetentionComparison(value.mom, isRate)}</p>
                      <p>去年同月：{formatRetentionComparison(value.yoy, isRate)}</p>
                    </div>
                    {segment ? (
                      <DashboardLink href={`/dashboard/growth?segment=${segment as string}&month=${month}`} className="mt-2 inline-flex text-[11px] font-medium text-primary-700 hover:text-primary-800">查看顧客 →</DashboardLink>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 rounded-lg bg-earth-50 px-3 py-2 text-xs text-earth-500">HQ 全店視角暫不提供留存分析；請先選擇店舖，避免跨店顧客被錯誤合併。</p>
          )}
        </section>

        <section className="rounded-xl border border-earth-200 bg-white">
          <div className="flex items-center justify-between px-3 py-2">
            <div>
              <h2 className="text-sm font-semibold text-earth-800">營收分析</h2>
              <p className="text-[11px] text-earth-400">系統交易依體驗、單次與課程拆分；手動收入中的零售另納入上方營收總額與零售趨勢。</p>
            </div>
          </div>
          {revenueByCategory.length === 0 ? (
            <EmptyRow title="本期無資料" hint="選擇的期間內沒有收入類型資料" />
          ) : (
            <DataTable columns={categoryColumns} rows={revenueByCategory} rowKey={(r) => r.staffId} className="rounded-none border-0 border-t border-earth-100" />
          )}
        </section>

        <section className="rounded-xl border border-earth-200 bg-white">
          <div className="flex items-center justify-between px-3 py-2">
            <div>
              <h2 className="text-sm font-semibold text-earth-800">店長分析</h2>
              <p className="text-[11px] text-earth-400">比較各店長的期間顧客、服務紀錄、訂單與系統交易表現。多人實際人次以全店摘要與趨勢為準。</p>
            </div>
          </div>
          {storeSummary.staffBreakdown.length === 0 ? (
            <EmptyRow title="本期無資料" hint="選擇的期間內沒有店長績效資料" />
          ) : (
            <DataTable columns={staffColumns} rows={storeSummary.staffBreakdown} rowKey={(r) => r.staffId} className="rounded-none border-0 border-t border-earth-100" />
          )}
        </section>
      </PageShell>
    </FeatureGate>
  );
}

function formatCustomerFlowComparison(comparison: CustomerFlowComparison, unit = "位"): string {
  const difference = `${comparison.difference > 0 ? "+" : ""}${comparison.difference}`;
  if (comparison.percentage === null) return `${difference} ${unit}（基期為 0，無法比較）`;
  const percentage = `${comparison.percentage > 0 ? "+" : ""}${comparison.percentage.toFixed(1)}%`;
  return `${difference} ${unit}（${percentage}）`;
}

function formatConversionComparison(comparison: ConversionComparison, isRate: boolean, countUnit = "位"): string {
  const difference = `${comparison.difference > 0 ? "+" : ""}${comparison.difference.toFixed(isRate ? 1 : 0)}`;
  const unit = isRate ? " 個百分點" : ` ${countUnit}`;
  if (comparison.percentage === null) return `${difference}${unit}（基期為 0，無法比較）`;
  const percentage = `${comparison.percentage > 0 ? "+" : ""}${comparison.percentage.toFixed(1)}%`;
  return `${difference}${unit}（${percentage}）`;
}

function formatRetentionComparison(comparison: RetentionComparison, isRate: boolean): string {
  const difference = `${comparison.difference > 0 ? "+" : ""}${comparison.difference.toFixed(isRate ? 1 : 0)}`;
  const unit = isRate ? " 個百分點" : " 位";
  if (comparison.percentage === null) return `${difference}${unit}（基期為 0，無法比較）`;
  const percentage = `${comparison.percentage > 0 ? "+" : ""}${comparison.percentage.toFixed(1)}%`;
  return `${difference}${unit}（${percentage}）`;
}
