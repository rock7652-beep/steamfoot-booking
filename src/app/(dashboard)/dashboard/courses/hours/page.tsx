import { notFound } from "next/navigation";
import { BookableUntilForm } from "../../settings/hours/bookable-until-form";
import { DEFAULT_BOOKABLE_DAYS_AHEAD } from "@/lib/shop-config";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { courseManager } from "@/server/services/course-access";
import { prisma } from "@/lib/db";
import { toLocalDateStr } from "@/lib/date-utils";
import { parseBusinessPeriods } from "@/lib/business-hours-resolver";
import { getCourseMonthScheduleSummary,getCourseMonthSpecialDays } from "@/server/actions/course-business-hours";
import { ScheduleManager } from "../../settings/hours/schedule-manager";
import { PageShell,PageHeader } from "@/components/desktop";
import { DashboardLink } from "@/components/dashboard-link";

export default async function CourseHoursPage() {
 const user=await getCurrentUser(); if(!user || !(await checkPermission(user.role,user.staffId,"business_hours.view"))) notFound();
 const {storeId}=await courseManager("business_hours.view");
 const [year,month]=toLocalDateStr().split("-").map(Number);
 const [hours,specials,summary,canManage,config]=await Promise.all([
  prisma.businessHours.findMany({where:{storeId},orderBy:{dayOfWeek:"asc"}}),getCourseMonthSpecialDays(year,month),getCourseMonthScheduleSummary(year,month),checkPermission(user.role,user.staffId,"business_hours.manage"),prisma.shopConfig.findUnique({where:{storeId},select:{bookableUntilDate:true,bookingWindowDays:true}})
 ]);
 const days=["週日","週一","週二","週三","週四","週五","週六"];
 const weekly=days.map((dayName,dayOfWeek)=>{
  const row=hours.find(h=>h.dayOfWeek===dayOfWeek);
  return {dayOfWeek,dayName,isOpen:row?.isOpen??true,openTime:row?.openTime??null,closeTime:row?.closeTime??null,slotInterval:60,defaultCapacity:6,periods:row?parseBusinessPeriods(row.segments,row):[]};
 });
 return <PageShell><PageHeader title="營業與公休" subtitle="每週營業、多段時間、特殊休假與後續週次設定" actions={<DashboardLink href="/dashboard/courses?view=settings&section=booking">返回設定</DashboardLink>}/>
 <p className="mb-4 text-sm text-earth-600">課程名額由各堂課與教室容量控制。變更若與已排課程衝突，整批不儲存；請先在課表調整或取消課程，原預約不會被刪除。</p>
 <div className="mb-4"><BookableUntilForm initialDate={config?.bookableUntilDate?.toISOString().slice(0,10)??null} initialDays={config?.bookingWindowDays??DEFAULT_BOOKABLE_DAYS_AHEAD} today={toLocalDateStr()} canManage={canManage} course/><p className="mt-2 text-xs text-earth-500">只限制會員新增預約；店長代約不受此期限限制。縮短期限不會刪除既有預約，有衝突時拒絕儲存。</p></div>
 <ScheduleManager weeklyHours={weekly} initialSpecialDays={specials} initialSummary={summary} initialYear={year} initialMonth={month} canManage={canManage} isHeadquarters={false} isSpaStore={false} isCourseStore/>
 </PageShell>;
}
