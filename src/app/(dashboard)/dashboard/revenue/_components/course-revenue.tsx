import type {CourseRevenueSource} from "./course-revenue-source";
import type {ComponentProps} from "react";
import {musicNativeWorkflowEnabled} from "@/server/services/music-native-workflow";
import {courseAllocationAfterRefund} from "@/lib/course-sale-allocation";
import {coursePrisma} from "@/lib/course-db";
import {sportsNativePreview} from "@/lib/sports-native-preview";
import {MusicRevenueLive} from "@/components/admin/music-revenue-live";
import {getMusicRevenueTransactions} from "@/server/queries/music-revenue-transactions";
import {CourseRevenueTransactions} from "./course-revenue-transactions";
import {MusicRevenueMetrics} from "@/components/admin/music-revenue-metrics";
import {Suspense} from "react";
import { MusicRevenueSync } from "@/components/admin/music-revenue-sync";
import { musicDataScope } from "@/server/services/music-data-scope";
import { FeatureEntry } from "@/components/feature-presentation";
import { FEATURES } from "@/lib/feature-flags";
import { InstantFilterForm } from "@/components/instant-filter-form";
import {CourseFees} from "./course-fees";
import { getCourseRevenueReport } from "@/server/queries/course-revenue-report";
import { getCourseReceiptTotals } from "@/server/queries/course-home";
import {CourseTrialTransactions} from "./course-trial-transactions";
import { prisma } from "@/lib/db";
import { dayRange, toLocalDateStr, formatTWTime } from "@/lib/date-utils";
import { PageShell, PageHeader, KpiStrip, SideCard, DataTable, EmptyRow, type Column } from "@/components/desktop";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { RevenueTabs } from "./revenue-tabs";
import { CourseTransactionActions } from "./course-transaction-actions";
function RevenueLink({resolveHref,href,...props}:ComponentProps<typeof Link>&{resolveHref?:CourseRevenueSource["href"]}){return <Link {...props} href={resolveHref?resolveHref(String(href)):href}/>;}
const money = (amount: number) => `NT$ ${amount.toLocaleString()}`;
export async function CourseRevenue({ source,storeId, params, readOnly, canRefund, canConfirm, canEdit, canVoid, canDataExport = false, basePath = "/dashboard/revenue" }: {
  source?:CourseRevenueSource;storeId: string; params: { dataScope?:string;summary?: string; dateFrom?: string; dateTo?: string; page?: string; trialPage?: string; status?: string; staff?: string };
  canEdit: boolean; canVoid: boolean; readOnly: boolean; canRefund: boolean; canConfirm: boolean;
  basePath?: "/dashboard/revenue" | "/dashboard/transactions";
  canDataExport?: boolean;
}) {
  const native=source?true:(await sportsNativePreview(storeId));
  const legacy=musicDataScope(storeId,params.dataScope)==="legacy";
  const scopeQuery:Record<string,string>=legacy?{dataScope:"legacy"}:{};
  if(legacy){readOnly=true;canRefund=false;canConfirm=false;canEdit=false;canVoid=false;}
  const today = toLocalDateStr();
  const validDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).valueOf()) && new Date(s).toISOString().slice(0, 10) === s;
  const from = validDate(params.dateFrom) ? params.dateFrom! : today.slice(0, 7) + "-01";
  const to = validDate(params.dateTo) ? params.dateTo! : today;
  if (from > to) return <PageShell compact><PageHeader compact title="營運" /><p role="alert">開始日期不能晚於結束日期。</p><RevenueLink resolveHref={source?.href} href={basePath}>重設日期</RevenueLink></PageShell>;
  const range = { gte: dayRange(from).start, lte: dayRange(to).end };
  if (params.summary === "receipts") {
    const summary=source?await source.summary(from,to):null;
    const [totals, report] = summary?[summary.totals,{data:summary.rows}] : await Promise.all([getCourseReceiptTotals(storeId,from,to,params.dataScope),getCourseRevenueReport(storeId,{startDate:from,endDate:to,storeFilter:{storeId},dataScope:params.dataScope})]);
    const detailRows = report.data.map(({id, createdAt, customerName, planName, netAmount}) => ({id, createdAt, customerName, planName, netAmount}));
    const detailColumns: Column<(typeof detailRows)[number]>[] = [
      { key:"date",header:"入帳／沖回時間",accessor:r=>formatTWTime(new Date(r.createdAt)) },
      { key:"customer",header:"顧客",accessor:r=>r.customerName },
      { key:"plan",header:"方案／體驗",accessor:r=>r.planName },
      { key:"kind",header:"異動",accessor:r=>r.netAmount<0 ? (r.id.endsWith(":void") ? "體驗沖銷" : "退款") : "收款入帳" },
      { key:"amount",header:"金額",accessor:r=>money(r.netAmount) },
    ];
    return <PageShell compact><PageHeader compact title="收款明細" subtitle={`${from}–${to} · 依核帳、收款及沖回發生日`} actions={<RevenueLink resolveHref={source?.href} href="/dashboard">返回首頁</RevenueLink>}/>
      {musicNativeWorkflowEnabled(storeId)&&<MusicRevenueSync/>}

      <p className="mb-3 text-sm">收款入帳合計 {money(totals.gross)} · 退款 {money(totals.refunds)} · 沖銷 {money(totals.voids)} · 淨收款 {money(totals.net)}</p>
      <DataTable columns={detailColumns} rows={detailRows} rowKey={r=>r.id}/>
      <RevenueLink resolveHref={source?.href} className="mt-3 inline-flex min-h-11 items-center text-sm text-primary-700" href={`${basePath}?${new URLSearchParams({dateFrom:from,dateTo:to,...scopeQuery})}`}>前往營運交易工作台 →</RevenueLink>
    </PageShell>;
  }
  const status = ["PENDING", "CONFIRMED", "REFUNDED", "VOIDED"].includes(params.status ?? "") ? params.status : undefined;
  const staff = params.staff?.slice(0, 100) || undefined;
  const sourceSnapshot=source?await source.read({from,to,status,staff,page:Math.max(1,Math.floor(Number(params.page)||1))}):null;
  const [musicDetail,receiptTotals,staffRows]=await Promise.all([
    source?null:getMusicRevenueTransactions(storeId,{from,to,status,staff,page:params.page,dataScope:params.dataScope}),
    sourceSnapshot?sourceSnapshot.receiptTotals:getCourseReceiptTotals(storeId,from,to,params.dataScope),
    sourceSnapshot?sourceSnapshot.staffRows:prisma.staff.findMany({where:{storeId},select:{id:true,userId:true,displayName:true,status:true,user:{select:{role:true}}}}),
  ]);
  const detail=musicDetail??{rows:[],count:0,page:1,pages:1};
  const {rows,count,pages,page}=sourceSnapshot??detail;
  const href=(nextPage:number)=>`${basePath}?${new URLSearchParams({...scopeQuery,dateFrom:from,dateTo:to,status:status??"",staff:staff??"",page:String(nextPage)})}`;
  const labels: Record<string, string> = { PENDING: "待核帳", CONFIRMED: "已核帳並發卡", REFUNDED: "已登錄退款", VOIDED: "已作廢",...source?.statusLabels };
  const columns: Column<(typeof rows)[number]>[] = [
    { key: "date", header: "購買日期", accessor: (r) => r.date },
    { key: "customer", header: "顧客", accessor: (r) => <span className="block max-w-32 truncate" title={r.customerName}>{r.customerName}</span> },
    { key: "plan", header: "方案", accessor: (r) => <span className="block max-w-32 truncate" title={r.name}>{r.name}</span> },
    { key: "amount", header: "原金額", align: "right", accessor: (r) => <span className="whitespace-nowrap">{money(r.price)}</span> },
    { key: "status", header: "狀態", accessor: (r) => <span className="whitespace-nowrap">{labels[r.status] ?? "需核對"}</span> },
    { key: "staff", header: "核帳人員", accessor: (r) => {const name=staffRows.find((s) => s.userId === r.confirmedBy)?.displayName ?? "—";return <span className="block max-w-28 truncate whitespace-nowrap" title={name}>{name}</span>;} },
    { key: "action", header: "處理", noLink: true, accessor: (r) => {const allocation=r.storeCostSnapshot==null?"舊交易待補":r.status==="VOIDED"?"已作廢":(()=>{const a=courseAllocationAfterRefund(r.price,r.storeCostSnapshot,r.refunds.reduce((n,v)=>n+v.amount,0));return `店家 NT$ ${a.storeAmount.toLocaleString()}／開發人 NT$ ${a.developerAmount.toLocaleString()}`;})();return source?source.actions(r):<CourseTransactionActions quiet={native} order={r} allocationSummary={allocation} canRefund={canRefund} canConfirm={canConfirm} canEdit={canEdit} canVoid={canVoid} staffOptions={staffRows.filter((s) => s.status === "ACTIVE").map((s) => ({ id: s.id, name: s.displayName }))} />;} },
  ];
  const income = receiptTotals.purchases; const refund = receiptTotals.refunds;
  const pendingCount=sourceSnapshot?sourceSnapshot.pendingCount:native?await coursePrisma.coursePurchase.count({where:{storeId,createdAt:range,status:"PENDING"}}):0;
  const field = "mt-1 block h-11 w-full rounded-lg border border-earth-300 bg-white px-3 py-0 text-sm leading-none text-earth-800";
  const dateField = `${field} leading-normal`;
  const selectField = `${field} appearance-none pr-9`;
  const selectStyle = {backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,backgroundRepeat:"no-repeat",backgroundPosition:"right 12px center"};
  const periodHref = (dateFrom: string, dateTo: string) => `${basePath}?${new URLSearchParams({...scopeQuery,dateFrom,dateTo,status:status??"",staff:staff??""})}`;
  const isToday = from === today && to === today;
  const isMonth = from === today.slice(0, 7) + "-01" && to === today;
  return native ? (<PageShell compact>
    <PageHeader compact title={basePath === "/dashboard/transactions" ? "交易明細" : "營運"} subtitle={native?undefined:"課程購買、核帳、退款與收支"} actions={<><RevenueLink resolveHref={source?.href} className="inline-flex min-h-11 items-center rounded-lg border border-primary-200 bg-primary-50 px-3 text-sm text-primary-800" href={`${basePath}?${new URLSearchParams({dateFrom:from,dateTo:to,status:"PENDING"})}`}>{native?`待核帳 ${pendingCount} 筆`:"查看期間待核帳"}</RevenueLink>{native&&<details className="relative"><summary className="min-h-11 cursor-pointer rounded-lg border border-earth-200 px-3 py-3 text-sm">更多工具</summary><div className="absolute right-0 z-30 max-h-[70vh] w-64 overflow-y-auto rounded-lg border bg-white p-3 shadow-lg"><div className="divide-y divide-earth-100 text-sm"><div className="space-y-2 py-2"><p className="text-[11px] font-medium text-earth-400">日常處理</p><RevenueLink resolveHref={source?.href} className="block" href="/dashboard/transactions">交易明細與處理 →</RevenueLink><RevenueLink resolveHref={source?.href} className="block" href="/dashboard/courses?view=plans">方案與待核帳訂單 →</RevenueLink></div><div className="space-y-2 py-2"><p className="text-[11px] font-medium text-earth-400">帳務管理</p><RevenueLink resolveHref={source?.href} className="block" href="/dashboard/cashbook">現金帳 →</RevenueLink><FeatureEntry feature={FEATURES.SERVICE_FEE_CALCULATOR} label="月結管理"><RevenueLink resolveHref={source?.href} className="block" href="/dashboard/service-fee-calculator">月結管理 →</RevenueLink></FeatureEntry><RevenueLink resolveHref={source?.href} className="block" href="/dashboard/reconciliation">對帳中心 →</RevenueLink></div><div className="space-y-2 py-2"><p className="text-[11px] font-medium text-earth-400">報表</p><RevenueLink resolveHref={source?.href} className="block" href="/dashboard/store-revenue">收入總覽與匯出 →</RevenueLink>{canDataExport && !readOnly && <RevenueLink resolveHref={source?.href} className="block" href="/dashboard/data-export">資料匯出 →</RevenueLink>}</div></div></div></details>}</>} />
    {source?.tabs??<RevenueTabs readOnly={readOnly} />}
    {native?<div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-earth-200 py-3 text-sm" aria-label="營運摘要"><span>實收 <strong>{money(receiptTotals.gross)}</strong></span><span>退款 <strong>{money(receiptTotals.refunds)}</strong></span><span>淨收款 <strong>{money(receiptTotals.net)}</strong></span><span>待核帳 <strong>{pendingCount} 筆</strong></span><details className="ml-auto"><summary className="min-h-11 cursor-pointer py-3">ⓘ</summary><p>核帳／收款及退款按發生日統計；體驗沖銷 {money(receiptTotals.voids)}。清單依購買日期篩選，皆為台灣時間。</p><p>方案收款 {money(income)}・體驗收款 {money(receiptTotals.trial)}</p></details></div>:<><KpiStrip items={[{ label: "期間核帳收入", value: money(income), tone: "primary" }, { label: "體驗淨收入", value: money(receiptTotals.trial - receiptTotals.voids) }, { label: "期間退款", value: money(refund) }, { label: "方案淨收入", value: money(income - refund) }, { label: "核帳訂單", value: `${receiptTotals.purchaseCount} 筆` }]} />
    <p className="rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-900">收款入帳合計 {money(receiptTotals.gross)} · 退款 {money(receiptTotals.refunds)} · 體驗沖銷 {money(receiptTotals.voids)} · <strong>淨收款 {money(receiptTotals.net)}</strong></p>
    <details className="text-sm text-earth-600"><summary className="min-h-11 cursor-pointer py-3 text-primary-700">統計與日期說明</summary><p>摘要依核帳／退款發生日計算；下表依購買日期篩選。方案淨收入不重複加計現金帳的連動紀錄，也不包含手動收支。所有日期採台灣時間。</p></details>
    </>}<div className={`grid grid-cols-12 gap-3 ${native?"items-start":""}`}><section className={`col-span-12 rounded-xl border border-earth-200 bg-white ${native?"":"lg:col-span-9"}`}>
      <div className="border-b p-3"><div className="flex flex-wrap items-center justify-between gap-2">{!native&&<div><h2 className="text-sm font-semibold">交易工作台</h2><p className="mt-0.5 text-[11px] text-earth-500">查詢購買、核帳及退款；交易處理集中在最右側。</p></div>}<nav aria-label="營運期間" className="flex rounded-lg bg-earth-100 p-1 text-sm"><RevenueLink resolveHref={source?.href} className={`rounded-md px-3 py-1.5 ${isToday?"bg-white font-medium text-primary-800 shadow-sm":"text-earth-600"}`} href={periodHref(today,today)}>本日</RevenueLink><RevenueLink resolveHref={source?.href} className={`rounded-md px-3 py-1.5 ${isMonth?"bg-white font-medium text-primary-800 shadow-sm":"text-earth-600"}`} href={periodHref(today.slice(0,7)+"-01",today)}>本月</RevenueLink><span className={`rounded-md px-3 py-1.5 ${!isToday&&!isMonth?"bg-white font-medium text-primary-800 shadow-sm":"text-earth-600"}`}>任意區間</span></nav></div>
        <InstantFilterForm className={`mt-2 grid gap-2 sm:grid-cols-2 ${native?"lg:grid-cols-[1fr_1fr_1fr_1fr_auto]":"xl:grid-cols-[1fr_1fr_1fr_1fr_auto_auto]"}`}>
          {Object.entries(source?.queryFields??{}).map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>)}
          <label className="text-xs">開始日期<input className={dateField} type="date" name="dateFrom" defaultValue={from} /></label>
          <label className="text-xs">結束日期<input className={dateField} type="date" name="dateTo" defaultValue={to} /></label>
          <label className="text-xs">狀態<select className={selectField} style={selectStyle} name="status" defaultValue={status ?? ""}><option value="">全部</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="text-xs">核帳人員<select className={selectField} style={selectStyle} name="staff" defaultValue={staff ?? ""}><option value="">全部</option>{staffRows.filter((s) => s.userId && (s.user?.role === "OWNER" || s.user?.role === "ADMIN" || rows.some(order => order.confirmedBy === s.userId))).map((s) => <option key={s.userId} value={s.userId!}>{s.displayName}</option>)}</select></label>
          <RevenueLink resolveHref={source?.href} href={basePath} className="flex h-11 items-center justify-center self-end rounded-lg border border-earth-200 px-3 text-sm text-earth-600">清除</RevenueLink>
        </InstantFilterForm>{!native&&<p className="mt-3 text-xs text-earth-600">共 {count} 筆購買紀錄；點「查看／核帳」或「查看明細」，同頁處理與查閱額度、退款紀錄。</p>}
      </div>
      {rows.length ? <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} className="rounded-none border-0" /> : <EmptyRow title="沒有符合條件的交易" hint="調整日期或篩選條件重新查詢" />}
      {pages > 1 && <div className="flex justify-between p-3 text-sm"><span>第 {page} / {pages} 頁</span><div className="flex gap-4">{page > 1 && <RevenueLink resolveHref={source?.href} href={href(page - 1)}>上一頁</RevenueLink>}{page < pages && <RevenueLink resolveHref={source?.href} href={href(page + 1)}>下一頁</RevenueLink>}</div></div>}
    </section>{!native&&<aside className={native?"col-span-12":"col-span-12 space-y-3 lg:col-span-3"}><details open={native?undefined:true}><summary className={native?"min-h-11 cursor-pointer py-3 text-sm text-primary-800":"hidden"}>更多工具</summary><SideCard title={native?"":"相關工具"} subtitle={native?undefined:"依工作目的快速前往"}><div className="divide-y divide-earth-100 text-sm"><div className="space-y-2 py-2"><p className="text-[11px] font-medium text-earth-400">日常處理</p><RevenueLink resolveHref={source?.href} className="block" href="/dashboard/transactions">交易明細與處理 →</RevenueLink><RevenueLink resolveHref={source?.href} className="block" href="/dashboard/courses?view=plans">方案與待核帳訂單 →</RevenueLink></div><div className="space-y-2 py-2"><p className="text-[11px] font-medium text-earth-400">帳務管理</p><RevenueLink resolveHref={source?.href} className="block" href="/dashboard/cashbook">現金帳 →</RevenueLink><FeatureEntry feature={FEATURES.SERVICE_FEE_CALCULATOR} label="月結管理"><RevenueLink resolveHref={source?.href} className="block" href="/dashboard/service-fee-calculator">月結管理 →</RevenueLink></FeatureEntry><RevenueLink resolveHref={source?.href} className="block" href="/dashboard/reconciliation">對帳中心 →</RevenueLink></div><div className="space-y-2 py-2"><p className="text-[11px] font-medium text-earth-400">報表</p><RevenueLink resolveHref={source?.href} className="block" href="/dashboard/store-revenue">收入總覽與匯出 →</RevenueLink>{canDataExport && !readOnly && <RevenueLink resolveHref={source?.href} className="block" href="/dashboard/data-export">資料匯出 →</RevenueLink>}</div></div></SideCard></details>{!native&&<SideCard title="退款"><details><summary className="min-h-11 cursor-pointer py-3 text-primary-700">查看協商退款規則</summary><p className="text-sm">具退款權限的店長可登錄協商金額、方式及原因；累計不超過實付，有預約占用時先處理。確認後收回剩餘額度並停用卡片，保留原單及歷史。此操作不會自動匯款或退刷。</p></details></SideCard>}</aside>}</div>
    {source?source.fees:<CourseFees storeId={storeId} range={range} readOnly={readOnly}/>}
    {!source&&<CourseTrialTransactions storeId={storeId} range={range} readOnly={readOnly} page={Math.max(1,Number(params.trialPage)||1)} basePath={basePath} query={{dateFrom:from,dateTo:to,status:status??"",staff:staff??""}} status={status} staff={staff}/>}
  </PageShell>) : (<MusicRevenueLive key={JSON.stringify([storeId,from,to,status,staff,params.page,params.dataScope])} initial={{totals:receiptTotals,transactions:detail}} input={{from,to,status,staff,page:params.page,dataScope:params.dataScope}} enabled={musicNativeWorkflowEnabled(storeId)}><PageShell compact>
    <PageHeader compact title={basePath === "/dashboard/transactions" ? "交易明細" : "營運"} subtitle="課程購買、核帳、退款與收支" actions={<RevenueLink resolveHref={source?.href} className="inline-flex min-h-11 items-center rounded-lg border border-primary-200 bg-primary-50 px-3 text-sm text-primary-800" href={`${basePath}?${new URLSearchParams({...scopeQuery,dateFrom:from,dateTo:to,status:"PENDING",staff:staff??""})}`}>查看期間待核帳</RevenueLink>} />
    {musicNativeWorkflowEnabled(storeId)&&<MusicRevenueSync targetedTransactions/>}

    {legacy&&<p className="text-sm text-earth-600">舊驗收交易僅供查閱，不列入營運收款。</p>}
    {source?.tabs??<RevenueTabs readOnly={readOnly} />}
    {musicNativeWorkflowEnabled(storeId) ? <MusicRevenueMetrics key={`${storeId}:${from}:${to}:${params.dataScope??"operational"}`} initial={receiptTotals} from={from} to={to} dataScope={params.dataScope}/> : <>
    <KpiStrip items={[{ label: "期間收款收入", value: money(income), tone: "primary" }, { label: "體驗淨收入", value: money(receiptTotals.trial - receiptTotals.voids) }, { label: "期間退款", value: money(refund) }, { label: "方案淨收入", value: money(income - refund) }, { label: "收款筆數", value: `${receiptTotals.purchaseCount} 筆` }]} />
    <p className="rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-900">收款入帳合計 {money(receiptTotals.gross)} · 退款 {money(receiptTotals.refunds)} · 體驗沖銷 {money(receiptTotals.voids)} · <strong>淨收款 {money(receiptTotals.net)}</strong></p>
    </>}
    <div className="@container/revenue grid min-w-0 grid-cols-12 gap-2"><section className="col-span-12 min-w-0 rounded-xl border border-earth-200 bg-white">
      <div className="border-b p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-semibold">交易工作台</h2><p className="mt-0.5 text-[11px] text-earth-500">查詢購買、核帳及退款；交易處理集中在最右側。</p></div><nav aria-label="營運期間" className="flex rounded-lg bg-earth-100 p-1 text-sm"><RevenueLink resolveHref={source?.href} className={`rounded-md px-3 py-1.5 ${isToday?"bg-white font-medium text-primary-800 shadow-sm":"text-earth-600"}`} href={periodHref(today,today)}>本日</RevenueLink><RevenueLink resolveHref={source?.href} className={`rounded-md px-3 py-1.5 ${isMonth?"bg-white font-medium text-primary-800 shadow-sm":"text-earth-600"}`} href={periodHref(today.slice(0,7)+"-01",today)}>本月</RevenueLink><span className={`rounded-md px-3 py-1.5 ${!isToday&&!isMonth?"bg-white font-medium text-primary-800 shadow-sm":"text-earth-600"}`}>任意區間</span></nav></div>
        <InstantFilterForm key={JSON.stringify([from,to,status,staff,legacy])} className="mt-2 grid gap-2 grid-cols-1 @min-[26rem]/revenue:grid-cols-2 @min-[42rem]/revenue:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          {params.dataScope==="legacy"&&<input type="hidden" name="dataScope" value="legacy"/>}
          {Object.entries(source?.queryFields??{}).map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>)}
          <label className="text-xs">開始日期<input className={dateField} type="date" name="dateFrom" defaultValue={from} /></label>
          <label className="text-xs">結束日期<input className={dateField} type="date" name="dateTo" defaultValue={to} /></label>
          <label className="text-xs">狀態<select className={selectField} style={selectStyle} name="status" defaultValue={status ?? ""}><option value="">全部</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="text-xs">核帳人員<select className={selectField} style={selectStyle} name="staff" defaultValue={staff ?? ""}><option value="">全部</option>{staffRows.filter((s) => s.userId && (s.user?.role === "OWNER" || s.user?.role === "ADMIN" || rows.some(order => order.confirmedBy === s.userId))).map((s) => <option key={s.userId} value={s.userId!}>{s.displayName}</option>)}</select></label>
          <RevenueLink resolveHref={source?.href} href={`${basePath}?${new URLSearchParams(scopeQuery)}`} className="flex h-11 items-center justify-center self-end rounded-lg border border-earth-200 px-3 text-sm text-earth-600">清除</RevenueLink>
        </InstantFilterForm>
      </div>
      <CourseRevenueTransactions key={JSON.stringify([storeId,from,to,status,staff,params.page,params.dataScope])} initial={detail} input={{from,to,status,staff,page:params.page,dataScope:params.dataScope}} staffRows={staffRows} basePath={basePath} live={musicNativeWorkflowEnabled(storeId)} canRefund={canRefund} canConfirm={canConfirm} canEdit={canEdit} canVoid={canVoid}/>

    </section><aside className="col-span-12 min-w-0"><details className="rounded-lg border border-earth-200 bg-white px-3"><summary className="min-h-11 cursor-pointer py-2 text-sm text-primary-800">相關工具與退款規則</summary><div className="grid gap-2 sm:grid-cols-2"><SideCard title="相關工具" subtitle="依工作目的快速前往"><div className="divide-y divide-earth-100 text-sm"><div className="space-y-2 py-2"><p className="text-[11px] font-medium text-earth-400">日常處理</p><RevenueLink resolveHref={source?.href} className="block" href={`/dashboard/transactions?${new URLSearchParams({...scopeQuery,dateFrom:from,dateTo:to,status:status??"",staff:staff??""})}`}>交易明細與處理 →</RevenueLink><RevenueLink resolveHref={source?.href} className="block" href={`/dashboard/courses?${new URLSearchParams({view:"plans",...scopeQuery})}`}>方案與待核帳訂單 →</RevenueLink></div><div className="space-y-2 py-2"><p className="text-[11px] font-medium text-earth-400">帳務管理</p><RevenueLink resolveHref={source?.href} className="block" href="/dashboard/cashbook">現金帳 →</RevenueLink><FeatureEntry feature={FEATURES.SERVICE_FEE_CALCULATOR} label="月結管理"><RevenueLink resolveHref={source?.href} className="block" href={`/dashboard/service-fee-calculator?${new URLSearchParams(scopeQuery)}`}>月結管理 →</RevenueLink></FeatureEntry><RevenueLink resolveHref={source?.href} className="block" href="/dashboard/reconciliation">對帳中心 →</RevenueLink></div><div className="space-y-2 py-2"><p className="text-[11px] font-medium text-earth-400">報表</p><RevenueLink resolveHref={source?.href} className="block" href={`/dashboard/store-revenue?${new URLSearchParams(scopeQuery)}`}>收入總覽與匯出 →</RevenueLink>{canDataExport && !readOnly && <RevenueLink resolveHref={source?.href} className="block" href="/dashboard/data-export">資料匯出 →</RevenueLink>}</div></div></SideCard><SideCard title="退款"><details><summary className="min-h-11 cursor-pointer py-3 text-primary-700">查看協商退款規則</summary><p className="text-sm">具退款權限的店長可登錄協商金額、方式及原因；累計不超過實付，有預約占用時先處理。確認後收回剩餘額度並停用卡片，保留原單及歷史。此操作不會自動匯款或退刷。</p></details></SideCard></div></details></aside></div>
    <Suspense fallback={<p role="status">讀取授課費…</p>}><CourseFees dataScope={params.dataScope} storeId={storeId} range={range} readOnly={readOnly}/></Suspense>
    <Suspense fallback={<p role="status">讀取體驗交易…</p>}><CourseTrialTransactions dataScope={params.dataScope} storeId={storeId} range={range} readOnly={readOnly} page={Math.max(1,Number(params.trialPage)||1)} basePath={basePath} query={{...scopeQuery,dateFrom:from,dateTo:to,status:status??"",staff:staff??""}} status={status} staff={staff}/></Suspense>
  </PageShell></MusicRevenueLive>);
}
