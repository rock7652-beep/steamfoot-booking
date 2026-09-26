import { getSpaAnalysis } from "@/server/queries/spa-analysis";
import { getIndustryRevenueMix, getIndustrySixMonthRevenueMixTrend } from "@/server/queries/industry-revenue-mix";
import { analysisComparisonRanges, resolveAnalysisRange } from "@/lib/date-utils";
import { PageHeader, PageShell, KpiStrip } from "@/components/desktop";
import ReportDateRange from "@/components/report-date-range";
import { RevenueMixTrend } from "@/components/revenue-mix-trend";
import { checkPermission } from "@/lib/permissions";
import { hasDataExportFeature } from "@/lib/data-export-gate";
import type { getCurrentUser } from "@/lib/session";

type Params = { preset?: string; startDate?: string; endDate?: string; month?: string };

function Metric({ label, value, detail, change }: { label: string; value: string; detail?: string; change?: { previous: number | null; year: number | null } }) {
  const format = (amount: number | null) => amount === null ? "—" : `${amount > 0 ? "+" : ""}${amount.toFixed(1)}%`;
  return <div className="rounded-xl border border-earth-200 bg-white p-4">
    <p className="text-sm text-earth-600">{label}</p>
    <strong className="mt-2 block text-2xl text-primary-900">{value}</strong>
    {detail && <p className="mt-1 text-xs text-earth-500">{detail}</p>}
    {change && <p className="mt-2 text-xs text-earth-500">較前期 {format(change.previous)} · 去年同期 {format(change.year)}</p>}
  </div>;
}

export async function SpaAnalysisPage({ storeId, params, user, isViewMode }: { storeId: string; params: Params; user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>; isViewMode: boolean }) {
  const selection = resolveAnalysisRange(params);
  const { startDate, endDate, preset } = selection;
  const effectiveEndDate = analysisComparisonRanges(selection, preset).current.endDate;
  const [canSeeMoney, canExport] = await Promise.all([
    checkPermission(user.role, user.staffId, "transaction.read"),
    !isViewMode && checkPermission(user.role, user.staffId, "report.export").then(allowed => allowed && hasDataExportFeature(storeId)),
  ]);
  const [report, revenue, trend] = await Promise.all([
    getSpaAnalysis(storeId, selection, preset),
    canSeeMoney ? getIndustryRevenueMix(storeId, startDate, effectiveEndDate) : null,
    canSeeMoney ? getIndustrySixMonthRevenueMixTrend(storeId) : null,
  ]);
  const data = report.current;
  const change = report.comparisons;
  const period = `${startDate}～${report.periods.current.endDate}`;
  return <PageShell>
    <PageHeader title="營運分析" subtitle={`${period} · SPA`} actions={canExport ? <a className="rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700" href={`/api/export/spa-analysis?startDate=${startDate}&endDate=${endDate}&preset=${preset}`} download>匯出目前分析</a> : undefined} />
    <ReportDateRange key={`${preset}-${startDate}-${endDate}`} activePreset={preset} startDate={startDate} endDate={endDate} />
    <p className="text-xs text-earth-500">以下數字只計本店 SPA 紀錄，按選取區間統計；較前期與去年同期按相同進度比較。長期趨勢固定顯示最近六個月。</p>

    <section aria-labelledby="spa-summary-title">
      <h2 id="spa-summary-title" className="mb-2 text-sm font-semibold text-earth-800">營運摘要</h2>
      <KpiStrip items={[
        ...(revenue ? [{ label: "本期已收營收", value: `NT$ ${revenue.netRevenue.toLocaleString()}`, tone: "primary" as const }] : []),
        { label: "完成服務", value: `${data.serviceVisits} 人次`, tone: "green" },
        { label: "體驗服務", value: `${data.trialVisits} 人次`, tone: "blue" },
        ...(revenue ? [{ label: "退款", value: `NT$ ${revenue.refunds.toLocaleString()}`, tone: "amber" as const }] : []),
      ]} />
    </section>

    <section aria-labelledby="spa-customer-title">
      <h2 id="spa-customer-title" className="mb-2 text-sm font-semibold text-earth-800">客流與開卡</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="不重複來客" value={`${data.visitors} 人`} change={change.visitors} />
        <Metric label="首次到店" value={`${data.newCustomers} 人`} change={change.newCustomers} />
        <Metric label="購買方案" value={`${data.packageCustomers} 人`} change={change.packageCustomers} />
        <Metric label="體驗開卡率" value={`${data.conversionRate.toFixed(1)}%`} detail={`${data.converted} / ${data.trialCustomers} 位完成體驗顧客於本期購買方案`} change={change.conversionRate} />
      </div>
    </section>

    <section aria-labelledby="spa-retention-title">
      <h2 id="spa-retention-title" className="mb-2 text-sm font-semibold text-earth-800">回流分析</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Metric label="回流顧客" value={`${data.returned} 人`} detail={`前期完成服務 ${data.retentionBase} 人；本期再次完成服務`} change={change.returned} />
        <Metric label="回流率" value={`${data.retentionRate.toFixed(1)}%`} detail={`${data.returned} / ${data.retentionBase} 位前期顧客`} change={change.retentionRate} />
      </div>
    </section>

    {revenue && <section aria-labelledby="spa-revenue-title" className="rounded-xl border border-earth-200 bg-white p-4">
      <h2 id="spa-revenue-title" className="text-sm font-semibold text-earth-800">營收結構與收支</h2>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <p>方案與儲值 <strong className="block">NT$ {revenue.packageRevenue.toLocaleString()}</strong></p>
        <p>服務與其他 <strong className="block">NT$ {revenue.otherRevenue.toLocaleString()}</strong></p>
        <p>零售 <strong className="block">NT$ {revenue.retailRevenue.toLocaleString()}</strong></p>
        <p>收支結餘 <strong className="block">NT$ {revenue.balance.toLocaleString()}</strong></p>
      </div>
    </section>}
    {trend && <section className="rounded-xl border border-earth-200 bg-white p-4" aria-label="最近六個月營收趨勢"><RevenueMixTrend points={trend} /></section>}
  </PageShell>;
}
