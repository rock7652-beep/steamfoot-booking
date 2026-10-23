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
 const canFees=!!u&&data.access.feeAccess&&await checkPermission(u.role,u.staffId,'teacher.settlement.read');
 let fees=null;
 if(canFees&&data.report){
  await beautyManager('teacher.settlement.read');
  const last=await beautyPrisma.beautySettlement.findFirst({where:{storeId:data.storeId,month:data.month},orderBy:[{createdAt:'desc'},{id:'desc'}],select:{fingerprint:true}});
  const lines=data.report.lines.map(l=>({kind:'FEE' as const,id:l.id,staffId:l.technicianId,name:data.techs.find(t=>t.id===l.technicianId)?.name??'技師',label:`${l.personName} · ${l.serviceName}`,date:l.date,amount:l.fee,paid:l.paid,issue:null,payments:[]}));
  fees=<section className="space-y-3"><PageHeader compact title="技師拆帳月結" actions={<IncomeMonthFilter month={data.month}/>}/><BeautyNativeFeeReport storeId={data.storeId} lines={lines} month={data.month} fingerprint={data.report.fingerprint} confirmed={last?.fingerprint===data.report.fingerprint} previous={!!last} canConfirm={!readOnly&&data.manage.feeConfirm}/></section>;
 }
 if(query.area==='fees'||!data.access.financeAccess)return <PageShell compact><RevenueTabs readOnly={readOnly}/>{fees??<p role="alert">目前沒有技師拆帳檢視權限。</p>}</PageShell>;
 return <CourseRevenue storeId={data.storeId} params={query} readOnly={readOnly} canRefund={!readOnly&&data.manage.refund} canConfirm={!readOnly&&data.manage.card} canEdit={false} canVoid={false} source={{read:readBeautyRevenue,summary:readBeautyReceiptSummary,href:beautyRevenueHref,queryFields:{tab:'營運'},fees,actions:order=><BeautyNativeTransaction storeId={data.storeId} order={order} cardAccess={data.access.planAccess} canRefund={!readOnly&&data.manage.refund} canConfirm={!readOnly&&data.manage.card}/>}}/>;
}
