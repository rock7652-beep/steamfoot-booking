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
import { AnalysisReturnState } from "./analysis-return-state";

function AnalysisCustomers({ title, ids, customers }: { title: string; ids: string[]; customers: { id: string; name: string }[] }) {
  const names = new Map(customers.map(customer => [customer.id, customer.name]));
  return <details className="mt-3">
    <summary className="min-h-11 cursor-pointer py-2 text-sm text-primary-700">查看{title}顧客（{ids.length} 人）</summary>
    {ids.length ? <ul className="max-h-64 divide-y divide-earth-100 overflow-auto overscroll-contain">{ids.map(id => <li key={id}>
      <DashboardLink className="block min-h-11 py-3 text-sm text-primary-700" href={`/dashboard/courses?view=customers&customerId=${encodeURIComponent(id)}`}>{names.get(id) ?? "歷史顧客"}</DashboardLink>
    </li>)}</ul> : <p className="py-2 text-sm text-earth-500">所選期間沒有符合條件的顧客。</p>}
  </details>;
}

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
  const canReadCash=await checkPermission(user.role,user.staffId,"cashbook.read");
  const data=await getCourseAnalytics(storeId,range,canReadRevenue,canReadCash);
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
  return <AnalysisReturnState scope={`${user.id}:${storeId}:${range.startDate}:${range.endDate}`}><PageShell>
    <PageHeader title="營運分析" subtitle={`${range.startDate} ～ ${range.endDate} · 台灣時間`} actions={<>
      {canExport&&<a className="rounded-md border border-earth-200 px-3 py-2 text-sm" href={`/api/export/course-analysis?startDate=${range.startDate}&endDate=${range.endDate}`} download>全店／人員 CSV</a>}
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
      {canReadCustomers&&<div className="grid gap-x-4 md:grid-cols-3">
        <AnalysisCustomers title="本期上課" ids={current.visitors} customers={current.customers}/>
        <AnalysisCustomers title="首次上課" ids={current.newVisitors} customers={current.customers}/>
        <AnalysisCustomers title="再次上課" ids={current.returningVisitors} customers={current.customers}/>
      </div>}
    </section>
    <section className={section}><h2 className="text-sm font-semibold text-earth-800">方案與體驗收款</h2>
      {revenue?<><KpiStrip items={[
        {label:"收款登錄",value:`${revenue.kpi.txCount} 筆`,tone:"earth"},
        {label:"付款顧客數",value:`${revenue.kpi.customerCount} 人`,tone:"earth"},
        {label:"收款收入",value:`NT$ ${revenue.kpi.totalRevenue.toLocaleString()}`,tone:"green"},
        {label:"退款／沖銷",value:`NT$ ${revenue.kpi.refundAmount.toLocaleString()}`,tone:"amber"},
        {label:"收款淨額",value:`NT$ ${revenue.kpi.netRevenue.toLocaleString()}`,tone:"primary"},
      ]}/><p className="mt-2 text-xs text-earth-500">方案依核帳／退款日，體驗依收款／沖銷日；同一體驗更正前後的收款紀錄分別保留，不代表多次購買或上課。與收入總覽使用同一課程資料來源，不再加總連動現金帳。較前期收款淨額 {comparison(revenue.kpi.netRevenue,priorRevenue?.kpi.netRevenue??0,"元")}。</p></>:<p className="mt-3 text-sm text-earth-500">沒有交易檢視權限，收款金額不顯示。</p>}
      <details className="mt-2 text-xs text-earth-500"><summary className="min-h-11 cursor-pointer py-3">體驗轉換與月結的適用差異</summary><p>課程尚無可辨識的體驗成交歸因，因此不顯示體驗開卡率。蒸足空間費月結不適用課程；課程教練結算方式未約定，不代入蒸足費率。</p></details>
    </section>
    <section className={section}><h2 className="mb-3 text-sm font-semibold text-earth-800">營收分析</h2>
      <p className="mb-3 text-xs text-earth-500">方案、體驗收款與退款／沖銷依入帳時間，手動收支依登錄日期；排除全部交易連動現金帳，避免重複計算。收支淨額不等於會計利潤。</p>
      <KpiStrip items={[
        {label:"手動收入",value:data.financial.manualIncome===null?"無檢視權限":`NT$ ${data.financial.manualIncome.toLocaleString()}`,tone:"green"},
        {label:"手動支出",value:data.financial.manualExpense===null?"無檢視權限":`NT$ ${data.financial.manualExpense.toLocaleString()}`,tone:"amber"},
        {label:"總收入",value:data.financial.totalIncome===null?"資料權限不足":`NT$ ${data.financial.totalIncome.toLocaleString()}`,tone:"primary"},
        {label:"收支淨額",value:data.financial.net===null?"資料權限不足":`NT$ ${data.financial.net.toLocaleString()}`,tone:"earth"},
      ]}/>
      {data.financial.net!==null&&data.priorFinancial.net!==null&&<p className="my-2 text-xs text-earth-500">較前期收支淨額 {comparison(data.financial.net,data.priorFinancial.net,"元")}。</p>}
      <DataTable rows={data.financial.categories} rowKey={r=>r.name} columns={[
        {key:"name",header:"分類",accessor:r=>r.name},{key:"income",header:"收入",align:"right",accessor:r=>r.income.toLocaleString()},
        {key:"refunds",header:"退款／沖銷",align:"right",accessor:r=>r.refunds.toLocaleString()},{key:"expense",header:"支出",align:"right",accessor:r=>r.expense.toLocaleString()},
        {key:"net",header:"淨額",align:"right",accessor:r=>r.net.toLocaleString()},
      ]}/>
      {canReadCash&&<DashboardLink href="/dashboard/cashbook" className="inline-block min-h-11 py-3 text-sm text-primary-700">查看收支明細</DashboardLink>}
    </section>
    <section className={section}><h2 className="mb-3 text-sm font-semibold text-earth-800">店長／交易歸屬分析</h2><p className="mb-3 text-xs text-earth-500">依訂單歸屬店長（未指定時使用核帳人）與收支歸屬人員統計；未歸屬單獨列示。僅顯示有檢視權限的資料。</p>
      <DataTable rows={data.financial.staff} rowKey={r=>r.id} columns={[
        {key:"name",header:"歸屬人員",accessor:r=>r.id==="unassigned"?"未歸屬":data.staff.find(s=>s.id===r.id)?.displayName??"歷史人員"},
        {key:"orders",header:"收款紀錄數",align:"right",accessor:r=>canReadRevenue?r.orders:"—"},
        {key:"customers",header:"付款顧客數",align:"right",accessor:r=>canReadRevenue?r.customers:"—"},
        {key:"purchases",header:"收款淨額",align:"right",accessor:r=>canReadRevenue?(r.purchaseIncome-r.refunds).toLocaleString():"—"},
        {key:"cash",header:"手動收支淨額",align:"right",accessor:r=>canReadCash?(r.manualIncome-r.manualExpense).toLocaleString():"—"},
      ]}/>
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
      {canReadCustomers&&<div className="grid gap-x-4 md:grid-cols-3">
        <AnalysisCustomers title="前期上課" ids={prior.visitors} customers={prior.customers}/>
        <AnalysisCustomers title="本期回流" ids={data.returned} customers={current.customers}/>
        <AnalysisCustomers title="尚未回流" ids={data.notReturned} customers={prior.customers}/>
      </div>}
    </section>
    <section className={section}><h2 className="mb-3 text-sm font-semibold text-earth-800">教練授課與待處理出席</h2><p className="mb-3 text-xs text-earth-500">報到待完成 {current.checkedIn} 人次 · 未到 {current.noShow} 人次 · 排定 {current.hours.toFixed(1)} 小時</p>
      <DataTable rows={current.coaches} rowKey={r=>r.id} columns={[
        {key:"name",header:"教練",accessor:r=>data.staff.find(s=>s.id===r.id)?.displayName??"歷史教練"},
        {key:"sessions",header:"排課堂數",align:"right",accessor:r=>`${r.sessions} 堂`},
        {key:"completed",header:"完成出席",align:"right",accessor:r=>`${r.completed} 人次`},
      ]}/>
    </section>
  </PageShell></AnalysisReturnState>;
}
