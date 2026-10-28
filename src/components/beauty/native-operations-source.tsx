import {CourseRevenue} from '@/app/(dashboard)/dashboard/revenue/_components/course-revenue';
import {OperationsTabs} from '@/app/(dashboard)/dashboard/revenue/_components/operations-tabs';
import {readBeautyRevenue,readBeautyReceiptSummary} from '@/server/beauty/native-revenue';
import {BeautyNativeTransaction} from './native-transaction-source';
import {BeautyOnlineConfirmProvider} from './online-confirm-recovery';
import {beautyPlanPurchaseIntentsEnabled} from '@/server/beauty/plan-checkout-input';
import {beautyAllocationSummary} from '@/lib/beauty/sale-allocation';
import {getCurrentUser} from '@/lib/session';
import {checkPermission} from '@/lib/permissions';
import type {BeautyDashboardData} from '@/server/beauty/queries';
function beautyRevenueHref(original:string){
 const [path,query]=original.split('?');
 if(path==='/dashboard')return '/dashboard/beauty';
 if(path==='/dashboard/revenue'||path==='/dashboard/transactions'){const q=new URLSearchParams(query);q.set('tab','營運');return `/dashboard/beauty?${q}`;}
 if(path==='/dashboard/courses'){const q=new URLSearchParams({tab:'收費方式'});return `/dashboard/beauty?${q}`;}
 if(path==='/dashboard/service-fee-calculator')return '/dashboard/revenue?area=monthly';
 return original;
}
export async function BeautyNativeOperations({data,query,readOnly}:{data:BeautyDashboardData;query:{dateFrom?:string;dateTo?:string;status?:string;staff?:string;page?:string;summary?:string;area?:string};readOnly:boolean}){
 const u=await getCurrentUser();
 const canEdit=!readOnly&&!!u&&await checkPermission(u.role,u.staffId,'transaction.create'),canVoid=!readOnly&&!!u&&await checkPermission(u.role,u.staffId,'transaction.void');
 const tabs=<OperationsTabs query={query} beautyLedger/>;
 const ledger=<CourseRevenue storeId={data.storeId} params={query} readOnly={readOnly} canRefund={!readOnly&&data.manage.refund} canConfirm={!readOnly&&data.manage.card} canEdit={canEdit} canVoid={canVoid} source={{tabs,columns:[
 {key:'assigned-manager',header:'所屬店長',accessor:row=>data.assignmentStaff.find(s=>s.id===row.revenueStaffId)?.displayName??(row.revenueStaffId?'人員資料待核對':'未歸屬')},
 {key:'technician',header:'服務技師',accessor:row=>row.technicianName??'—'},
 {key:'allocation',header:'店家／所屬店長',accessor:beautyAllocationSummary},
 ],statusLabels:{CONFIRMED:"已收款"},read:readBeautyRevenue,summary:readBeautyReceiptSummary,href:beautyRevenueHref,queryFields:{tab:'營運'},actions:order=><BeautyNativeTransaction allocationSummary={beautyAllocationSummary(order)} canEdit={canEdit} canVoid={canVoid} staffOptions={data.assignmentStaff.map(s=>({id:s.id,name:s.displayName}))} storeId={data.storeId} order={order} cardAccess={data.access.planAccess} canRefund={!readOnly&&data.manage.refund} canConfirm={!readOnly&&data.manage.card}/>}}/>;
 return beautyPlanPurchaseIntentsEnabled()&&!readOnly&&data.manage.card&&u?.id?<BeautyOnlineConfirmProvider key={JSON.stringify([data.storeId,u.id])} storeId={data.storeId} userId={u.id}>{ledger}</BeautyOnlineConfirmProvider>:ledger;
}
