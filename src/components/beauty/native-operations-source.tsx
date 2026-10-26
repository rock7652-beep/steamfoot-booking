import {BeautyRevenueBreakdownView} from "./revenue-breakdown-view";
import {readBeautyRevenueBreakdown} from "@/server/beauty/revenue-breakdown";
import {DashboardLink} from "@/components/dashboard-link";
import {toLocalDateStr} from "@/lib/date-utils";
import {hasStoreFeature} from "@/lib/feature-gate";
import {FEATURES} from "@/lib/feature-flags";
import {beautyAllocationSummary} from '@/lib/beauty/sale-allocation';
import {CourseRevenue} from '@/app/(dashboard)/dashboard/revenue/_components/course-revenue';
import {RevenueTabs} from '@/app/(dashboard)/dashboard/revenue/_components/revenue-tabs';
import {readBeautyRevenue,readBeautyReceiptSummary} from '@/server/beauty/native-revenue';
import {BeautyNativeTransaction} from './native-transaction-source';
import {BeautyNativeFeeReport} from './native-fee-source';
import {IncomeMonthFilter} from '@/components/income-month-filter';
import {PageShell,PageHeader} from '@/components/desktop';
import {beautyPrisma} from '@/lib/beauty-db';
import {beautyManager} from '@/server/beauty/access';
import {getCurrentUser} from '@/lib/session';
import {checkPermission} from '@/lib/permissions';
import type {BeautyDashboardData} from '@/server/beauty/queries';

function beautyRevenueHref(original:string){
 const [path,query]=original.split('?');
 if(path==='/dashboard')return '/dashboard/beauty';
 if(path==='/dashboard/revenue'||path==='/dashboard/transactions'){const q=new URLSearchParams(query);q.set('tab','營運');return `/dashboard/beauty?${q}`;}
 if(path==='/dashboard/courses'){const q=new URLSearchParams({tab:'收費方式'});return `/dashboard/beauty?${q}`;}
 if(path==='/dashboard/service-fee-calculator')return '/dashboard/beauty?tab=營運&area=fees';
 return original;
}
export async function BeautyNativeOperations({data,query,readOnly}:{data:BeautyDashboardData;query:{dateFrom?:string;dateTo?:string;status?:string;staff?:string;page?:string;summary?:string;area?:string};readOnly:boolean}){
 const u=await getCurrentUser();
 const canEdit=!readOnly&&!!u&&await checkPermission(u.role,u.staffId,'transaction.create'),canVoid=!readOnly&&!!u&&await checkPermission(u.role,u.staffId,'transaction.void');
 const canFees=!!u&&data.access.feeAccess&&await checkPermission(u.role,u.staffId,'teacher.settlement.read');
 const canBreakdown=!!u&&data.access.financeAccess&&await checkPermission(u.role,u.staffId,'report.read')&&await hasStoreFeature(data.storeId,FEATURES.BASIC_REPORTS);
 const today=toLocalDateStr(),from=query.dateFrom??today.slice(0,7)+'-01',to=query.dateTo??today;
 const ledgerHref='/dashboard/beauty?'+new URLSearchParams({tab:'營運',dateFrom:from,dateTo:to});
 const breakdownHref=ledgerHref+'&area=income';
 const tabs=<RevenueTabs readOnly={readOnly} ledgerHref={query.area==='income'?ledgerHref:undefined} extra={canBreakdown?(query.area==='income'?<span className="min-h-11 rounded-lg border-b-2 border-primary-600 px-3 py-2 text-sm font-medium text-primary-700" aria-current="page">收入分類</span>:<DashboardLink className="flex min-h-11 items-center rounded-lg px-3 py-2 text-sm text-primary-700" href={breakdownHref}>收入分類</DashboardLink>):null}/>;
 if(query.area==='income'){
  if(!canBreakdown)return <PageShell compact>{tabs}<p role="alert">目前沒有收入分類報表權限。</p></PageShell>;
  const breakdown=await readBeautyRevenueBreakdown(data.storeId,{from,to});
  return <BeautyRevenueBreakdownView data={breakdown} tabs={tabs}/>;
 }
 let fees=null;
 if(canFees&&data.report){
  await beautyManager('teacher.settlement.read');
  const last=await beautyPrisma.beautySettlement.findFirst({where:{storeId:data.storeId,month:data.month},orderBy:[{createdAt:'desc'},{id:'desc'}],select:{fingerprint:true}});
  const lines=data.report.lines.map(l=>({kind:'FEE' as const,id:l.id,staffId:l.technicianId,name:data.techs.find(t=>t.id===l.technicianId)?.name??'技師',label:`${l.personName} · ${l.serviceName}`,date:l.date,amount:l.fee,paid:l.paid,issue:null,payments:[]}));
  fees=<section className="space-y-3"><PageHeader compact title="技師拆帳月結" actions={<IncomeMonthFilter month={data.month}/>}/><BeautyNativeFeeReport storeId={data.storeId} lines={lines} month={data.month} fingerprint={data.report.fingerprint} confirmed={last?.fingerprint===data.report.fingerprint} previous={!!last} canConfirm={!readOnly&&data.manage.feeConfirm}/></section>;
 }
 if(query.area==='fees'||!data.access.financeAccess)return <PageShell compact>{tabs}{fees??<p role="alert">目前沒有技師拆帳檢視權限。</p>}</PageShell>;
 return <CourseRevenue storeId={data.storeId} params={query} readOnly={readOnly} canRefund={!readOnly&&data.manage.refund} canConfirm={!readOnly&&data.manage.card} canEdit={canEdit} canVoid={canVoid} source={{tabs,columns:[
 {key:'assigned-manager',header:'所屬店長',accessor:row=>data.assignmentStaff.find(s=>s.id===row.revenueStaffId)?.displayName??(row.revenueStaffId?'人員資料待核對':'未歸屬')},
 {key:'technician',header:'服務技師',accessor:row=>row.technicianName??'—'},
 {key:'allocation',header:'店家／所屬店長',accessor:beautyAllocationSummary},
 ],statusLabels:{CONFIRMED:"已收款"},read:readBeautyRevenue,summary:readBeautyReceiptSummary,href:beautyRevenueHref,queryFields:{tab:'營運'},fees,actions:order=><BeautyNativeTransaction allocationSummary={beautyAllocationSummary(order)} canEdit={canEdit} canVoid={canVoid} staffOptions={data.assignmentStaff.map(s=>({id:s.id,name:s.displayName}))} storeId={data.storeId} order={order} cardAccess={data.access.planAccess} canRefund={!readOnly&&data.manage.refund} canConfirm={!readOnly&&data.manage.card}/>}}/>;
}
