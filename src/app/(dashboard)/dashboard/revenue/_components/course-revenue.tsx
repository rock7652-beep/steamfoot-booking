import {OperationsReceiptSummary} from "@/components/operations/receipt-summary";
import {musicPurchaseWhere} from "@/server/services/music-finance-scope";
import type {CourseRevenueSource} from "./course-revenue-source";
import type {ComponentProps} from "react";
import {musicNativeWorkflowEnabled} from "@/server/services/music-native-workflow";
import {courseAllocationAfterRefund} from "@/lib/course-sale-allocation";
import {coursePrisma} from "@/lib/course-db";
import {MusicRevenueLive} from "@/components/admin/music-revenue-live";
import {getMusicRevenueTransactions} from "@/server/queries/music-revenue-transactions";
import {CourseRevenueTransactions} from "./course-revenue-transactions";
import {MusicRevenueMetrics} from "@/components/admin/music-revenue-metrics";
import { MusicRevenueSync } from "@/components/admin/music-revenue-sync";
import { musicDataScope } from "@/server/services/music-data-scope";
import { InstantFilterForm } from "@/components/instant-filter-form";

import { getCourseRevenueReport } from "@/server/queries/course-revenue-report";
import { getCourseReceiptTotals } from "@/server/queries/course-home";
import {CourseTrialTransactions} from "./course-trial-transactions";
import { prisma } from "@/lib/db";
import { dayRange, toLocalDateStr, formatTWTime } from "@/lib/date-utils";
import { PageShell, PageHeader, DataTable, EmptyRow, type Column } from "@/components/desktop";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { OperationsTabs } from "./operations-tabs";
import { CourseTransactionActions } from "./course-transaction-actions";
function RevenueLink({resolveHref,href,...props}:ComponentProps<typeof Link>&{resolveHref?:CourseRevenueSource["href"]}){return <Link {...props} href={resolveHref?resolveHref(String(href)):href}/>;}
const money = (amount: number) => `NT$ ${amount.toLocaleString()}`;
export async function CourseRevenue({ source,storeId, params, readOnly, canRefund, canConfirm, canEdit, canVoid, basePath = "/dashboard/revenue" }: {
  source?:CourseRevenueSource;storeId: string; params: { kind?:string;dataScope?:string;summary?: string; dateFrom?: string; dateTo?: string; page?: string; trialPage?: string; status?: string; staff?: string };
  canEdit: boolean; canVoid: boolean; readOnly: boolean; canRefund: boolean; canConfirm: boolean;
  basePath?: "/dashboard/revenue" | "/dashboard/transactions";
  canDataExport?: boolean;
}) {
  const legacy=musicDataScope(storeId,params.dataScope)==="legacy";
  const scopeQuery:Record<string,string>={...(legacy?{dataScope:"legacy"}:{}),...(params.kind?{kind:params.kind}:{})};
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
    ...(source?.columns??[]),
    { key: "action", header: "處理", noLink: true, accessor: (r) => {const allocation=r.storeCostSnapshot==null?"舊交易待補":r.status==="VOIDED"?"已作廢":(()=>{const a=courseAllocationAfterRefund(r.price,r.storeCostSnapshot,r.refunds.reduce((n,v)=>n+v.amount,0));return `店家 NT$ ${a.storeAmount.toLocaleString()}／開發人 NT$ ${a.developerAmount.toLocaleString()}`;})();return source?source.actions(r):<CourseTransactionActions quiet order={r} allocationSummary={allocation} canRefund={canRefund} canConfirm={canConfirm} canEdit={canEdit} canVoid={canVoid} staffOptions={staffRows.filter((s) => s.status === "ACTIVE").map((s) => ({ id: s.id, name: s.displayName }))} />;} },
  ];
  const income = receiptTotals.purchases;
  const pendingCount=sourceSnapshot?sourceSnapshot.pendingCount:await coursePrisma.coursePurchase.count({where:{storeId,createdAt:range,status:"PENDING",...musicPurchaseWhere(storeId,params.dataScope)}});
  const field = "mt-1 block h-11 w-full rounded-lg border border-earth-300 bg-white px-3 py-0 text-sm leading-none text-earth-800";
  const dateField = `${field} leading-normal`;
  const selectField = `${field} appearance-none pr-9`;
  const selectStyle = {backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,backgroundRepeat:"no-repeat",backgroundPosition:"right 12px center"};
  const periodHref = (dateFrom: string, dateTo: string) => `${basePath}?${new URLSearchParams({...scopeQuery,dateFrom,dateTo,status:status??"",staff:staff??""})}`;
  const isToday = from === today && to === today;
  const isMonth = from === today.slice(0, 7) + "-01" && to === today;
  const kind=params.kind==="plans"||params.kind==="trial"?params.kind:"all";
  const showPlans=!!source||kind!=="trial",showTrials=!source&&kind!=="plans";
  const ledger=(<PageShell compact>
    <PageHeader compact title={basePath==="/dashboard/transactions"?"交易明細":"營運"} actions={<RevenueLink resolveHref={source?.href} className="inline-flex min-h-11 items-center rounded-lg border border-primary-200 bg-primary-50 px-3 text-sm text-primary-800" href={`${basePath}?${new URLSearchParams({...scopeQuery,dateFrom:from,dateTo:to,status:"PENDING"})}`}>待核帳</RevenueLink>}/>
    {source?.tabs??<OperationsTabs query={{...params,dateFrom:from,dateTo:to}}/>}
    {source?<OperationsReceiptSummary gross={receiptTotals.gross} refunds={receiptTotals.refunds} net={receiptTotals.net} pendingCount={pendingCount}><p>核帳／收款及退款按發生日；清單依購買日期，皆為台灣時間。</p><p>方案收款 {money(income)}・體驗收款 {money(receiptTotals.trial)}・體驗沖銷 {money(receiptTotals.voids)}</p></OperationsReceiptSummary>:<MusicRevenueMetrics initial={receiptTotals} from={from} to={to} dataScope={params.dataScope} compact pendingCount={pendingCount}/>}
    <div className="grid grid-cols-12 gap-3 items-start"><section className="col-span-12 min-w-0 rounded-xl border border-earth-200 bg-white">
      <div className="border-b p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">交易工作台</h2><nav aria-label="營運期間" className="flex rounded-lg bg-earth-100 p-1 text-sm"><RevenueLink resolveHref={source?.href} className={`rounded-md px-3 py-1.5 ${isToday?"bg-white font-medium text-primary-800 shadow-sm":"text-earth-600"}`} href={periodHref(today,today)}>本日</RevenueLink><RevenueLink resolveHref={source?.href} className={`rounded-md px-3 py-1.5 ${isMonth?"bg-white font-medium text-primary-800 shadow-sm":"text-earth-600"}`} href={periodHref(today.slice(0,7)+"-01",today)}>本月</RevenueLink><span className={`rounded-md px-3 py-1.5 ${!isToday&&!isMonth?"bg-white font-medium text-primary-800 shadow-sm":"text-earth-600"}`}>任意區間</span></nav></div>
        <InstantFilterForm className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries({...Object.fromEntries(Object.entries(scopeQuery).filter(([key])=>key!=="kind")),...source?.queryFields}).map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>)}
          <label className="text-xs">開始日期<input className={dateField} type="date" name="dateFrom" defaultValue={from} /></label>
          <label className="text-xs">結束日期<input className={dateField} type="date" name="dateTo" defaultValue={to} /></label>
          {!source&&<label className="text-xs">交易類型<select className={selectField} style={selectStyle} name="kind" defaultValue={kind}><option value="all">全部交易</option><option value="plans">方案購買</option><option value="trial">體驗交易</option></select></label>}
          <label className="text-xs">狀態<select className={selectField} style={selectStyle} name="status" defaultValue={status ?? ""}><option value="">全部</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="text-xs">核帳人員<select className={selectField} style={selectStyle} name="staff" defaultValue={staff ?? ""}><option value="">全部</option>{staffRows.filter((s) => s.userId && (s.user?.role === "OWNER" || s.user?.role === "ADMIN" || rows.some(order => order.confirmedBy === s.userId))).map((s) => <option key={s.userId} value={s.userId!}>{s.displayName}</option>)}</select></label>
          <RevenueLink resolveHref={source?.href} href={basePath} className="flex h-11 items-center justify-center self-end rounded-lg border border-earth-200 px-3 text-sm text-earth-600">清除</RevenueLink>
        </InstantFilterForm><p className="mt-3 text-sm text-earth-600">共 {count} 筆購買紀錄；查看明細可處理核帳、退款與更正。</p>
      </div>
      {showPlans&&<>{!source?<CourseRevenueTransactions initial={detail} input={{from,to,status,staff,page:params.page,dataScope:params.dataScope}} live={musicNativeWorkflowEnabled(storeId)} basePath={basePath} canRefund={canRefund} canConfirm={canConfirm} canEdit={canEdit} canVoid={canVoid} staffRows={staffRows}/>:rows.length ? <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} className="rounded-none border-0" /> : <EmptyRow title="沒有符合條件的交易" hint="調整日期或篩選條件重新查詢" />}
      {source && pages > 1 && <div className="flex justify-between p-3 text-sm"><span>第 {page} / {pages} 頁</span><div className="flex gap-4">{page > 1 && <RevenueLink resolveHref={source?.href} href={href(page - 1)}>上一頁</RevenueLink>}{page < pages && <RevenueLink resolveHref={source?.href} href={href(page + 1)}>下一頁</RevenueLink>}</div></div>}
    </>}
      {showTrials&&<CourseTrialTransactions embedded storeId={storeId} range={range} readOnly={readOnly} page={Math.max(1,Number(params.trialPage)||1)} basePath={basePath} query={{...scopeQuery,dateFrom:from,dateTo:to,status:status??"",staff:staff??""}} status={status} staff={staff} dataScope={params.dataScope}/>}
    </section></div>
  </PageShell>);
  return source?ledger:<MusicRevenueLive key={JSON.stringify([storeId,from,to,status,staff,params.page,params.dataScope])} initial={{totals:receiptTotals,transactions:detail}} input={{from,to,status,staff,page:params.page,dataScope:params.dataScope}} enabled={musicNativeWorkflowEnabled(storeId)}>{ledger}</MusicRevenueLive>;
}
