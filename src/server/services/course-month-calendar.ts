import "server-only";
import {preloadCourseCalendarRosters} from "@/server/services/course-calendar-rosters";
import { sportsCourseName, sportsTeachingName } from "@/lib/course-template-presentation";
import {z} from "zod";
import {courseManagerRead} from "@/server/services/course-access";
import {sportsNativePreview} from "@/lib/sports-native-preview";
import {prisma} from "@/lib/db";
import {coursePrisma} from "@/lib/course-db";
import {requireStoreFeature} from "@/lib/feature-gate";
import {FEATURES} from "@/lib/feature-flags";
import {AppError,handleActionError} from "@/lib/errors";
import {addTaiwanDuration,dayRange,parseTaipeiDateTime} from "@/lib/date-utils";
import {resolvedCourseHours} from "@/lib/course-business-hours";
import type {CourseCalendarSnapshot} from "@/app/(dashboard)/dashboard/courses/workspace";
import {musicDataScope,musicSessionWhere} from "./music-data-scope";
import {readMusicCalendarRecurrence} from "./music-calendar-recurrence";
import {customerLabelSnapshot} from "./customer-label-snapshot";
import {checkPermission} from "@/lib/permissions";
import {EMPTY_LABELS} from "@/lib/customer-labels";
/** Month data only. Every call retains the existing live store/permission and roster checks. */
export async function readCourseMonthCalendar(input:unknown,profile:"FITNESS"|"MUSIC",dataScope?:string){try{
 const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(input);
 if(!parseTaipeiDateTime(date,"00:00"))throw new AppError("VALIDATION","日期不正確");
 const {storeId,isChildStoreView,user}=await courseManagerRead("booking.read");
 const sports=profile==="FITNESS";
 if(sports&&!(await sportsNativePreview(storeId)))throw new AppError("FORBIDDEN","此店尚未開放運動新版");
 if(!await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:sports?"business.fitness":"business.music",status:"ENABLED"}}))throw new AppError("FORBIDDEN","此店尚未開放此課程模組");
 await requireStoreFeature(storeId,FEATURES.BASIC_BOOKING);
 const first=date.slice(0,7)+"-01",start=dayRange(addTaiwanDuration(first,-6,"DAY")).start,end=dayRange(addTaiwanDuration(addTaiwanDuration(first,1,"MONTH"),sports?5:6,"DAY")).end;
 const [sessions,rentals,rules,hours,special,exceptions,schedulingModes]=await Promise.all([
  coursePrisma.courseSession.findMany({where:{...(!sports?musicSessionWhere(storeId,dataScope):{}),storeId,cancelledAt:null,OR:[{startsAt:{gte:start,lte:end}},{rescheduledFromStartsAt:{gte:start,lte:end}}]},include:{bookings:true,template:{select:{musicSubject:{select:{name:true}},...(!sports?{musicScheduleMode:true as const}:{})}}},orderBy:{startsAt:"asc"},take:1001}),
  !sports&&musicDataScope(storeId,dataScope)==="legacy"?[]:coursePrisma.courseRental.findMany({where:{storeId,startsAt:{lte:end},endsAt:{gte:start}},orderBy:{startsAt:"asc"},take:1001}),
  sports?coursePrisma.$queryRaw<Array<{sessionId:string;frequency:string;enrollment?:string}>>`SELECT "sessionId",frequency,enrollment FROM "SportsStagingSessionRule" WHERE "storeId"=${storeId}`:[],
  prisma.businessHours.findMany({where:{storeId}}),prisma.specialBusinessDay.findMany({where:{storeId}}),
  prisma.$queryRaw<Array<{staffId:string;date:Date;type:string;segments:unknown;reason:string|null}>>`SELECT "staffId",date,type,segments,reason FROM "CourseStaffAvailabilityException" WHERE "storeId"=${storeId} AND date>=${start}::date AND date<=${end}::date`,
  coursePrisma.courseBookingRule.findUnique({where:{storeId},select:{selfBookingEnabled:true,assignedSchedulingEnabled:true}})
 ]);
 if(sessions.length>1000||rentals.length>1000)throw new AppError("VALIDATION","本月資料量過大，請聯絡管理者");
 if(!sports&&hours.length>0&&hours.every(row=>row.segments==null))throw new AppError("BUSINESS_RULE","請先完成營業時間設定後再讀取課表");
 const customerIds=[...new Set(sessions.flatMap(s=>s.bookings.flatMap(b=>b.customerId?[b.customerId]:[])))];
 const customersPromise=prisma.customer.findMany({where:{storeId,id:{in:customerIds}},select:{id:true,assignedStaffId:true}});
 const rostersPromise=isChildStoreView?Promise.resolve(undefined):preloadCourseCalendarRosters(storeId,sessions.map(session=>session.id));
 const labelsPromise=!sports?checkPermission(user.role,user.staffId,"customer.read").then(allowed=>allowed?customerLabelSnapshot(customerIds):EMPTY_LABELS):Promise.resolve(undefined);
 const recurrencePromise=sports?Promise.resolve({fixed:new Set<string>(),biweekly:new Set<string>()}):readMusicCalendarRecurrence(storeId,sessions.map(s=>s.requestKey));
 const [customers,rosterSnapshots,labelSnapshot,recurrence]=await Promise.all([customersPromise,rostersPromise,labelsPromise,recurrencePromise]);
 const assignments=new Map(customers.map(c=>[c.id,c.assignedStaffId]));
 const cancelledBookings=sessions.flatMap(s=>s.bookings.filter(b=>b.status==="CANCELLED").map(b=>({id:b.id,customerName:b.customerName,sessionId:s.id,absenceKind:b.absenceKind,notes:b.notes})));
 const rows:CourseCalendarSnapshot["sessions"]=sessions.map(s=>{
  const fixed=rules.some(r=>r.sessionId===s.id&&r.frequency!=="SINGLE");
  return {bookingAudience:s.bookingAudience,sportsEnrollment:rules.find(r=>r.sessionId===s.id)?.enrollment,sportsPalette:sports,id:s.id,isTrial:s.isTrial,nameSnapshot:sports?sportsTeachingName(s.nameSnapshot,s.template?.musicSubject?.name):sportsCourseName(s.nameSnapshot,s.templateId),templateId:s.templateId,coachId:s.coachId,roomId:s.roomId,capacity:s.capacity,pointCost:s.pointCost,requestKey:s.requestKey,teacherAttendance:s.teacherAttendance,rescheduledFromRoomId:s.rescheduledFromRoomId,rescheduledFromCoachId:s.rescheduledFromCoachId,rescheduleKind:s.rescheduleKind,isFixed:sports?fixed:s.scheduleType==="FIXED"||s.scheduleType==="LEGACY"&&(recurrence.fixed.has(s.requestKey)||s.template?.musicScheduleMode==="FIXED"),isBiweekly:sports?rules.some(r=>r.sessionId===s.id&&r.frequency==="BIWEEKLY"):s.scheduleFrequency==="BIWEEKLY"||s.scheduleType==="LEGACY"&&recurrence.biweekly.has(s.requestKey),startsAt:s.startsAt.toISOString(),endsAt:s.endsAt.toISOString(),rescheduledFromStartsAt:sports&&!fixed?null:s.rescheduledFromStartsAt?.toISOString()??null,rescheduledFromEndsAt:s.rescheduledFromEndsAt?.toISOString()??null,rescheduledAt:s.rescheduledAt?.toISOString()??null,previewFaded:s.releasedAt?"異動／請假" as const:undefined,previewStudentNames:s.releasedAt?cancelledBookings.filter(b=>b.sessionId===s.id&&["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"].includes(b.absenceKind??"")).map(b=>b.customerName):undefined,bookings:s.bookings.filter(b=>b.status!=="CANCELLED"||["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED","TEACHER_ABSENT"].includes(b.absenceKind??"")).map(b=>({id:b.id,customerId:b.customerId,customerName:b.customerName,status:b.status,absenceKind:b.absenceKind,bookingKind:b.bookingKind,assignedCoachId:assignments.get(b.customerId??"")??null,checkedInAt:b.checkedInAt?.toISOString()??null}))};
 });
 const [year,month]=first.split('-').map(Number),days=new Date(Date.UTC(year,month,0)).getUTCDate();
 const calendarDays=Object.fromEntries(Array.from({length:days+12},(_,i)=>{const d=addTaiwanDuration(first,i-6,"DAY"),r=resolvedCourseHours(d,hours as Parameters<typeof resolvedCourseHours>[1],special as Parameters<typeof resolvedCourseHours>[2]);return[d,{status:r.status,reason:r.reason,periods:r.periods.map(p=>({openTime:p.openTime,closeTime:p.closeTime}))}];}));
 return {success:true as const,data:{storeId,labelSnapshot,rosterSnapshots,schedulingModes:schedulingModes??undefined,month:first.slice(0,7),sessions:[...rows,...rentals.map(r=>({id:`rental:${r.id}`,rentalId:r.id,sportsPalette:sports,rentalCancelled:!!r.cancelledAt,templateId:"",nameSnapshot:r.customerName,startsAt:r.startsAt.toISOString(),endsAt:r.endsAt.toISOString(),coachId:"",roomId:r.roomId,capacity:0,pointCost:0,bookings:[],previewKind:"RENTAL" as const}))],cancelledBookings,calendarDays,staffAvailabilityExceptions:exceptions.map(e=>({...e,date:e.date.toISOString().slice(0,10)}))}};
}catch(e){return handleActionError(e);}}
