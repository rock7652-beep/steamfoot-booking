import {CourseHome, type CourseHomeSource} from '@/app/(dashboard)/dashboard/courses/home';
import {getCurrentUser} from '@/lib/session';
import {courseCustomerStaffScope} from '@/server/queries/course-home';
import {readBeautyCareSections} from './care';
import {beautyDailyHref,getBeautyHomeToday,getBeautyHomeReceipts,getBeautyHomeCustomers,getBeautyHomeTodos,getBeautyUnassignedPlanCount} from '@/server/beauty/home';
import {toLocalMonthStr} from '@/lib/date-utils';
import type {BeautyDashboardData} from '@/server/beauty/queries';

/** No Beauty home UI: render the current sports page using Beauty core readers. */
export async function BeautyHome({data,readOnly}:{data:BeautyDashboardData;readOnly:boolean}){
 const user=await getCurrentUser();
 if(!user)return null;
 const scope=courseCustomerStaffScope(user,data.storeId);
 const source:CourseHomeSource={
  service:true,readOnly,href:beautyDailyHref,
  statistics:{today:'今日服務與預約人次排除取消；完成僅計已標記完成的服務。時間到不會自動完成或扣次。',receipts:'依收款與退款的入帳時間統計；淨收款為收款減退款，不重複加計現金帳。',todos:'列出有權處理的待核帳、已結束但仍待完成的服務及顧客跟進。'},
  today:getBeautyHomeToday,receipts:getBeautyHomeReceipts,customers:getBeautyHomeCustomers,
  todos:getBeautyHomeTodos,unassignedPlans:getBeautyUnassignedPlanCount,
  care:async()=>{
   const sections=await readBeautyCareSections({...data,month:toLocalMonthStr(),customers:scope?data.customers.filter(c=>c.assignedStaff?.id===scope):data.customers});
   const count=(reason:string)=>sections.find(s=>s.reason===reason)?.items.length??0;
   return {birthday:count('birthday'),trial:count('trial'),inactive:count('inactive'),expiring:count('expiring'),low:count('low')};
  },
 };
 return <CourseHome user={user} storeId={data.storeId} source={source}/>;
}
