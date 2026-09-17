import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/permissions";
import { resolveActiveStoreId } from "@/lib/store";
import { resolveStoreViewContextFromCookie } from "@/lib/store-view-context-server";
import { requireDataExportFeature } from "@/lib/data-export-gate";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { getStoreForPlanByStoreId } from "@/lib/store-plan";
import { checkReportLimit } from "@/lib/usage-gate";
import { courseAnalysisRange } from "@/lib/course-analytics";
import { getCourseAnalytics } from "@/server/queries/course-analytics";

export async function GET(req:NextRequest) {
  const session=await auth();
  if(!session?.user) return new NextResponse("Unauthorized",{status:401});
  const user=session.user;
  if(!(await checkPermission(user.role,user.staffId,"report.export")) || !(await checkPermission(user.role,user.staffId,"report.read"))) return new NextResponse("Forbidden",{status:403});
  if((await resolveStoreViewContextFromCookie(user))?.isViewMode) return new NextResponse("查看模式不可匯出",{status:403});
  const storeId=await resolveActiveStoreId(user,(await cookies()).get("active-store-id")?.value??null);
  if(!storeId || await getStoreIndustryModule(storeId)!=="course" || !(await hasStoreFeature(storeId,FEATURES.BASIC_REPORTS))) return new NextResponse("分析未開通",{status:403});
  const gate=await requireDataExportFeature(storeId);
  if(gate) return gate;
  const plan=await getStoreForPlanByStoreId(storeId);
  if(!plan || !checkReportLimit(plan,0).allowed) return new NextResponse("目前方案未開通報表匯出",{status:403});
  let range;
  try { range=courseAnalysisRange(Object.fromEntries(req.nextUrl.searchParams)); } catch { return new NextResponse("日期格式不正確",{status:400}); }
  const data=await getCourseAnalytics(storeId,range,await checkPermission(user.role,user.staffId,"transaction.read"),await checkPermission(user.role,user.staffId,"cashbook.read"));
  const c=data.current;
  const rows:Array<Array<string|number>>=[
    ["開始日期",range.startDate],["結束日期",range.endDate],["統計口徑","台灣時間；課程日期統計出席；核帳日與退款日統計購買；取消排除"],
    ["排課堂數",c.sessions],["預約學員人數",c.participants],["預約參與人次",c.participations],
    ["實際上課人數",c.visitors.length],["完成出席人次",c.completed],["首次上課人數",c.newVisitors.length],["再次上課人數",c.returningVisitors.length],
    ["使用點數",c.pointsUsed],["使用堂數",c.sessionsUsed],["報到待完成",c.checkedIn],["未到人次",c.noShow],
    ["前期開始",data.previous.startDate],["前期結束",data.previous.endDate],["回流人數",data.returned.length],
  ];
  if(data.revenue) rows.push(["核帳購買筆數",data.revenue.kpi.txCount],["購買人數",data.revenue.kpi.customerCount],["購買收入",data.revenue.kpi.totalRevenue],["退款",data.revenue.kpi.refundAmount],["購買淨額",data.revenue.kpi.netRevenue]);
  if(data.financial) {
    const f=data.financial;
    if(f.manualIncome!==null) rows.push(["手動收入",f.manualIncome],["手動支出",f.manualExpense??""]);
    if(f.totalIncome!==null) rows.push(["總收入",f.totalIncome],["收支淨額",f.net??""]);
    rows.push([], ["收支分類","收入","退款","支出","淨額"]);
    for(const c of f.categories) rows.push([c.name,c.income,c.refunds,c.expense,c.net]);
    rows.push([], ["交易歸屬人員","購買筆數","購買人數","購買淨額","手動收支淨額"]);
    for(const p of f.staff) rows.push([p.id==="unassigned"?"未歸屬":data.staff.find(s=>s.id===p.id)?.displayName??"歷史人員",f.purchaseIncome===null?"無檢視權限":p.orders,f.purchaseIncome===null?"無檢視權限":p.customers,f.purchaseIncome===null?"無檢視權限":p.purchaseIncome-p.refunds,f.manualIncome===null?"無檢視權限":p.manualIncome-p.manualExpense]);
  }
  rows.push([], ["教練","排課堂數","完成人次"]);
  for(const coach of c.coaches) rows.push([data.staff.find(s=>s.id===coach.id)?.displayName??"歷史教練",coach.sessions,coach.completed]);
  const csv=rows.map(row=>row.map(value=>{const text=String(value);return `"${(typeof value==="string"&&/^[=+@\-\t\r]/.test(text)?"'"+text:text).replaceAll('"','""')}"`;}).join(",")).join("\r\n");
  return new NextResponse("\uFEFF"+csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="course-analysis-${range.startDate}-${range.endDate}.csv"`,"Cache-Control":"no-store"}});
}
