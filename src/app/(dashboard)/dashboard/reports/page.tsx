import { getCustomerCareSummary } from "@/server/queries/customer-care";
import { getMonthlyUnconvertedCustomers } from "@/server/queries/conversion-metrics";
import { userForViewContext } from "@/lib/store-view-context-server";
import {
  monthlyStoreSummary,
  monthlyRevenueByCategory,
} from "@/server/queries/report";
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
import { toLocalDateStr, resolveAnalysisRange, analysisComparisonRanges, formatTWDateTime } from "@/lib/date-utils";
import {
  PageShell,
  PageHeader,
  DataTable,
  EmptyRow,
  type Column,
} from "@/components/desktop";
import { DashboardLink } from "@/components/dashboard-link";
import { PerformanceTrendChart } from "./performance-trend-chart";
import { getAnalysisPeriodMetrics } from "@/server/queries/analysis-period";
import { Suspense } from "react";
import { AnalysisRefresh } from "./analysis-refresh";
import { MonthlyVisitorOverview } from "./monthly-visitor-overview";
import { FocusTable } from "./focus-table";

interface PageProps {
  searchParams: Promise<{
    preset?: string;
    startDate?: string;
    endDate?: string;
    month?: string;
    view?: string;
    category?: string;
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

  const selection = resolveAnalysisRange(params);
  const { startDate, endDate, preset: activePreset } = selection;
  const periodRanges = analysisComparisonRanges(selection, activePreset);
  const effectiveEndDate = periodRanges.current.endDate;
  const month = startDate.slice(0, 7);
  const currentMonth = toLocalDateStr().slice(0, 7);
  const timer = new ServerTiming("/dashboard/reports");
  type StoreSummary = Awaited<ReturnType<typeof monthlyStoreSummary>>;
  type RevenueByCategory = Awaited<ReturnType<typeof monthlyRevenueByCategory>>;
  const dateRangeOpts = { startDate, endDate: effectiveEndDate, activeStoreId: reportsStoreId };
  // Live queries: month snapshots could disagree with fresh period KPIs after a correction.
  const [storeSummary, revenueByCategory, plan, periodMetrics, trialSourceMetrics, revenueMix, previousRevenueMix] = await Promise.all([
    withTiming("monthlyStoreSummary", timer, () => monthlyStoreSummary(month, dateRangeOpts)),
    withTiming("monthlyRevenueByCategory", timer, () => monthlyRevenueByCategory(month, dateRangeOpts)),
    getCachedStorePlan(reportsStoreId ?? user.storeId ?? undefined),
    reportsStoreId ? getAnalysisPeriodMetrics(reportsStoreId, selection, activePreset) : null,
    reportsStoreId ? getTrialSourceMetrics(reportsStoreId, startDate, effectiveEndDate) : null,
    reportsStoreId ? getIndustryRevenueMix(reportsStoreId, startDate, effectiveEndDate) : null,
    reportsStoreId ? getIndustryRevenueMix(reportsStoreId, periodRanges.previous.startDate, periodRanges.previous.endDate) : null,
  ]);
  timer.finish();
  const customerFlowMetrics = periodMetrics?.metrics;
  const conversionMetrics = periodMetrics?.metrics;
  const retentionMetrics = periodMetrics?.metrics;
  const totalOrders = storeSummary.staffBreakdown.reduce((s, r) => s + r.transactionCount, 0);
  const totalRevenue = revenueMix?.netRevenue ?? storeSummary.netCourseRevenue + storeSummary.cashbookIncome;
  const completedServices = periodMetrics?.metrics.completedServices.current;
  const rangeQuery = `startDate=${startDate}&endDate=${endDate}&preset=${activePreset}`;
  const growthLink = (segment: string) => `/dashboard/growth?segment=${segment}&${rangeQuery}`;
  type StaffRow = StoreSummary["staffBreakdown"][number];
  const staffColumns: Column<StaffRow>[] = [
    { key: "name", header: "店長", accessor: r => <span className="break-words font-medium">{r.staffName}</span> },
    { key: "completed", header: "服務紀錄", align: "right", accessor: r => <span className="tabular-nums">{r.completedBookings} 筆</span> },
    { key: "revenue", header: "系統收入", align: "right", accessor: r => <span className="tabular-nums">NT$ {r.totalRevenue.toLocaleString()}</span> },
    { key: "details", header: "其他數據", accessor: r => <div className="py-2 text-xs">
      <dl className="space-y-1 [&>div]:flex [&>div]:flex-wrap [&>div]:justify-between [&>div]:gap-x-2 [&_dd]:tabular-nums">
        <div><dt>顧客數／活躍顧客數</dt><dd>{r.customerCount}／{r.activeCustomerCount} 位</dd></div>
        <div><dt>訂單</dt><dd>{r.transactionCount} 筆</dd></div>
        <div><dt>涵蓋月份空間費</dt><dd>NT$ {r.spaceFee.toLocaleString()}</dd></div>
        <div><dt>扣空間費後淨收</dt><dd>NT$ {r.netRevenue.toLocaleString()}</dd></div>
      </dl>
    </div> },
  ];

  type CategoryRow = RevenueByCategory[number];
  const categoryColumns: Column<CategoryRow>[] = [
    { key: "name", header: "店長", accessor: (r) => <span className="break-words text-sm font-medium text-earth-900">{r.staffName}</span> },
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
      <PageShell className="mx-auto flex w-full min-w-0 max-w-[1440px] flex-col gap-3 px-3 py-3 sm:px-6">
        <PageHeader
          title="營運分析"
          actions={
            <>
              {isViewMode ? (
                <span className="rounded-md border border-earth-200 bg-earth-50 px-3 py-1.5 text-xs font-medium text-earth-500">查看模式不可匯出</span>
              ) : !canExportData ? (
                <span className="rounded-md border border-earth-200 bg-earth-50 px-3 py-1.5 text-xs font-medium text-earth-500">{dataExportLockedLabel}</span>
              ) : (
                <details className="relative">
                  <summary className="cursor-pointer rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700">匯出 CSV</summary>
                  <div className="absolute right-0 z-20 mt-1 flex min-w-36 flex-col gap-1 rounded-lg border border-earth-200 bg-white p-2 shadow-lg">
                  <a href={`/api/export/store-monthly?month=${month}&${rangeQuery}`} className="rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50" download>全店 CSV</a>
                  <a href={`/api/export/staff-monthly?month=${month}&${rangeQuery}`} className="rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50" download>店長 CSV</a>
                  </div>
                </details>
              )}
            </>
          }
        />

        <ReportDateRange key={`${activePreset}-${startDate}-${endDate}`} activePreset={activePreset} startDate={startDate} endDate={endDate} enhanced compact />
        <>
          <FocusTable currentDates={`${startDate}～${effectiveEndDate}`} previousDates={`${periodRanges.previous.startDate}～${periodRanges.previous.endDate}`} rows={[
            { label: "來客人數", current: customerFlowMetrics?.uniqueVisitors.current, difference: customerFlowMetrics?.uniqueVisitors.mom.difference, unit: "位", href: growthLink("monthly-customers") },
            { label: "完成服務人次", current: completedServices, difference: periodMetrics?.metrics.completedServices.mom.difference, unit: "人次", href: `/analysis-details?segment=services&${rangeQuery}` },
            { label: "體驗人次", current: conversionMetrics?.trialAttendees.current, difference: conversionMetrics?.trialAttendees.mom.difference, unit: "人次", href: `/analysis-details?segment=trials&${rangeQuery}` },
            { label: "首次開卡人數", current: conversionMetrics?.convertedCustomers.current, difference: conversionMetrics?.convertedCustomers.mom.difference, unit: "位", href: growthLink("monthly-converted") },
            { label: "已收營收", current: totalRevenue, difference: previousRevenueMix ? totalRevenue - previousRevenueMix.netRevenue : null, unit: "元", href: "#revenue-mix-title" },
          ]} />
          {!reportsStoreId && <p className="text-xs text-earth-500">請選擇店舖查看來客、服務與開卡數據。</p>}
          {reportsStoreId && <Suspense fallback={<p role="status" className="text-xs text-earth-500">每月來客概況載入中…</p>}><MonthlyVisitorOverview storeId={reportsStoreId} onlyPreviousMonth={activePreset === "month" && startDate === `${currentMonth}-01` && effectiveEndDate === toLocalDateStr()} /></Suspense>}
          {reportsStoreId && <Suspense fallback={<p className="text-xs text-earth-500">待跟進摘要載入中…</p>}><AnalysisFollowUps user={userForViewContext(user, storeViewContext)} storeId={reportsStoreId} month={currentMonth} /></Suspense>}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <details className="max-w-xl text-xs text-earth-600"><summary className="cursor-pointer py-2 text-primary-700">數字怎麼算？</summary>
              <p>來客人數：已建檔顧客，同一人只計 1 位。服務與體驗按實際完成人次計算。首次開卡：體驗後首次購買正式方案，不含續卡。</p>
              <p className="mt-2">同行者未個別建檔時，顧客名單可能少於服務人次。比較期間為 0 時只顯示增減數，不計百分比。</p>
              <p className="mt-2">訂單 {totalOrders} 筆｜退款 NT$ {Math.abs(revenueMix?.refunds ?? storeSummary.totalRefund).toLocaleString()}。已收營收為已確認收入扣除退款，包含手動收入 NT$ {(revenueMix?.manualIncome ?? storeSummary.cashbookIncome).toLocaleString()}。</p>
            </details>
            <AnalysisRefresh updatedAt={formatTWDateTime()} />
          </div>
        </>
        {<section aria-labelledby="revenue-mix-title" className="rounded-xl border border-earth-200 bg-white p-3">
          <h2 id="revenue-mix-title" className="text-sm font-semibold text-earth-800">營收結構與收支</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-earth-500">
            依上方選定期間統計已確認收款；待收款另列。分類占比以退款前的已收收入為分母；退款另列，支出只計已記錄的支出項目，提款不當作支出。
          </p>
          {revenueMix ? (
            <>
              <div className="mt-3 divide-y divide-earth-100 border-y border-earth-100">
                {[
                  { label: "儲值方案", amount: revenueMix.packageRevenue, share: revenueMix.packageShare, href: `/dashboard/transactions?dateFrom=${startDate}&dateTo=${endDate}&revenueGroup=package` },
                  { label: "零售", amount: revenueMix.retailRevenue, share: revenueMix.retailShare, href: `/dashboard/cashbook?month=${month}&dateFrom=${startDate}&dateTo=${endDate}&type=INCOME&categoryGroup=retail#cashbook-records` },
                ].map(({ label, amount, share, href }) => (
                  <div key={label} className="grid grid-cols-2 items-center gap-x-4 gap-y-1 py-2 text-sm sm:grid-cols-4">
                    <p className="text-xs font-medium text-earth-500">{label}</p>
                    <p className="text-right text-sm font-semibold tabular-nums text-earth-900">NT$ {amount.toLocaleString()}</p>
                    <p className="text-xs tabular-nums text-earth-500">占收入 {share.toFixed(1)}%</p>
                    <DashboardLink href={href} className="mt-1 inline-flex text-xs text-primary-700">查看明細 →</DashboardLink>
                  </div>
                ))}
                <div className="grid grid-cols-2 items-center gap-x-4 gap-y-1 py-2 text-sm sm:grid-cols-4">
                  <p className="text-xs font-medium text-earth-500">其他收入</p>
                  <p className="text-right text-sm font-semibold tabular-nums text-earth-900">NT$ {revenueMix.otherRevenue.toLocaleString()}</p>
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
            </>
          ) : (
            <p className="mt-3 rounded-lg bg-earth-50 px-3 py-2 text-xs text-earth-500">請先選擇店舖查看營收結構與收支。</p>
          )}
        </section>}

        {<><section aria-labelledby="customer-flow-title" className="rounded-xl border border-earth-200 bg-white p-3">
          <div>
            <h2 id="customer-flow-title" className="text-sm font-semibold text-earth-800">客流分析</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-earth-400">
              來客為不重複人數；同一人來多次只計 1 位。體驗人次與預約組數分開計算。
            </p>
          </div>
          {customerFlowMetrics ? (
            <DetailMetrics ranges={periodRanges} rows={[
                { label: "來客人數", metric: customerFlowMetrics.uniqueVisitors, unit: "位", href: growthLink("monthly-customers") },
                { label: "新客人數", metric: customerFlowMetrics.newVisitors, unit: "位", href: growthLink("monthly-new") },
                { label: "舊客人數", metric: customerFlowMetrics.returningVisitors, unit: "位", href: growthLink("monthly-returning") },
                { label: "體驗人次", metric: customerFlowMetrics.trialAttendees, unit: "人次", href: `/analysis-details?segment=trials&${rangeQuery}` },
                { label: "體驗組數", metric: customerFlowMetrics.trialBookingGroups, unit: "組", href: growthLink("trials") },
              ]} />
          ) : (
            <p className="mt-3 rounded-lg bg-earth-50 px-3 py-2 text-xs text-earth-500">HQ 全店視角暫不提供客流唯一顧客數；請先選擇店舖，避免跨店重複顧客被錯誤加總。</p>
          )}
        </section>

        <section aria-labelledby="conversion-analysis-title" className="rounded-xl border border-earth-200 bg-white p-3">
          <div>
            <h2 id="conversion-analysis-title" className="text-sm font-semibold text-earth-800">成交分析</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-earth-400">
              首次開卡＝體驗後首次購買正式方案，不含續卡；依首次有效購買日期統計。
            </p>
          </div>
          {conversionMetrics ? (
            <DetailMetrics ranges={periodRanges} rows={[
                { label: "期間內體驗並開卡", metric: conversionMetrics.currentTrialConversions, unit: "位", href: growthLink("monthly-current-trial-converted") },
                { label: "之前體驗、期間內開卡", metric: conversionMetrics.trackedConversions, unit: "位", href: growthLink("monthly-tracked-converted") },
                { label: "首次開卡人數", metric: conversionMetrics.convertedCustomers, unit: "位", href: growthLink("monthly-converted") },
                { label: "期間內體驗開卡率", metric: conversionMetrics.conversionRate, unit: "%" },
                { label: "未開卡人次", metric: conversionMetrics.unconvertedCustomers, unit: "人次" },
              ]} />
          ) : (
            <p className="mt-3 rounded-lg bg-earth-50 px-3 py-2 text-xs text-earth-500">HQ 全店視角暫不提供成交分析；請先選擇店舖，避免跨店顧客被錯誤加總。</p>
          )}
        </section></>}

        {trialSourceMetrics ? (
          <section aria-labelledby="trial-source-title" className="rounded-xl border border-earth-200 bg-white p-3">
            <h2 id="trial-source-title" className="text-sm font-semibold text-earth-800">體驗預約來源</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-earth-500">
              依本期建立的體驗預約統計；到店與方案指派會隨後續結果更新。來源來自專屬預約連結，
              並非登入方式。第 5 類「其他／未記錄」包含未帶來源連結與舊資料。
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full table-fixed text-left text-sm">
                <thead className="border-b border-earth-100 text-xs text-earth-500">
                  <tr>
                    <th className="py-2 pr-3 font-medium">來源</th>
                    <th className="px-3 py-2 text-right font-medium">預約組數</th>
                    <th className="px-3 py-2 text-right font-medium">到店人次</th>
                    <th className="px-3 py-2 text-right font-medium">到店率</th>
                    <th className="pl-3 py-2 font-medium">其他數據</th>
                  </tr>
                </thead>
                <tbody>
                  {trialSourceMetrics.map((row) => (
                    <tr key={row.source} className="border-b border-earth-50 last:border-0">
                      <th scope="row" className="py-2 pr-3 font-medium text-earth-800"><DashboardLink href={`/dashboard/bookings/source?source=${row.source}&startDate=${startDate}&endDate=${endDate}`} className="text-primary-700 hover:underline">{row.label} →</DashboardLink></th>
                      <td className="px-3 py-2 text-right tabular-nums">{row.bookings}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.attendees}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.attendanceRate.toFixed(1)}%</td>
                      <td className="pl-3 py-2 text-xs"><dl className="space-y-1 [&>div]:flex [&>div]:flex-wrap [&>div]:justify-between [&>div]:gap-x-2 [&_dd]:tabular-nums">
                        <div><dt>來源占比</dt><dd>{row.sourceShare.toFixed(1)}%</dd></div>
                        <div><dt>預約人數</dt><dd>{row.bookedPeople} 人</dd></div>
                        <div><dt>已指派方案</dt><dd>{row.assignedCustomers} 位</dd></div>
                        <div><dt>方案轉換率</dt><dd>{row.planRate.toFixed(1)}%</dd></div>
                      </dl></td>
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


        {<section aria-labelledby="retention-analysis-title" className="rounded-xl border border-earth-200 bg-white p-3">
          <div>
            <h2 id="retention-analysis-title" className="text-sm font-semibold text-earth-800">顧客回流</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-earth-400">基準顧客日期：{periodRanges.previousFull.startDate}～{periodRanges.previousFull.endDate}；觀察再訪日期：{startDate}～{effectiveEndDate}。僅計完成服務的唯一顧客；統計中不代表流失。</p>
          </div>
          {retentionMetrics ? (
            <DetailMetrics ranges={periodRanges} rows={[
                { label: "再訪人數", metric: retentionMetrics.returnedCustomers, unit: "位", href: growthLink("monthly-returned") },
                { label: "顧客回流率", metric: retentionMetrics.retentionRate, unit: "%" },
                { label: "尚未再訪人數", metric: retentionMetrics.unreturnedCustomers, unit: "位", href: growthLink("monthly-not-returned") },
              ]} />
          ) : (
            <p className="mt-3 rounded-lg bg-earth-50 px-3 py-2 text-xs text-earth-500">HQ 全店視角暫不提供顧客回流；請先選擇店舖，避免跨店顧客被錯誤合併。</p>
          )}
        </section>}

        {<><section className="rounded-xl border border-earth-200 bg-white">
          <div className="flex items-center justify-between px-3 py-2">
            <div>
              <h2 className="text-sm font-semibold text-earth-800">營收分析</h2>
              <p className="text-[11px] text-earth-400">系統交易依體驗、單次與課程拆分；手動收入中的零售另納入總覽營收與零售趨勢。</p>
            </div>
          </div>
          {revenueByCategory.length === 0 ? (
            <EmptyRow title="本期無資料" hint="選擇的期間內沒有收入類型資料" />
          ) : (
            <DataTable columns={categoryColumns} rows={revenueByCategory} rowKey={(r) => r.staffId} className="rounded-none border-0 border-t border-earth-100 [&_table]:min-w-0 [&_table]:table-fixed" />
          )}
        </section>

        <section className="rounded-xl border border-earth-200 bg-white">
          <div className="flex items-center justify-between px-3 py-2">
            <div>
              <h2 className="text-sm font-semibold text-earth-800">店長分析</h2>
              <p className="text-[11px] text-earth-400">比較各店長的期間顧客、服務紀錄、訂單與系統交易表現。空間費為涵蓋月份的已登錄金額，不按日分攤；扣除此費用的數字不代表所選期間利潤。多人實際人次以全店摘要為準。</p>
            </div>
          </div>
          {storeSummary.staffBreakdown.length === 0 ? (
            <EmptyRow title="本期無資料" hint="選擇的期間內沒有店長績效資料" />
          ) : (
            <DataTable columns={staffColumns} rows={storeSummary.staffBreakdown} rowKey={(r) => r.staffId} className="rounded-none border-0 border-t border-earth-100 [&_table]:min-w-0 [&_table]:table-fixed" />
          )}
        </section></>}
        {!reportsStoreId && <p className="text-sm text-earth-600">請選擇店舖查看長期趨勢。</p>}
        {!trialSourceMetrics && <p className="text-sm text-earth-600">請選擇店舖查看體驗來源。</p>}
        {reportsStoreId && <Suspense fallback={<p role="status" className="text-sm text-earth-500">長期趨勢載入中…</p>}><AnalysisTrends storeId={reportsStoreId} month={currentMonth} /></Suspense>}
      </PageShell>
    </FeatureGate>
  );
}

type DetailMetricRow = {
  label: string;
  metric: { current: number; mom: { difference: number; percentage: number | null }; yoy: { difference: number; percentage: number | null } };
  unit: string;
  href?: string;
};

function DetailMetrics({ rows, ranges }: { rows: DetailMetricRow[]; ranges: ReturnType<typeof analysisComparisonRanges> }) {
  return <div className="mt-3 space-y-2">
    <FocusTable currentDates={`${ranges.current.startDate}～${ranges.current.endDate}`} previousDates={`${ranges.previous.startDate}～${ranges.previous.endDate}`} rows={rows.map(row => ({ ...row, current: row.metric.current, difference: row.metric.mom.difference }))} />
    <details className="text-xs text-earth-600">
      <summary className="cursor-pointer py-2 text-primary-700">增減百分比與去年同期</summary>
      <p className="mb-2">去年同期：{ranges.year.startDate}～{ranges.year.endDate}。比較期間為 0 時，不計增減百分比。</p>
      <table className="w-full text-right tabular-nums">
        <thead><tr className="border-b border-earth-200"><th className="py-2 text-left">指標</th><th>較比較期間</th><th>較去年同期增減</th><th>年增減幅度</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.label} className="border-b border-earth-100">
          <th className="py-2 text-left font-medium">{row.label}</th>
          <td>{row.metric.mom.percentage === null ? "—" : `${row.metric.mom.percentage > 0 ? "+" : ""}${row.metric.mom.percentage.toFixed(1)}%`}</td>
          <td>{row.metric.yoy.difference > 0 ? "+" : ""}{row.metric.yoy.difference.toLocaleString(undefined, { maximumFractionDigits: row.unit === "%" ? 1 : 0 })} {row.unit === "%" ? "百分點" : row.unit}</td>
          <td>{row.metric.yoy.percentage === null ? "—" : `${row.metric.yoy.percentage > 0 ? "+" : ""}${row.metric.yoy.percentage.toFixed(1)}%`}</td>
        </tr>)}</tbody>
      </table>
    </details>
  </div>;
}

async function AnalysisTrends({ storeId, month }: { storeId: string; month: string }) {
  const [data, revenue] = await Promise.all([
    getStorePerformanceTrends(storeId, month, 12),
    getIndustrySixMonthRevenueMixTrend(storeId, toLocalDateStr(), 12),
  ]);
  return <PerformanceTrendChart data={data} revenue={revenue} />;
}

async function AnalysisFollowUps({ user, storeId, month }: { user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>; storeId: string; month: string }) {
  if (!(await checkPermission(user.role, user.staffId, "customer.read")) || !(await hasStoreFeature(storeId, FEATURES.CUSTOMER_CARE))) return null;
  const [care, unconverted] = await Promise.all([getCustomerCareSummary(user, storeId), getMonthlyUnconvertedCustomers(storeId, month)]);
  return <section className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" aria-label="目前待跟進">
    <p className="text-earth-500">待追蹤 · 截至 {toLocalDateStr()}</p>
    <div className="flex flex-wrap gap-4 text-xs text-primary-800">
      <DashboardLink href="/dashboard/growth#trial-unconverted">本月體驗未開卡 {unconverted.length} 位 →</DashboardLink>
      <DashboardLink href="/dashboard/growth#expiring">方案即將到期 {care.expiringPlanCustomers} 位 →</DashboardLink>
      <DashboardLink href="/dashboard/growth#inactive">久未到店 {care.inactiveCustomers} 位 →</DashboardLink>
    </div>
  </section>;
}
