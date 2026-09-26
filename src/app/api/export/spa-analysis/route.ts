import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { resolveStoreViewContextFromCookie } from "@/lib/store-view-context-server";
import { requireDataExportFeature } from "@/lib/data-export-gate";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { analysisComparisonRanges, isAnalysisDate, resolveAnalysisRange } from "@/lib/date-utils";
import { getSpaAnalysis } from "@/server/queries/spa-analysis";
import { getIndustryRevenueMix } from "@/server/queries/industry-revenue-mix";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
  const user = session.user;
  if (!(await checkPermission(user.role, user.staffId, "report.read")) || !(await checkPermission(user.role, user.staffId, "report.export"))) return new NextResponse("Forbidden", { status: 403 });
  if ((await resolveStoreViewContextFromCookie(user))?.isViewMode) return new NextResponse("查看模式不可匯出", { status: 403 });
  const storeId = await getActiveStoreForRead(user);
  if (!storeId || await getStoreIndustryModule(storeId) !== "spa" || !(await hasStoreFeature(storeId, FEATURES.BASIC_REPORTS))) return new NextResponse("分析未開通", { status: 403 });
  const gate = await requireDataExportFeature(storeId);
  if (gate) return gate;
  const params = Object.fromEntries(request.nextUrl.searchParams);
  if ((params.startDate || params.endDate) && (!isAnalysisDate(params.startDate) || !isAnalysisDate(params.endDate) || params.startDate > params.endDate)) return new NextResponse("日期格式不正確", { status: 400 });
  const selection = resolveAnalysisRange(params);
  const effectiveEndDate = analysisComparisonRanges(selection, selection.preset).current.endDate;
  const report = await getSpaAnalysis(storeId, selection, selection.preset);
  const data = report.current;
  const rows: Array<[string, string | number]> = [
    ["開始日期", selection.startDate], ["結束日期", effectiveEndDate], ["完成服務人次", data.serviceVisits],
    ["不重複來客人數", data.visitors], ["首次到店人數", data.newCustomers], ["體驗服務人次", data.trialVisits],
    ["體驗顧客人數", data.trialCustomers], ["購買方案人數", data.packageCustomers], ["本期體驗開卡人數", data.converted],
    ["體驗開卡率", `${data.conversionRate.toFixed(1)}%`], ["前期完成服務顧客", data.retentionBase],
    ["本期回流人數", data.returned], ["回流率", `${data.retentionRate.toFixed(1)}%`],
  ];
  if (await checkPermission(user.role, user.staffId, "transaction.read")) {
    const revenue = await getIndustryRevenueMix(storeId, selection.startDate, effectiveEndDate);
    rows.push(["本期已收營收", revenue.netRevenue], ["方案與儲值", revenue.packageRevenue], ["服務與其他", revenue.otherRevenue], ["零售", revenue.retailRevenue], ["退款", revenue.refunds], ["已記錄支出", revenue.expense], ["收支結餘", revenue.balance]);
  }
  const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
  return new NextResponse("\uFEFF" + csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="spa-analysis-${selection.startDate}-${effectiveEndDate}.csv"`, "Cache-Control": "no-store" } });
}
