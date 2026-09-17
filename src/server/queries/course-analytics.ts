import "server-only";
import { coursePrisma } from "@/lib/course-db";
import { prisma } from "@/lib/db";
import { requireCourseStore } from "@/lib/industry-module-server";
import { dayRange, monthRange, toLocalDateStr } from "@/lib/date-utils";
import { courseAnalysisPriorYear, shiftCourseCalendarDate, previousCourseAnalysisRange, summarizeCourseAttendance, type CourseAnalysisRange } from "@/lib/course-analytics";
import { getCourseRevenueReport } from "./course-revenue-report";

export async function getCourseAnalytics(storeId: string, range: CourseAnalysisRange, readRevenue: boolean) {
  await requireCourseStore(storeId);
  const previous = previousCourseAnalysisRange(range);
  const yearRange = courseAnalysisPriorYear(range);
  const trendMonths = Array.from({length:6},(_,i)=>shiftCourseCalendarDate(`${range.endDate.slice(0,7)}-01`,i-5).slice(0,7));
  const queryStart=[previous.startDate,yearRange.startDate,`${trendMonths[0]}-01`].sort()[0];
  const attendance = await coursePrisma.$transaction(async tx => {
    const [sessions, firsts] = await Promise.all([
      tx.courseSession.findMany({ where: { storeId, cancelledAt: null, startsAt: { gte: dayRange(queryStart).start, lte: dayRange(range.endDate).end } }, select: {
        id:true,coachId:true,startsAt:true,endsAt:true,
        bookings:{where:{storeId},select:{customerId:true,customerName:true,status:true,checkedInAt:true,pointCost:true,card:{select:{unit:true}}}},
      } }),
      tx.$queryRaw<Array<{ customerId: string; firstAt: Date }>>`SELECT b."customerId", MIN(s."startsAt") AS "firstAt" FROM "CourseBooking" b JOIN "CourseSession" s ON s.id=b."sessionId" AND s."storeId"=b."storeId" WHERE b."storeId"=${storeId} AND b.status='ATTENDED' AND s."cancelledAt" IS NULL GROUP BY b."customerId"`,
    ]);
    const first = new Map(firsts.map(row=>[row.customerId,row.firstAt]));
    const current = summarizeCourseAttendance(sessions,first,range), prior = summarizeCourseAttendance(sessions,first,previous);
    const priorYear = summarizeCourseAttendance(sessions,first,yearRange);
    const returned = current.visitors.filter(id=>prior.visitors.includes(id));
    const dates = [...new Set(sessions.filter(s=>toLocalDateStr(s.startsAt)>=range.startDate).map(s=>toLocalDateStr(s.startsAt)))].sort();
    return {current,prior,priorYear,trend:trendMonths.map(month=>{
      const end=toLocalDateStr(monthRange(month).end);
      const period=summarizeCourseAttendance(sessions,first,{startDate:`${month}-01`,endDate:end<range.endDate?end:range.endDate});
      return {date:`${month}-01`,bookingCount:period.participations,arrivedCount:period.completed,revenue:0,newCustomerCount:period.newVisitors.length,returningCustomerCount:period.returningVisitors.length};
    }),returned,notReturned:prior.visitors.filter(id=>!current.visitors.includes(id)),daily:dates.map(date=>{
      const day=summarizeCourseAttendance(sessions,first,{startDate:date,endDate:date});
      return {date,bookingCount:day.participations,arrivedCount:day.completed,revenue:0,newCustomerCount:day.newVisitors.length,returningCustomerCount:day.returningVisitors.length};
    })};
  }, { isolationLevel:"RepeatableRead",timeout:15000 });
  const staff = await prisma.staff.findMany({where:{storeId},select:{id:true,displayName:true}});
  const revenue = readRevenue ? await getCourseRevenueReport(storeId,{...range,storeFilter:{storeId}}) : null;
  const priorRevenue = readRevenue ? await getCourseRevenueReport(storeId,{...previous,storeFilter:{storeId}}) : null;
  return {...attendance,range,previous,yearRange,staff,revenue,priorRevenue};
}
