import { InstantFilterForm } from "@/components/instant-filter-form";
import { DataTable, type Column } from "@/components/desktop";
import { getCourseRevenueReport } from "@/server/queries/course-revenue-report";
import { getStoreRevenueSummary } from "@/lib/report-queries";
import { requireInventoryFinanceAccess } from "@/server/inventory-finance-access";
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
  if(industry!=="course")await requireInventoryFinanceAccess(storeId);
  const summary=industry==="course"?await getCourseRevenueReport(storeId,filters):null;
  const steam=summary?[]:await getStoreRevenueSummary(filters);
  const total=summary?{trial:summary.data.filter(r=>r.unit==="TRIAL"&&!r.refund).reduce((n,r)=>n+r.netAmount,0),single:summary.data.filter(r=>r.unit==="SINGLE"&&!r.refund).reduce((n,r)=>n+r.netAmount,0),plan:summary.data.filter(r=>r.unit!=="TRIAL"&&r.unit!=="SINGLE"&&!r.refund).reduce((n,r)=>n+r.netAmount,0),other:0,refund:summary.kpi.refundAmount,net:summary.kpi.netRevenue}:steam.reduce((n,row)=>({trial:n.trial+row.trialRevenue,single:n.single+row.singleRevenue,plan:n.plan+row.packageRevenue,other:n.other+row.otherRevenue,refund:n.refund+row.refundAmount,net:n.net+row.netRevenue}),{trial:0,single:0,plan:0,other:0,refund:0,net:0});
  const rows=[{id:"trial",name:"體驗",amount:total.trial},{id:"single",name:"單次",amount:total.single},{id:"plan",name:"方案／課程",amount:total.plan},{id:"other",name:"其他",amount:total.other}];
  const columns:Column<typeof rows[number]>[]=[{key:"name",header:"收入分類",accessor:r=>r.name},{key:"amount",header:"收款金額（退款另列）",align:"right",accessor:r=>money(r.amount)}];
  return <section className="min-w-0 space-y-3"><h2 className="font-semibold">收入分類</h2>
    <InstantFilterForm className="flex flex-wrap gap-3"><input type="hidden" name="area" value="income"/>{query.dataScope&&<input type="hidden" name="dataScope" value={query.dataScope}/>}
      <label>開始日期<input aria-label="分類開始日期" className="mt-1 block min-h-11 rounded-lg border px-3" type="date" name="dateFrom" defaultValue={from}/></label>
      <label>結束日期<input aria-label="分類結束日期" className="mt-1 block min-h-11 rounded-lg border px-3" type="date" name="dateTo" defaultValue={to}/></label>
    </InstantFilterForm>
    <p className="text-sm text-earth-600">沿用收入報表口徑；課程依核帳／收款及退款發生日。手動收支請查看現金帳，人員費用請查看月結管理。</p>
    <DataTable columns={columns} rows={rows} rowKey={row=>row.id}/>
    <p className="text-sm">退款／沖銷 {money(total.refund)} · 淨收款 <strong>{money(total.net)}</strong></p>
  </section>;
}
