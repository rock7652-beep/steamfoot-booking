import {
  monthlyStoreSummary,
  monthlyRevenueByCategory,
} from "@/server/queries/report";
import type { CustomerFlowComparison } from "@/server/queries/customer-flow-metrics";
import type { ConversionComparison } from "@/server/queries/conversion-metrics";
import type { RetentionComparison } from "@/server/queries/retention-metrics";
import { getAnalysisPeriodMetrics } from "@/server/queries/analysis-period";
import { getStorePerformanceTrends } from "@/server/queries/performance-trends";
import { getTrialSourceMetrics } from "@/server/queries/trial-source-metrics";
import { getIndustryRevenueMix, getIndustrySixMonthRevenueMixTrend } from "@/server/queries/industry-revenue-mix";
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
import { toLocalDateStr, resolveAnalysisRange, analysisComparisonRanges } from "@/lib/date-utils";
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
import { RevenueMixTrend } from "@/components/revenue-mix-trend";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { SpaAnalysisPage } from "./spa-analysis-page";

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
        description="分析可依方案選用或加購；目前門市尚未開通，請聯絡總部確認任選名額與開通設定。"
      />
    );
  }

  if (reportsStoreId) {
    const industryModule = await getStoreIndustryModule(reportsStoreId);
    if (industryModule === "spa") return <SpaAnalysisPage storeId={reportsStoreId} params={params} user={user} isViewMode={isViewMode} />;
    if (industryModule === "course") {
      const query = new URLSearchParams({ view: "analytics" });
      for (const key of ["preset", "startDate", "endDate", "month"] as const) {
        if (params[key]) query.set(key, params[key]);
      }
      redirect(`/dashboard/courses?${query}`);
    }
  }

  const selection = resolveAnalysisRange(params);
  const { startDate, endDate, preset: activePreset } = selection;
  const periodRanges = analysisComparisonRanges(selection, activePreset);
  const effectiveEndDate = periodRanges.current.endDate;
  const displayLabel = `${startDate}～${effectiveEndDate}`;

  const month = startDate.slice(0, 7);
  const currentMonth = toLocalDateStr().slice(0, 7);
  const timer = new ServerTiming("/dashboard/reports");

  type StoreSummary = Awaited<ReturnType<typeof monthlyStoreSummary>>;
  type RevenueByCategory = Awaited<ReturnType<typeof monthlyRevenueByCategory>>;

  const dateRangeOpts = { startDate, endDate: effectiveEndDate, activeStoreId: reportsStoreId };
  const [storeSummary, revenueByCategory, plan, periodMetrics, performanceTrends, trialSourceMetrics, revenueMix, sixMonthRevenueMixTrend] = await Promise.all([
    withTiming("monthlyStoreSummary", timer, () => monthlyStoreSummary(month, dateRangeOpts)),
    withTiming("monthlyRevenueByCategory", timer, () => monthlyRevenueByCategory(month, dateRangeOpts)),
    getCachedStorePlan(reportsStoreId ?? user.storeId ?? undefined),
    reportsStoreId ? getAnalysisPeriodMetrics(reportsStoreId, selection, activePreset) : null,
    reportsStoreId ? getStorePerformanceTrends(reportsStoreId, currentMonth) : null,
    reportsStoreId ? getTrialSourceMetrics(reportsStoreId, startDate, effectiveEndDate) : null,
    reportsStoreId ? getIndustryRevenueMix(reportsStoreId, startDate, effectiveEndDate) : null,
    reportsStoreId ? getIndustrySixMonthRevenueMixTrend(reportsStoreId) : null,
  ]);
  const customerFlowMetrics = periodMetrics?.metrics;
  const conversionMetrics = periodMetrics?.metrics;
  const retentionMetrics = periodMetrics?.metrics;
  timer.finish();

  const totalOrders = storeSummary.staffBreakdown.reduce((s, r) => s + r.transactionCount, 0);
  const totalRevenue = revenueMix?.netRevenue ?? storeSummary.netCourseRevenue + storeSummary.cashbookIncome;
  const completedServices = periodMetrics?.metrics.completedServices.current ?? storeSummary.completedBookings;
  const periodWord = activePreset === "month" ? "本月" : "本期";
  const growthLink = (segment: string) => `/dashboard/growth?segment=${segment}&startDate=${startDate}&endDate=${endDate}&preset=${activePreset}`;
  const trialBookings = trialSourceMetrics?.reduce((sum, row) => sum + row.bookedPeople, 0) ?? 0;
  const trialArrivals = trialSourceMetrics?.reduce((sum, row) => sum + row.attendees, 0) ?? 0;
  const trialArrivalRate = trialBookings ? (trialArrivals / trialBookings) * 100 : 0;

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
    <FeatureGate plan={plan} feature={FEATURES.BASIC_REPORTS} enabled={true}>
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
                  <a href={`/api/export/store-monthly?month=${month}&startDate=${startDate}&endDate=${endDate}&preset=${activePreset}`} className="rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50" download>全店 CSV</a>
                  <a href={`/api/export/staff-monthly?month=${month}&startDate=${startDate}&endDate=${endDate}&preset=${activePreset}`} className="rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50" download>店長 CSV</a>
                </>
              )}
              <a href="/dashboard/service-fee-calculator" className="rounded-md border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100">月結管理 →</a>
            </>
          }
        />

        <ReportDateRange key={`${activePreset}-${startDate}-${endDate}`} activePreset={activePreset} startDate={startDate} endDate={endDate} />
        <p className="text-xs text-earth-500">營收、客流、開卡、來源與回流均依 {startDate}～{effectiveEndDate} 統計；與前一段相同進度比較。下方長期趨勢固定顯示最近月份。</p>

        <section aria-labelledby="operations-summary-title">
          <div className="mb-2">
            <h2 id="operations-summary-title" className="text-sm font-semibold text-earth-800">營運摘要</h2>
            <p className="mt-0.5 text-[11px] text-earth-400">掌握本期營收、完成服務、訂單與退款概況。</p>
          </div>
          <KpiStrip
            items={[
              { label: "本期已收營收", value: `NT$ ${totalRevenue.toLocaleString()}`, tone: "primary" },
              { label: "完成服務", value: `${completedServices} 人次`, tone: "green" },
              { label: "訂單數", value: `${totalOrders} 筆`, tone: "blue" },
              {
                label: "退款",
                value: `${storeSummary.totalRefund < 0 ? "-" : ""}NT$ ${Math.abs(storeSummary.totalRefund).toLocaleString()}`,
                tone: storeSummary.totalRefund < 0 ? "amber" : "earth",
              },
            ]}
          />
          {revenueMix && revenueMix.manualIncome > 0 && (
            <p className="mt-1 text-[11px] text-earth-400">本期已收營收包含手動登錄收入 NT$ {revenueMix.manualIncome.toLocaleString()}。</p>
          )}
        </section>

        <section aria-labelledby="revenue-mix-title" className="rounded-xl border border-earth-200 bg-white p-3">
          <h2 id="revenue-mix-title" className="text-sm font-semibold text-earth-800">營收結構與收支</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-earth-500">
            依上方選定期間統計已確認收款；待收款另列。分類占比以退款前的已收收入為分母；退款另列，支出只計已記錄的支出項目，提款不當作支出。
          </p>
          {revenueMix ? (
            <>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  { label: "儲值方案", amount: revenueMix.packageRevenue, share: revenueMix.packageShare, href: `/dashboard/transactions?dateFrom=${startDate}&dateTo=${endDate}&revenueGroup=package` },
                  { label: "零售", amount: revenueMix.retailRevenue, share: revenueMix.retailShare, href: `/dashboard/cashbook?month=${month}&dateFrom=${startDate}&dateTo=${endDate}&type=INCOME&categoryGroup=retail#cashbook-records` },
                ].map(({ label, amount, share, href }) => (
                  <div key={label} className="rounded-lg bg-earth-50/70 p-3">
                    <p className="text-xs font-medium text-earth-500">{label}</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-earth-900">NT$ {amount.toLocaleString()}</p>
                    <p className="text-xs tabular-nums text-earth-500">占收入 {share.toFixed(1)}%</p>
                    <DashboardLink href={href} className="mt-1 inline-flex text-xs text-primary-700">查看明細 →</DashboardLink>
                  </div>
                ))}
                <div className="rounded-lg bg-earth-50/70 p-3">
                  <p className="text-xs font-medium text-earth-500">其他收入</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-earth-900">NT$ {revenueMix.otherRevenue.toLocaleString()}</p>
                  <p className="text-xs tabular-nums text-earth-500">占收入 {revenueMix.otherShare.toFixed(1)}%</p>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs">
                    <DashboardLink href={`/dashboard/transactions?dateFrom=${startDate}&dateTo=${endDate}&revenueGroup=other`} className="text-primary-700">系統交易 →</DashboardLink>
                    <DashboardLink href={`/dashboard/cashbook?month=${month}&dateFrom=${startDate}&dateTo=${endDate}&type=INCOME&categoryGroup=other#cashbook-records`} className="text-primary-700">手動收入 →</DashboardLink>
                  </div>
                </div>
              </div>
              <div className="mt-3 grid gap-2 border-t border-earth-100 pt-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                <div><span className="text-earth-500">退款前收入</span><p className="font-semibold tabular-nums">NT$ {revenueMix.grossRevenue.toLocaleString()}</p></div>
                <div><span className="text-earth-500">退款</span><p className="font-semibold tabular-nums">-NT$ {revenueMix.refunds.toLocaleString()}</p><DashboardLink href={`/dashboard/transactions?dateFrom=${startDate}&dateTo=${endDate}&revenueGroup=refund`} className="text-xs text-primary-700">查看明細 →</DashboardLink></div>
                <div><span className="text-earth-500">已記錄支出</span><p className="font-semibold tabular-nums">-NT$ {revenueMix.expense.toLocaleString()}</p><DashboardLink href={`/dashboard/cashbook?month=${month}&dateFrom=${startDate}&dateTo=${endDate}&type=EXPENSE#cashbook-records`} className="text-xs text-primary-700">查看明細 →</DashboardLink></div>
                <div><span className="text-earth-500">收支結餘</span><p className="font-semibold tabular-nums text-primary-700">NT$ {revenueMix.balance.toLocaleString()}</p></div>
              </div>
              <p className="mt-2 text-[11px] text-earth-500">待確認收款 NT$ {revenueMix.pendingRevenue.toLocaleString()} <DashboardLink href={`/dashboard/transactions?dateFrom=${startDate}&dateTo=${endDate}&revenueGroup=pending`} className="text-primary-700">查看待收明細 →</DashboardLink></p>
              <p className="mt-2 text-[11px] text-earth-400">
                退款後營收 NT$ {revenueMix.netRevenue.toLocaleString()}；收支結餘＝退款後營收－已記錄支出。零售依現金帳「零售-」分類辨識；其他收入含體驗、單次、補差額及其餘手動收入。這不是含商品成本與應付帳款的會計淨利。
              </p>
              <RevenueMixTrend points={sixMonthRevenueMixTrend ?? []} />
            </>
          ) : (
            <p className="mt-3 rounded-lg bg-earth-50 px-3 py-2 text-xs text-earth-500">請先選擇店舖查看營收結構與收支。</p>
          )}
        </section>

        <section aria-labelledby="customer-flow-title" className="rounded-xl border border-earth-200 bg-white p-3">
          <div>
            <h2 id="customer-flow-title" className="text-sm font-semibold text-earth-800">客流分析</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-earth-400">
              所選期間的來客去重計算；體驗另列到店人次與組數，多人同行依實際到店人次計。
            </p>
          </div>
          {customerFlowMetrics ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {[
                [`${periodWord}來客數`, customerFlowMetrics.uniqueVisitors, "monthly-customers", "位"],
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
                      <p>較前期：{formatCustomerFlowComparison(value.mom, unit as string)}</p>
                      <p>去年同期：{formatCustomerFlowComparison(value.yoy, unit as string)}</p>
                    </div>
                    {segment ? (
                      <DashboardLink href={growthLink(segment as string)} className="mt-2 inline-flex text-[11px] font-medium text-primary-700 hover:text-primary-800">查看顧客 →</DashboardLink>
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
              首次開卡依所選期間的有效購買日期統計；區分期間內體驗開卡與之前體驗、期間內開卡，不含續卡。
            </p>
          </div>
          {conversionMetrics ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
              {[
                ["體驗人次", conversionMetrics.trialAttendees, "count", null, "人次"],
                [`${periodWord}體驗開卡`, conversionMetrics.currentTrialConversions, "count", "monthly-current-trial-converted", "位"],
                ["追蹤開卡", conversionMetrics.trackedConversions, "count", "monthly-tracked-converted", "位"],
                [`${periodWord}總開卡`, conversionMetrics.convertedCustomers, "count", "monthly-converted", "位"],
                [`${periodWord}體驗開卡率`, conversionMetrics.conversionRate, "rate", null, "%"],
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
                      <p>較前期：{formatConversionComparison(value.mom, isRate, unit as string)}</p>
                      <p>去年同期：{formatConversionComparison(value.yoy, isRate, unit as string)}</p>
                    </div>
                    {segment ? (
                      <DashboardLink href={growthLink(segment as string)} className="mt-2 inline-flex text-[11px] font-medium text-primary-700 hover:text-primary-800">查看顧客 →</DashboardLink>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 rounded-lg bg-earth-50 px-3 py-2 text-xs text-earth-500">HQ 全店視角暫不提供成交分析；請先選擇店舖，避免跨店顧客被錯誤加總。</p>
          )}
        </section>

        {trialSourceMetrics ? (
          <section aria-labelledby="trial-source-title" className="rounded-xl border border-earth-200 bg-white p-3">
            <h2 id="trial-source-title" className="text-sm font-semibold text-earth-800">體驗預約來源</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-earth-500">
              依本期建立的體驗預約統計；到店與方案指派會隨後續結果更新。來源來自專屬預約連結，
              並非登入方式。第 5 類「其他／未記錄」包含未帶來源連結與舊資料。
            </p>
            <p className="mt-2 text-sm font-medium text-earth-700">整體體驗到店率 <strong className="tabular-nums text-primary-800">{trialArrivalRate.toFixed(1)}%</strong><span className="ml-2 text-xs font-normal text-earth-500">完成 {trialArrivals} 人次／預約 {trialBookings} 人</span></p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-earth-100 text-xs text-earth-500">
                  <tr>
                    <th className="py-2 pr-3 font-medium">來源</th>
                    <th className="px-3 py-2 text-right font-medium">預約組數</th>
                    <th className="px-3 py-2 text-right font-medium">來源占比</th>
                    <th className="px-3 py-2 text-right font-medium">預約人數</th>
                    <th className="px-3 py-2 text-right font-medium">完成服務</th>
                    <th className="px-3 py-2 text-right font-medium">到店率</th>
                    <th className="px-3 py-2 text-right font-medium">已指派方案</th>
                    <th className="pl-3 py-2 text-right font-medium">方案轉換率</th>
                  </tr>
                </thead>
                <tbody>
                  {trialSourceMetrics.map((row) => (
                    <tr key={row.source} className="border-b border-earth-50 last:border-0">
                      <th scope="row" className="py-2 pr-3 font-medium text-earth-800"><DashboardLink href={`/dashboard/bookings/source?source=${row.source}&startDate=${startDate}&endDate=${endDate}`} className="text-primary-700 hover:underline">{row.label} →</DashboardLink></th>
                      <td className="px-3 py-2 text-right tabular-nums">{row.bookings}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.sourceShare.toFixed(1)}%</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.bookedPeople}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.attendees}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.attendanceRate.toFixed(1)}%</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.assignedCustomers}</td>
                      <td className="pl-3 py-2 text-right tabular-nums">{row.planRate.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-earth-400">
              點來源可查看預約明細。來源占比＝該來源預約組數÷本期全部體驗預約組數；到店率＝完成服務人次÷預約人數；方案轉換率＝已指派正式方案顧客÷完成服務且已建檔顧客。多人同行未個別建檔者無法計入方案轉換率；指派方案不等於已確認收款。
            </p>
          </section>
        ) : null}

        {performanceTrends ? <PerformanceTrendChart data={performanceTrends} /> : null}

        <section aria-labelledby="retention-analysis-title" className="rounded-xl border border-earth-200 bg-white p-3">
          <div>
            <h2 id="retention-analysis-title" className="text-sm font-semibold text-earth-800">留存分析</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-earth-400">{periodRanges.previousFull.startDate}～{periodRanges.previousFull.endDate} 來過的顧客，有多少在 {startDate}～{effectiveEndDate} 再次回來？僅計完成服務的唯一顧客。</p>
          </div>
          {retentionMetrics ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                [`${periodWord}回流人數`, retentionMetrics.returnedCustomers, "count", "monthly-returned"],
                ["顧客回流率", retentionMetrics.retentionRate, "rate", null],
                [`${periodWord}未回流人數`, retentionMetrics.unreturnedCustomers, "count", "monthly-not-returned"],
              ].map(([label, metric, kind, segment]) => {
                const value = metric as (typeof retentionMetrics)["returnedCustomers"];
                const isRate = kind === "rate";
                return (
                  <div key={label as string} className="rounded-lg bg-earth-50/70 p-3">
                    <p className="text-[11px] font-medium text-earth-500">{label as string}</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-earth-900">{isRate ? `${value.current.toFixed(1)}%` : `${value.current} 位`}</p>
                    <div className="mt-2 space-y-1 text-[11px] text-earth-500">
                      <p>較前期：{formatRetentionComparison(value.mom, isRate)}</p>
                      <p>去年同期：{formatRetentionComparison(value.yoy, isRate)}</p>
                    </div>
                    {segment ? (
                      <DashboardLink href={growthLink(segment as string)} className="mt-2 inline-flex text-[11px] font-medium text-primary-700 hover:text-primary-800">查看顧客 →</DashboardLink>
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
