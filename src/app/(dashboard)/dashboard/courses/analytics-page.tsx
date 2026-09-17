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
import { getCourseAnalytics } from "@/server/queries/course-analytics";
import { PageShell, PageHeader, KpiStrip, DataTable } from "@/components/desktop";
import { DashboardLink } from "@/components/dashboard-link";
import { UpgradeNoticePage } from "@/components/upgrade-notice";
import ReportDateRange from "@/components/report-date-range";
import { TrendChart } from "../ops/trend-chart";

export async function CourseAnalyticsPage({params}:{params:{preset?:string;startDate?:string;endDate?:string;month?:string}}) {
  const user=await getCurrentUser();
  if(!user || !(await checkPermission(user.role,user.staffId,"report.read"))) notFound();
  const storeId=await getActiveStoreForRead(user);
  if(!storeId || await getStoreIndustryModule(storeId)!=="course") notFound();
  if(!(await hasStoreFeature(storeId,FEATURES.BASIC_REPORTS))) return <UpgradeNoticePage title="營運分析尚未開通" description="請聯絡店長確認分析功能開通設定。"/>;
  let range;
  try { range=courseAnalysisRange(params); } catch { return <PageShell><PageHeader title="營運分析"/><p role="alert">請選擇有效的開始與結束日期。</p><DashboardLink href="/dashboard/courses?view=analytics">返回本月分析</DashboardLink></PageShell>; }
  const canReadRevenue=await checkPermission(user.role,user.staffId,"transaction.read");
  const canReadCustomers=await checkPermission(user.role,user.staffId,"customer.read");
  const canExport=!(await resolveStoreViewContextFromCookie(user))?.isViewMode && await checkPermission(user.role,user.staffId,"report.export") && await hasDataExportFeature(storeId);
  const data=await getCourseAnalytics(storeId,range,canReadRevenue);
  const {current,prior,priorYear,revenue,priorRevenue}=data;
  const comparison=(now:number,before:number,unit:string)=>`${now-before>=0?"+":""}${now-before} ${unit}`;
  const metrics=[
    ["實際上課人數",current.visitors.length,prior.visitors.length,priorYear.visitors.length,"人"],
    ["首次上課人數",current.newVisitors.length,prior.newVisitors.length,priorYear.newVisitors.length,"人"],
    ["再次上課人數",current.returningVisitors.length,prior.returningVisitors.length,priorYear.returningVisitors.length,"人"],
    ["預約參與",current.participations,prior.participations,priorYear.participations,"人次"],
    ["完成出席",current.completed,prior.completed,priorYear.completed,"人次"],
  ] as const;
  const section="rounded-xl border border-earth-200 bg-white p-3";
  return <PageShell>
    <PageHeader title="營運分析" subtitle={`${range.startDate} ～ ${range.endDate} · 台灣時間`} actions={<>
      {canExport&&<a className="rounded-md border border-earth-200 px-3 py-2 text-sm" href={`/api/export/course-analysis?startDate=${range.startDate}&endDate=${range.endDate}`} download>全店／教練 CSV</a>}
      {canReadRevenue&&<DashboardLink href="/dashboard/store-revenue" className="rounded-md border border-earth-200 px-3 py-2 text-sm">收入總覽／匯出</DashboardLink>}
    </>}/>
    <ReportDateRange key={`${range.startDate}-${range.endDate}`} activePreset={params.startDate?"custom":params.preset??"month"} {...range} preserveQuery/>
    <section aria-labelledby="course-operations-summary"><h2 id="course-operations-summary" className="mb-2 text-sm font-semibold text-earth-800">營運摘要</h2>
      <KpiStrip items={[
        {label:"排課",value:`${current.sessions} 堂`,tone:"primary"},
        {label:"完成出席",value:`${current.completed} 人次`,tone:"green"},
        {label:"使用點數",value:`${current.pointsUsed} 點`,tone:"blue"},
        {label:"使用堂數",value:`${current.sessionsUsed} 堂`,tone:"earth"},
      ]}/><p className="mt-2 text-xs text-earth-500">依課程日期統計；取消課程與取消預約不計入。報到不使用額度，完成出席才使用；點數與堂數分開。</p>
    </section>
    <section className={section}><h2 className="text-sm font-semibold text-earth-800">客流分析</h2>
      <p className="mt-1 text-xs text-earth-500">人數以實際上課者去重；同一人上兩堂為一人、兩人次。比較前一段同長期間：{data.previous.startDate} ～ {data.previous.endDate}。</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{metrics.map(([label,value,before,yearBefore,unit])=><div key={label} className="rounded-lg bg-earth-50/70 p-3"><p className="text-xs text-earth-500">{label}</p><p className="mt-1 text-xl font-bold tabular-nums text-earth-900">{value} {unit}</p><p className="mt-2 text-xs text-earth-500">較前期 {comparison(value,before,unit)}</p><p className="mt-1 text-xs text-earth-500">較去年同期 {comparison(value,yearBefore,unit)}</p></div>)}</div>
      {current.unknownFirstVisits.length>0&&<p role="alert" className="mt-2 text-sm text-amber-700">有 {current.unknownFirstVisits.length} 位學員缺少首次上課依據，未歸入新舊客。</p>}
      {canReadCustomers&&<details className="mt-3"><summary className="min-h-11 cursor-pointer py-2 text-sm text-primary-700">查看本期上課顧客（{current.customers.length} 人）</summary><ul className="max-h-64 divide-y divide-earth-100 overflow-auto">{current.customers.map(c=><li key={c.id}><DashboardLink className="block min-h-11 py-3 text-sm text-primary-700" href={`/dashboard/courses?view=customers&customerId=${encodeURIComponent(c.id)}`}>{c.name}</DashboardLink></li>)}</ul></details>}
    </section>
    <section className={section}><h2 className="text-sm font-semibold text-earth-800">成交與購買收入</h2>
      {revenue?<><KpiStrip items={[
        {label:"核帳購買",value:`${revenue.kpi.txCount} 筆`,tone:"earth"},
        {label:"購買人數",value:`${revenue.kpi.customerCount} 人`,tone:"earth"},
        {label:"購買收入",value:`NT$ ${revenue.kpi.totalRevenue.toLocaleString()}`,tone:"green"},
        {label:"退款",value:`NT$ ${revenue.kpi.refundAmount.toLocaleString()}`,tone:"amber"},
        {label:"購買淨額",value:`NT$ ${revenue.kpi.netRevenue.toLocaleString()}`,tone:"primary"},
      ]}/><p className="mt-2 text-xs text-earth-500">購買依核帳日、退款依退款日；作廢排除。與收入總覽使用同一課程資料來源，不再加總連動現金帳。較前期購買淨額 {comparison(revenue.kpi.netRevenue,priorRevenue?.kpi.netRevenue??0,"元")}。</p></>:<p className="mt-3 text-sm text-earth-500">沒有交易檢視權限，購買金額不顯示。</p>}
      <details className="mt-2 text-xs text-earth-500"><summary className="min-h-11 cursor-pointer py-3">體驗轉換與月結的適用差異</summary><p>課程尚無可辨識的體驗成交歸因，因此不顯示體驗開卡率。蒸足空間費月結不適用課程；課程教練結算方式未約定，不代入蒸足費率。</p></details>
    </section>
    <section className={section}><h2 className="mb-3 text-sm font-semibold text-earth-800">每日參與與完成</h2>{data.daily.length?<TrendChart data={data.daily} metric="bookings" bookingLabels={{booked:"參與人次",arrived:"完成人次"}}/>:<p className="text-sm text-earth-500">本期尚無課程。</p>}</section>
    <section className={section}><h2 className="mb-3 text-sm font-semibold text-earth-800">近六個月參與與完成</h2><p className="mb-3 text-xs text-earth-500">最後一月統計至所選結束日，不補算尚未納入的日期。</p><TrendChart data={data.trend} metric="bookings" bookingLabels={{booked:"參與人次",arrived:"完成人次"}}/></section>
    <section className={section}><h2 className="text-sm font-semibold text-earth-800">留存分析</h2><p className="mt-1 text-xs text-earth-500">前期有完成出席的學員，本期是否再次上課；不計取消與未到。期間同上，非預約下單人。</p>
      <KpiStrip items={[
        {label:"前期上課",value:`${prior.visitors.length} 人`,tone:"earth"},
        {label:"本期回流",value:`${data.returned.length} 人`,tone:"green"},
        {label:"尚未回流",value:`${data.notReturned.length} 人`,tone:"earth"},
        {label:"回流率",value:prior.visitors.length?`${(100*data.returned.length/prior.visitors.length).toFixed(1)}%`:"—（前期無學員）",tone:"primary"},
      ]}/>
    </section>
    <section className={section}><h2 className="mb-3 text-sm font-semibold text-earth-800">教練授課與待處理出席</h2><p className="mb-3 text-xs text-earth-500">報到待完成 {current.checkedIn} 人次 · 未到 {current.noShow} 人次 · 排定 {current.hours.toFixed(1)} 小時</p>
      <DataTable rows={current.coaches} rowKey={r=>r.id} columns={[
        {key:"name",header:"教練",accessor:r=>data.staff.find(s=>s.id===r.id)?.displayName??"歷史教練"},
        {key:"sessions",header:"排課堂數",align:"right",accessor:r=>`${r.sessions} 堂`},
        {key:"completed",header:"完成出席",align:"right",accessor:r=>`${r.completed} 人次`},
      ]}/>
    </section>
  </PageShell>;
}
