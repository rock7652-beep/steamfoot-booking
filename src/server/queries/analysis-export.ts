import { monthlyStoreSummary, monthlyRevenueByCategory } from "./report";
import { getIndustryRevenueMix } from "./industry-revenue-mix";
import { getAnalysisPeriodMetrics } from "./analysis-period";
import { analysisComparisonRanges, resolveAnalysisRange } from "@/lib/date-utils";

/** Caller must enforce report.export and the store export entitlement before entering. */
export async function analysisExportRows(storeId: string, params: URLSearchParams, staffOnly: boolean) {
  const selection = resolveAnalysisRange(Object.fromEntries(params));
  const { current } = analysisComparisonRanges(selection, selection.preset);
  const month = current.startDate.slice(0, 7);
  const opts = { ...current, activeStoreId: storeId };
  const [summary, categories, mix, facts] = await Promise.all([
    monthlyStoreSummary(month, opts), monthlyRevenueByCategory(month, opts),
    getIndustryRevenueMix(storeId, current.startDate, current.endDate),
    getAnalysisPeriodMetrics(storeId, selection, selection.preset),
  ]);
  const rows: (string | number)[][] = [["開始日期", current.startDate], ["結束日期", current.endDate]];
  if (!staffOnly) rows.push(
    ["已收營收", mix.netRevenue], ["完成服務人次", facts.metrics.completedServices.current],
    ["體驗人次", facts.metrics.trialAttendees.current], ["開卡人數", facts.metrics.convertedCustomers.current],
    ["儲值方案", mix.packageRevenue], ["零售", mix.retailRevenue], ["其他收入", mix.otherRevenue],
    ["退款", mix.refunds], ["已記錄支出", mix.expense], ["收支結餘", mix.balance], ["待確認收款", mix.pendingRevenue],
  );
  rows.push([], ["店長", "期間顧客", "完成服務紀錄筆數", "訂單數", "系統收入", "涵蓋月份空間費（非按日分攤）", "系統收入減涵蓋月份空間費"]);
  for (const r of summary.staffBreakdown) rows.push([r.staffName, r.customerCount, r.completedBookings, r.transactionCount, r.totalRevenue, r.spaceFee, r.netRevenue]);
  rows.push([], ["店長", "體驗收入", "單次收入", "方案收入", "補差額", "退款", "系統淨收"]);
  for (const r of categories) rows.push([r.staffName, r.trialRevenue, r.singleRevenue, r.packageRevenue, r.supplementRevenue, r.refundAmount, r.netRevenue]);
  return rows.map(r => r.map(String));
}
