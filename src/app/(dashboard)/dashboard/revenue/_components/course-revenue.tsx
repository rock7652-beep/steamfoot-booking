import {MusicRevenueLive} from "@/components/admin/music-revenue-live";
import {getMusicRevenueTransactions} from "@/server/queries/music-revenue-transactions";
import {CourseRevenueTransactions} from "./course-revenue-transactions";
import {MusicRevenueMetrics} from "@/components/admin/music-revenue-metrics";
import {Suspense} from "react";
import { MusicRevenueSync } from "@/components/admin/music-revenue-sync";
import { musicDataScope, musicDataSeparationEnabled } from "@/server/services/music-data-scope";
import { FeatureEntry } from "@/components/feature-presentation";
import { FEATURES } from "@/lib/feature-flags";
import { InstantFilterForm } from "@/components/instant-filter-form";
import {CourseFees} from "./course-fees";
import { getCourseRevenueReport } from "@/server/queries/course-revenue-report";
import { getCourseReceiptTotals } from "@/server/queries/course-home";
import {CourseTrialTransactions} from "./course-trial-transactions";
import { prisma } from "@/lib/db";
import { dayRange, toLocalDateStr, formatTWTime } from "@/lib/date-utils";
import { PageShell, PageHeader, KpiStrip, SideCard, DataTable, type Column } from "@/components/desktop";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { RevenueTabs } from "./revenue-tabs";
const money = (amount: number) => `NT$ ${amount.toLocaleString()}`;
export async function CourseRevenue({ storeId, params, readOnly, canRefund, canConfirm, canEdit, canVoid, canDataExport = false, basePath = "/dashboard/revenue" }: {
  storeId: string; params: { dataScope?:string; summary?: string; dateFrom?: string; dateTo?: string; page?: string; trialPage?: string; status?: string; staff?: string };
  canEdit: boolean; canVoid: boolean; readOnly: boolean; canRefund: boolean; canConfirm: boolean;
  basePath?: "/dashboard/revenue" | "/dashboard/transactions";
  canDataExport?: boolean;
}) {
  const legacy=musicDataScope(storeId,params.dataScope)==="legacy";
  const scopeQuery:Record<string,string>=legacy?{dataScope:"legacy"}:{};
  if(legacy){readOnly=true;canRefund=false;canConfirm=false;canEdit=false;canVoid=false;}
  const today = toLocalDateStr();
  const validDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).valueOf()) && new Date(s).toISOString().slice(0, 10) === s;
  const from = validDate(params.dateFrom) ? params.dateFrom! : today.slice(0, 7) + "-01";
  const to = validDate(params.dateTo) ? params.dateTo! : today;
  if (from > to) return <PageShell compact><PageHeader compact title="營運" /><p role="alert">開始日期不能晚於結束日期。</p><Link href={`${basePath}?${new URLSearchParams(scopeQuery)}`}>重設日期</Link></PageShell>;
  const range = { gte: dayRange(from).start, lte: dayRange(to).end };
  if (params.summary === "receipts") {
    const [totals, report] = await Promise.all([getCourseReceiptTotals(storeId,from,to,params.dataScope),getCourseRevenueReport(storeId,{startDate:from,endDate:to,storeFilter:{storeId},dataScope:params.dataScope})]);
    const detailRows = report.data.map(({id, createdAt, customerName, planName, netAmount}) => ({id, createdAt, customerName, planName, netAmount}));
    const detailColumns: Column<(typeof detailRows)[number]>[] = [
      { key:"date",header:"入帳／沖回時間",accessor:r=>formatTWTime(new Date(r.createdAt)) },
      { key:"customer",header:"顧客",accessor:r=>r.customerName },
      { key:"plan",header:"方案／體驗",accessor:r=>r.planName },
      { key:"kind",header:"異動",accessor:r=>r.netAmount<0 ? (r.id.endsWith(":void") ? "體驗沖銷" : "退款") : "收款入帳" },
      { key:"amount",header:"金額",accessor:r=>money(r.netAmount) },
    ];
    return <PageShell compact><PageHeader compact title="收款明細" subtitle={`${from}–${to} · 依核帳、收款及沖回發生日`} actions={<Link href="/dashboard">返回首頁</Link>}/>
      {musicDataSeparationEnabled(storeId)&&<MusicRevenueSync/>}
      
      <p className="mb-3 text-sm">收款入帳合計 {money(totals.gross)} · 退款 {money(totals.refunds)} · 沖銷 {money(totals.voids)} · 淨收款 {money(totals.net)}</p>
      <DataTable columns={detailColumns} rows={detailRows} rowKey={r=>r.id}/>
      <Link className="mt-3 inline-flex min-h-11 items-center text-sm text-primary-700" href={`${basePath}?${new URLSearchParams({dateFrom:from,dateTo:to,...scopeQuery})}`}>前往營運交易工作台 →</Link>
    </PageShell>;
  }
  const status = ["PENDING", "CONFIRMED", "REFUNDED", "VOIDED"].includes(params.status ?? "") ? params.status : undefined;
  const staff = params.staff?.slice(0, 100) || undefined;
  const [detail,receiptTotals,staffRows]=await Promise.all([
    getMusicRevenueTransactions(storeId,{from,to,status,staff,page:params.page,dataScope:params.dataScope}),
    getCourseReceiptTotals(storeId,from,to,params.dataScope),
    prisma.staff.findMany({where:{storeId},select:{id:true,userId:true,displayName:true,status:true,user:{select:{role:true}}}}),
  ]);
  const {rows}=detail;
  const labels: Record<string, string> = { PENDING: "待核帳", CONFIRMED: "已核帳並發卡", REFUNDED: "已登錄退款", VOIDED: "已作廢" };
  const income = receiptTotals.purchases; const refund = receiptTotals.refunds;
  const field = "mt-1 block h-11 w-full rounded-lg border border-earth-300 bg-white px-3 py-0 text-sm leading-none text-earth-800";
  const dateField = `${field} leading-normal`;
  const selectField = `${field} appearance-none pr-9`;
  const selectStyle = {backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,backgroundRepeat:"no-repeat",backgroundPosition:"right 12px center"};
  const periodHref = (dateFrom: string, dateTo: string) => `${basePath}?${new URLSearchParams({...scopeQuery,dateFrom,dateTo,status:status??"",staff:staff??""})}`;
  const isToday = from === today && to === today;
  const isMonth = from === today.slice(0, 7) + "-01" && to === today;
  return <MusicRevenueLive key={JSON.stringify([storeId,from,to,status,staff,params.page,params.dataScope])} initial={{totals:receiptTotals,transactions:detail}} input={{from,to,status,staff,page:params.page,dataScope:params.dataScope}} enabled={musicDataSeparationEnabled(storeId)}><PageShell compact>
    <PageHeader compact title={basePath === "/dashboard/transactions" ? "交易明細" : "營運"} subtitle="課程購買、核帳、退款與收支" actions={<Link className="inline-flex min-h-11 items-center rounded-lg border border-primary-200 bg-primary-50 px-3 text-sm text-primary-800" href={`${basePath}?${new URLSearchParams({...scopeQuery,dateFrom:from,dateTo:to,status:"PENDING",staff:staff??""})}`}>查看期間待核帳</Link>} />
    {musicDataSeparationEnabled(storeId)&&<MusicRevenueSync targetedTransactions/>}
      
    {legacy&&<p className="text-sm text-earth-600">舊驗收交易僅供查閱，不列入營運收款。</p>}
    <RevenueTabs readOnly={readOnly} />
    {musicDataSeparationEnabled(storeId) ? <MusicRevenueMetrics key={`${storeId}:${from}:${to}:${params.dataScope??"operational"}`} initial={receiptTotals} from={from} to={to} dataScope={params.dataScope}/> : <>
    <KpiStrip items={[{ label: "期間收款收入", value: money(income), tone: "primary" }, { label: "體驗淨收入", value: money(receiptTotals.trial - receiptTotals.voids) }, { label: "期間退款", value: money(refund) }, { label: "方案淨收入", value: money(income - refund) }, { label: "收款筆數", value: `${receiptTotals.purchaseCount} 筆` }]} />
    <p className="rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-900">收款入帳合計 {money(receiptTotals.gross)} · 退款 {money(receiptTotals.refunds)} · 體驗沖銷 {money(receiptTotals.voids)} · <strong>淨收款 {money(receiptTotals.net)}</strong></p>
    </>}
    <details className="text-sm text-earth-600"><summary className="min-h-11 cursor-pointer py-3 text-primary-700">統計與日期說明</summary><p>摘要依核帳／退款發生日計算；下表依購買日期篩選。方案淨收入不重複加計現金帳的連動紀錄，也不包含手動收支。所有日期採台灣時間。</p></details>
    <div className="@container/revenue grid min-w-0 grid-cols-12 gap-2"><section className="col-span-12 min-w-0 rounded-xl border border-earth-200 bg-white">
      <div className="border-b p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-semibold">交易工作台</h2><p className="mt-0.5 text-[11px] text-earth-500">查詢購買、核帳及退款；交易處理集中在最右側。</p></div><nav aria-label="營運期間" className="flex rounded-lg bg-earth-100 p-1 text-sm"><Link className={`rounded-md px-3 py-1.5 ${isToday?"bg-white font-medium text-primary-800 shadow-sm":"text-earth-600"}`} href={periodHref(today,today)}>本日</Link><Link className={`rounded-md px-3 py-1.5 ${isMonth?"bg-white font-medium text-primary-800 shadow-sm":"text-earth-600"}`} href={periodHref(today.slice(0,7)+"-01",today)}>本月</Link><span className={`rounded-md px-3 py-1.5 ${!isToday&&!isMonth?"bg-white font-medium text-primary-800 shadow-sm":"text-earth-600"}`}>任意區間</span></nav></div>
        <InstantFilterForm key={JSON.stringify([from,to,status,staff,legacy])} className="mt-2 grid gap-2 grid-cols-1 @min-[26rem]/revenue:grid-cols-2 @min-[42rem]/revenue:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          {params.dataScope==="legacy"&&<input type="hidden" name="dataScope" value="legacy"/>}
          <label className="text-xs">開始日期<input className={dateField} type="date" name="dateFrom" defaultValue={from} /></label>
          <label className="text-xs">結束日期<input className={dateField} type="date" name="dateTo" defaultValue={to} /></label>
          <label className="text-xs">狀態<select className={selectField} style={selectStyle} name="status" defaultValue={status ?? ""}><option value="">全部</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="text-xs">核帳人員<select className={selectField} style={selectStyle} name="staff" defaultValue={staff ?? ""}><option value="">全部</option>{staffRows.filter((s) => s.userId && (s.user?.role === "OWNER" || s.user?.role === "ADMIN" || rows.some(order => order.confirmedBy === s.userId))).map((s) => <option key={s.userId} value={s.userId!}>{s.displayName}</option>)}</select></label>
          <Link href={`${basePath}?${new URLSearchParams(scopeQuery)}`} className="flex h-11 items-center justify-center self-end rounded-lg border border-earth-200 px-3 text-sm text-earth-600">清除</Link>
        </InstantFilterForm>
      </div>
      <CourseRevenueTransactions key={JSON.stringify([storeId,from,to,status,staff,params.page,params.dataScope])} initial={detail} input={{from,to,status,staff,page:params.page,dataScope:params.dataScope}} staffRows={staffRows} basePath={basePath} live={musicDataSeparationEnabled(storeId)} canRefund={canRefund} canConfirm={canConfirm} canEdit={canEdit} canVoid={canVoid}/>

    </section><aside className="col-span-12 min-w-0"><details className="rounded-lg border border-earth-200 bg-white px-3"><summary className="min-h-11 cursor-pointer py-2 text-sm text-primary-800">相關工具與退款規則</summary><div className="grid gap-2 sm:grid-cols-2"><SideCard title="相關工具" subtitle="依工作目的快速前往"><div className="divide-y divide-earth-100 text-sm"><div className="space-y-2 py-2"><p className="text-[11px] font-medium text-earth-400">日常處理</p><Link className="block" href={`/dashboard/transactions?${new URLSearchParams({...scopeQuery,dateFrom:from,dateTo:to,status:status??"",staff:staff??""})}`}>交易明細與處理 →</Link><Link className="block" href={`/dashboard/courses?${new URLSearchParams({view:"plans",...scopeQuery})}`}>方案與待核帳訂單 →</Link></div><div className="space-y-2 py-2"><p className="text-[11px] font-medium text-earth-400">帳務管理</p><Link className="block" href="/dashboard/cashbook">現金帳 →</Link><FeatureEntry feature={FEATURES.SERVICE_FEE_CALCULATOR} label="月結管理"><Link className="block" href={`/dashboard/service-fee-calculator?${new URLSearchParams(scopeQuery)}`}>月結管理 →</Link></FeatureEntry><Link className="block" href="/dashboard/reconciliation">對帳中心 →</Link></div><div className="space-y-2 py-2"><p className="text-[11px] font-medium text-earth-400">報表</p><Link className="block" href={`/dashboard/store-revenue?${new URLSearchParams(scopeQuery)}`}>收入總覽與匯出 →</Link>{canDataExport && !readOnly && <Link className="block" href="/dashboard/data-export">資料匯出 →</Link>}</div></div></SideCard><SideCard title="退款"><details><summary className="min-h-11 cursor-pointer py-3 text-primary-700">查看協商退款規則</summary><p className="text-sm">具退款權限的店長可登錄協商金額、方式及原因；累計不超過實付，有預約占用時先處理。確認後收回剩餘額度並停用卡片，保留原單及歷史。此操作不會自動匯款或退刷。</p></details></SideCard></div></details></aside></div>
    <Suspense fallback={<p role="status">讀取授課費…</p>}><CourseFees dataScope={params.dataScope} storeId={storeId} range={range} readOnly={readOnly}/></Suspense>
    <Suspense fallback={<p role="status">讀取體驗交易…</p>}><CourseTrialTransactions dataScope={params.dataScope} storeId={storeId} range={range} readOnly={readOnly} page={Math.max(1,Number(params.trialPage)||1)} basePath={basePath} query={{...scopeQuery,dateFrom:from,dateTo:to,status:status??"",staff:staff??""}} status={status} staff={staff}/></Suspense>
  </PageShell></MusicRevenueLive>;
}
