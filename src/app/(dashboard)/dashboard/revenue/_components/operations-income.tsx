import { InstantFilterForm } from "@/components/instant-filter-form";
import { DataTable, type Column } from "@/components/desktop";
import { getCourseRevenueReport } from "@/server/queries/course-revenue-report";
import { readSteamfootIncome } from "@/server/queries/steamfoot-income";
import {OperationsReceiptSummary} from "@/components/operations/receipt-summary";
import { readBeautyRevenueBreakdown } from "@/server/beauty/revenue-breakdown";
import { BeautyRevenueBreakdownView } from "@/components/beauty/revenue-breakdown-view";
import { toLocalDateStr } from "@/lib/date-utils";
import type { IndustryModuleId } from "@/lib/industry-modules";
import type { OperationsQuery } from "@/lib/operations-navigation";
const money=(value:number)=>`NT$ ${value.toLocaleString()}`;
export async function OperationsIncome({storeId,industry,query}:{storeId:string;industry:IndustryModuleId;query:OperationsQuery}) {
  const today=toLocalDateStr(),from=query.dateFrom??today.slice(0,7)+"-01",to=query.dateTo??today;
  const date=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
  if(!date(from)||!date(to)||from>to)return <p role="alert">請選擇有效的日期區間。</p>;
  if(industry==="beauty")return <BeautyRevenueBreakdownView data={await readBeautyRevenueBreakdown(storeId,{from,to,includeTechnicians:false})}/>;
  const filters={startDate:from,endDate:to,storeFilter:{storeId},dataScope:query.dataScope};
  const summary=industry==="course"?await getCourseRevenueReport(storeId,filters):null;
  const steam=summary?null:await readSteamfootIncome(storeId,from,to);
  const total=summary?{trial:summary.data.filter(r=>r.unit==="TRIAL"&&!r.refund).reduce((n,r)=>n+r.netAmount,0),single:summary.data.filter(r=>r.unit==="SINGLE"&&!r.refund).reduce((n,r)=>n+r.netAmount,0),plan:summary.data.filter(r=>r.unit!=="TRIAL"&&r.unit!=="SINGLE"&&!r.refund).reduce((n,r)=>n+r.netAmount,0),other:0,retail:undefined,otherIncome:undefined,manual:undefined,systemRefund:undefined,inventoryRefund:undefined,inventoryReversal:undefined,refund:summary.kpi.refundAmount,net:summary.kpi.netRevenue}:steam!;
  const rows=[{id:"trial",name:"體驗",amount:total.trial},{id:"single",name:"單次",amount:total.single},{id:"plan",name:"方案／課程",amount:total.plan},{id:"other",name:summary?"其他":"補差額",amount:total.other},...(total.retail!==undefined?[{id:"retail",name:"零售收入",amount:total.retail},{id:"other-income",name:"其他收入",amount:total.otherIncome??0}]:[])];
  const columns:Column<typeof rows[number]>[]=[{key:"name",header:"收入分類",accessor:r=>r.name},{key:"amount",header:"收款金額（退款另列）",align:"right",accessor:r=>money(r.amount)}];
  return <section className="min-w-0 space-y-3"><h2 className="font-semibold">收入分類</h2>
    <InstantFilterForm className="flex flex-wrap gap-3"><input type="hidden" name="area" value="income"/>{query.dataScope&&<input type="hidden" name="dataScope" value={query.dataScope}/>}
      <label>開始日期<input aria-label="分類開始日期" className="mt-1 block min-h-11 rounded-lg border px-3" type="date" name="dateFrom" defaultValue={from}/></label>
      <label>結束日期<input aria-label="分類結束日期" className="mt-1 block min-h-11 rounded-lg border px-3" type="date" name="dateTo" defaultValue={to}/></label>
    </InstantFilterForm>
    <p className="text-sm text-earth-600">{summary?"依核帳／收款及退款發生日統計；手動收支請查看現金帳。":"系統收退款依發生日；零售與其他收入依現金帳登錄日期，含進銷存已收款，與營收明細摘要一致。"}人員費用請查看月結管理。</p>
    <OperationsReceiptSummary refundLabel={summary?"退款":"退款／沖回"} gross={total.net+total.refund} refunds={total.refund} net={total.net}>{!summary&&<p>系統退款 {money(total.systemRefund??0)} · 進銷存退款 {money(total.inventoryRefund??0)} · 更正沖回 {money(total.inventoryReversal??0)}</p>}</OperationsReceiptSummary>
    <DataTable columns={columns} rows={rows} rowKey={row=>row.id}/>
  </section>;
}
