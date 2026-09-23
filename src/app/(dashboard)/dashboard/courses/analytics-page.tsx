import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { hasDataExportFeature } from "@/lib/data-export-gate";
import { resolveStoreViewContextFromCookie } from "@/lib/store-view-context-server";
import { courseAnalysisRange } from "@/lib/course-analytics";
import { getCourseBusinessAnalytics } from "@/server/queries/course-business-analytics";
import { resolveBusinessScope } from "@/lib/course-business-analytics";
import { BusinessAnalyticsView } from "./business-analytics-view";
import { PageShell, PageHeader } from "@/components/desktop";
import { DashboardLink } from "@/components/dashboard-link";
import { UpgradeNoticePage } from "@/components/upgrade-notice";
import ReportDateRange from "@/components/report-date-range";
import { AnalysisReturnState } from "./analysis-return-state";
import { getIndustrySixMonthRevenueMixTrend } from "@/server/queries/industry-revenue-mix";
import { RevenueMixTrend } from "@/components/revenue-mix-trend";

export async function CourseAnalyticsPage({params}:{params:{preset?:string;startDate?:string;endDate?:string;month?:string;perspective?:string;person?:string}}) {
  const user=await getCurrentUser();
  if(!user || !(await checkPermission(user.role,user.staffId,"report.read"))) notFound();
  const storeId=await getActiveStoreForRead(user);
  if(!storeId || await getStoreIndustryModule(storeId)!=="course") notFound();
  if(!(await hasStoreFeature(storeId,FEATURES.BASIC_REPORTS))) return <UpgradeNoticePage title="營運分析尚未開通" description="請聯絡店長確認分析功能開通設定。"/>;
  const all=user.role==="OWNER"||user.role==="ADMIN";
  let range,scope;
  try { range=courseAnalysisRange(params); scope=resolveBusinessScope(params,all,user.staffId); }
  catch {return <PageShell><PageHeader title="營運分析"/><p role="alert">日期或分析對象不正確，或沒有檢視權限。</p><DashboardLink href="/dashboard/courses?view=analytics">返回本月分析</DashboardLink></PageShell>;}
  const [money,customers,cash]=await Promise.all([checkPermission(user.role,user.staffId,"transaction.read"),checkPermission(user.role,user.staffId,"customer.read"),checkPermission(user.role,user.staffId,"cashbook.read")]);
  const canExport=!(await resolveStoreViewContextFromCookie(user))?.isViewMode && await checkPermission(user.role,user.staffId,"report.export") && await hasDataExportFeature(storeId);
  let data;
  try {data=await getCourseBusinessAnalytics(storeId,range,scope,{money,customers,fees:cash&&user.role==="OWNER"});} catch(error) {if(error instanceof Error&&error.message==="找不到本店分析對象") notFound();throw error;}
  if(!all) data.staff=data.staff.filter(s=>s.id===user.staffId);
  const revenuePoints=money&&scope.view==="store" ? await getIndustrySixMonthRevenueMixTrend(storeId) : null;
  const query=new URLSearchParams({...range,perspective:scope.view,person:scope.person,report:"business"});
  return <AnalysisReturnState scope={`${user.id}:${storeId}:${range.startDate}:${range.endDate}:${scope.view}:${scope.person}`}><PageShell>
    <PageHeader title="營運分析" subtitle={`${range.startDate} ～ ${range.endDate} · 台灣時間`} actions={<>{canExport&&<a className="rounded-md border border-earth-200 px-3 py-2 text-sm" href={`/api/export/course-analysis?${query}`} download>匯出目前分析</a>}{money&&<DashboardLink href="/dashboard/store-revenue" className="rounded-md border border-earth-200 px-3 py-2 text-sm">收款明細</DashboardLink>}</>}/>
    <ReportDateRange key={`${range.startDate}-${range.endDate}`} activePreset={params.startDate?"custom":params.preset??"month"} {...range} preserveQuery/>
    <BusinessAnalyticsView key={`${range.startDate}:${range.endDate}:${scope.view}:${scope.person}`} data={data} all={all} staffId={user.staffId}/>
    {revenuePoints&&<section className="rounded-xl border border-earth-200 bg-white p-4" aria-label="營收結構與收支"><RevenueMixTrend points={revenuePoints}/></section>}
  </PageShell></AnalysisReturnState>;
}
