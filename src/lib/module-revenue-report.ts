import type {ReportFilters,TransactionDetail,StoreRevenueSummary} from '@/lib/report-queries';
import {paymentMethodReportAmount,type PaymentSplitInput} from '@/lib/payment-splits';
import {sumBeautySaleShares,type BeautySaleShare} from '@/lib/beauty/receipt-allocation';
export type ModuleRevenueRow=TransactionDetail&{customerId:string|null;staffId:string|null;refund:boolean;unit:string;paymentSplits:PaymentSplitInput[];saleAllocation?:BeautySaleShare};
/** One filter and aggregation core for the original course/service report and exports. */
export function moduleRevenueReport(rows:ModuleRevenueRow[],storeId:string,storeName:string,filters:ReportFilters){
  const keyword=filters.keyword?.trim().toLocaleLowerCase();
  const data=rows.filter((r)=>(!filters.planType||r.unit===filters.planType)&&(!filters.paymentMethod||paymentMethodReportAmount({paymentMethod:r.paymentMethod,amount:r.netAmount,paymentSplits:r.paymentSplits},filters.paymentMethod)!==0)&&(!filters.coachId||r.staffId===filters.coachId)&&(!filters.coachRole||r.coachRole===filters.coachRole)&&(!keyword||[r.customerName,r.customerPhone,r.planName,r.note].some((s)=>s?.toLocaleLowerCase().includes(keyword)))).map(r=>filters.paymentMethod ? {...r,netAmount:paymentMethodReportAmount({paymentMethod:r.paymentMethod,amount:r.netAmount,paymentSplits:r.paymentSplits},filters.paymentMethod)} : r).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
  const totalRevenue=data.filter((r)=>!r.refund).reduce((n,r)=>n+r.netAmount,0);
  const refundAmount=Math.abs(data.filter((r)=>r.refund).reduce((n,r)=>n+r.netAmount,0));
  const netRevenue=totalRevenue-refundAmount;
  const customerCount=new Set(data.filter((r)=>!r.refund).map((r)=>r.customerId).filter((id): id is string => !!id)).size;
  const kpi={totalRevenue,refundAmount,netRevenue,txCount:data.filter((r)=>!r.refund).length,customerCount,avgPerCustomer:customerCount?Math.round(netRevenue/customerCount):0,...(data.some(row=>row.saleAllocation!==undefined)?{saleAllocation:sumBeautySaleShares(data)}:{})};
  const summary:StoreRevenueSummary[] = data.length ? [{...kpi,storeId,storeName:storeName,trialRevenue:data.filter(r=>r.unit==="TRIAL").reduce((n,r)=>n+r.netAmount,0),packageRevenue:data.filter(r=>r.unit!=="TRIAL"&&r.unit!=="SINGLE"&&!r.refund).reduce((n,r)=>n+r.netAmount,0),singleRevenue:data.filter(r=>r.unit==="SINGLE"&&!r.refund).reduce((n,r)=>n+r.netAmount,0),otherRevenue:0}] : [];
  const methods = new Map<string,number>();
  for (const row of data.filter(r=>!r.refund)) for (const split of filters.paymentMethod ? [{paymentMethod:filters.paymentMethod,amount:row.netAmount}] : row.paymentSplits.length ? row.paymentSplits : [{paymentMethod:row.paymentMethod,amount:row.netAmount}]) methods.set(split.paymentMethod,(methods.get(split.paymentMethod)??0)+split.amount);
  return {data,summary,kpi,paymentMethods:[...methods].map(([paymentMethod,amount])=>({paymentMethod,amount}))};
}

export function moduleStaffRevenueSummary(report:ReturnType<typeof moduleRevenueReport>){
 const ids=[...new Set(report.data.map(row=>row.staffId))];
 return ids.map(id=>{const rows=report.data.filter(row=>row.staffId===id),base=rows[0],kpi=moduleRevenueReport(rows,'',base.storeName,{startDate:'',endDate:'',storeFilter:{}}).kpi;
 return {...kpi,coachId:id??'unassigned',coachName:base.coachName??'未指派',coachRole:base.coachRole??'',storeName:base.storeName,avgPerTx:kpi.txCount?Math.round(kpi.netRevenue/kpi.txCount):0,newCustomerRevenue:rows.filter(r=>r.isFirstPurchase).reduce((n,r)=>n+r.netAmount,0),existingCustomerRevenue:rows.filter(r=>!r.isFirstPurchase).reduce((n,r)=>n+r.netAmount,0),trialRevenue:rows.filter(r=>r.unit==='TRIAL').reduce((n,r)=>n+r.netAmount,0),packageRevenue:rows.filter(r=>(r.unit==='SESSION'||r.unit==='PACKAGE')).reduce((n,r)=>n+r.netAmount,0),singleRevenue:rows.filter(r=>r.unit==='SINGLE').reduce((n,r)=>n+r.netAmount,0),otherRevenue:rows.filter(r=>['RETAIL','OTHER','SUPPLEMENT'].includes(r.unit)).reduce((n,r)=>n+r.netAmount,0)};});
}
