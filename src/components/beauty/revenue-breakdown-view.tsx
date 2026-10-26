import type {ReactNode} from 'react';
import {PageShell,PageHeader,DataTable,type Column} from '@/components/desktop';
import {InstantFilterForm} from '@/components/instant-filter-form';
import type {BeautyRevenueBreakdownData} from '@/server/beauty/revenue-breakdown';
const money=(value:number)=>`NT$ ${value.toLocaleString()}`;
export function BeautyRevenueBreakdownView({data,tabs}:{data:BeautyRevenueBreakdownData;tabs?:ReactNode}){
 const total=data.totals;
 const fees=data.technicians?.reduce((n,r)=>({fee:n.fee+r.fee,paid:n.paid+r.paid,unpaid:n.unpaid+r.unpaid,overpaid:n.overpaid+r.overpaid}),{fee:0,paid:0,unpaid:0,overpaid:0});
 type Manager=typeof data.managers[number];
 const managers:Column<Manager>[]=[
  {key:'name',header:'顧客所屬店長',accessor:r=>r.name},
  {key:'net',header:'顧客消費淨收款',accessor:r=>money(r.net)},
  {key:'store',header:'分配給店家',accessor:r=>money(r.storeAmount)},
  {key:'manager',header:'所屬店長分潤',accessor:r=>money(r.managerAmount)},
  {key:'unassigned',header:'未歸屬',accessor:r=>money(r.unassignedAmount)},
  {key:'unknown',header:'待核對',accessor:r=>money(r.unknownAmount)},
  ...(data.hasDifferences?[{key:'difference',header:'差額',accessor:(r:Manager)=>money(r.difference)}]:[]),
 ];
 type Technician=NonNullable<typeof data.technicians>[number];
 const techs:Column<Technician>[]=[{key:'name',header:'技師',accessor:r=>r.name},{key:'count',header:'完成服務',accessor:r=>`${r.services} 次`},{key:'fee',header:'應付服務費',accessor:r=>money(r.fee)},{key:'paid',header:'累計已付',accessor:r=>money(r.paid)},{key:'unpaid',header:'尚未支付',accessor:r=>money(r.unpaid)},{key:'overpaid',header:'超付待核對',accessor:r=>money(r.overpaid)}];
 return <PageShell compact>
  <PageHeader compact title="收入分類"/>{tabs}
  <InstantFilterForm className="flex min-w-0 flex-wrap items-end gap-3"><input type="hidden" name="tab" value="營運"/><input type="hidden" name="area" value="income"/>
   <label>開始日期<input aria-label="分類開始日期" name="dateFrom" type="date" defaultValue={data.from} className="mt-1 block min-h-11 min-w-0 rounded-lg border border-earth-200 px-3"/></label>
   <label>結束日期<input aria-label="分類結束日期" name="dateTo" type="date" defaultValue={data.to} className="mt-1 block min-h-11 min-w-0 rounded-lg border border-earth-200 px-3"/></label>
  </InstantFilterForm>
  <section className="space-y-3" aria-label="店家與店長收入">
   <h2 className="font-semibold">店家／店長分配</h2>
   <p className="text-sm text-earth-600">依 {data.from}–{data.to} 的有效收退款入帳日彙總，包含整個期間的交易。</p>
   <div className="flex min-w-0 flex-wrap gap-x-6 gap-y-2 border-y border-earth-200 py-3 text-sm"><span>實收 <strong>{money(total.gross)}</strong></span><span>退款 <strong>{money(total.refunds)}</strong></span><span>淨收款 <strong>{money(total.net)}</strong></span></div>
   <div className="flex min-w-0 flex-wrap gap-x-6 gap-y-2 text-sm"><span>店家分配 <strong>{money(total.storeAmount)}</strong></span><span>所屬店長分潤 <strong>{money(total.managerAmount)}</strong></span><span>未歸屬 <strong>{money(total.unassignedAmount)}</strong></span><span>待核對 <strong>{money(total.unknownAmount)}</strong></span></div>
   <p role={data.hasDifferences?'alert':'status'} className={data.hasDifferences?'text-red-700':'text-sm text-earth-600'}>{data.hasDifferences?'有分配差額，請核對下方差額欄與原交易。':'分類合計與淨收款一致。'}</p>
  </section>
  <section className="min-w-0 space-y-2" aria-label="所屬店長彙總"><h2 className="font-semibold">顧客所屬店長</h2><p className="text-sm text-earth-600">沿用原收款的歸屬與分配紀錄；缺少固定費用紀錄的金額列為待核對。</p>{data.managers.length?<DataTable columns={managers} rows={data.managers} rowKey={r=>r.id}/>:<p>此期間沒有有效收退款。</p>}</section>
  {data.technicians!==null&&<section className="min-w-0 space-y-2" aria-label="技師服務費彙總"><h2 className="font-semibold">技師服務費</h2><p className="text-sm text-earth-600">服務費為另列的應付成本。應付按已完成服務的服務日統計；已付為這批服務的累計付款，包含付款沖回。</p>{fees&&<div className="flex flex-wrap gap-x-6 gap-y-2 text-sm"><span>服務費合計 <strong>{money(fees.fee)}</strong></span><span>累計已付 <strong>{money(fees.paid)}</strong></span><span>尚未支付 <strong>{money(fees.unpaid)}</strong></span><span>超付待核對 <strong>{money(fees.overpaid)}</strong></span></div>}{data.technicians.length?<DataTable columns={techs} rows={data.technicians} rowKey={r=>r.id}/>:<p>此期間沒有已完成服務的技師費用。</p>}</section>}
 </PageShell>;
}
