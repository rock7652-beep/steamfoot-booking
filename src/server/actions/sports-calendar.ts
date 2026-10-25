"use server";
import { sportsCourseName } from "@/lib/course-template-presentation";
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
/** Read only; navigation never enters a router transition or changes store context. */
export async function loadSportsCalendar(input:unknown){try{
 const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(input);
 if(!parseTaipeiDateTime(date,"00:00"))throw new AppError("VALIDATION","日期不正確");
 const {storeId}=await courseManagerRead("booking.read");
 if(!(await sportsNativePreview(storeId))||!await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.fitness",status:"ENABLED"}}))throw new AppError("FORBIDDEN","此店尚未開放運動新版");
 await requireStoreFeature(storeId,FEATURES.BASIC_BOOKING);
 const first=date.slice(0,7)+"-01",start=dayRange(addTaiwanDuration(first,-6,"DAY")).start,end=dayRange(addTaiwanDuration(addTaiwanDuration(first,1,"MONTH"),5,"DAY")).end;
 const [sessions,rentals,rules,hours,special,exceptions,schedulingModes]=await Promise.all([
  coursePrisma.courseSession.findMany({where:{storeId,cancelledAt:null,OR:[{startsAt:{gte:start,lte:end}},{rescheduledFromStartsAt:{gte:start,lte:end}}]},include:{bookings:true},orderBy:{startsAt:"asc"},take:1001}),
  coursePrisma.courseRental.findMany({where:{storeId,startsAt:{lte:end},endsAt:{gte:start}},orderBy:{startsAt:"asc"},take:1001}),
  coursePrisma.$queryRaw<Array<{sessionId:string;frequency:string;enrollment?:string}>>`SELECT "sessionId",frequency,enrollment FROM "SportsStagingSessionRule" WHERE "storeId"=${storeId}`,
  prisma.businessHours.findMany({where:{storeId}}),prisma.specialBusinessDay.findMany({where:{storeId}}),
  prisma.$queryRaw<Array<{staffId:string;date:Date;type:string;segments:unknown;reason:string|null}>>`SELECT "staffId",date,type,segments,reason FROM "CourseStaffAvailabilityException" WHERE "storeId"=${storeId} AND date>=${start}::date AND date<=${end}::date`,
  coursePrisma.courseBookingRule.findUnique({where:{storeId},select:{selfBookingEnabled:true,assignedSchedulingEnabled:true}})
 ]);
 if(sessions.length>1000||rentals.length>1000)throw new AppError("VALIDATION","本月資料量過大，請聯絡管理者");
 const customerIds=[...new Set(sessions.flatMap(s=>s.bookings.flatMap(b=>b.customerId?[b.customerId]:[])))];
 const customers=await prisma.customer.findMany({where:{storeId,id:{in:customerIds}},select:{id:true,assignedStaffId:true}});
 const assignments=new Map(customers.map(c=>[c.id,c.assignedStaffId]));
 const cancelledBookings=sessions.flatMap(s=>s.bookings.filter(b=>b.status==="CANCELLED").map(b=>({id:b.id,customerName:b.customerName,sessionId:s.id,absenceKind:b.absenceKind,notes:b.notes})));
 const rows=sessions.map(s=>{
  const fixed=rules.some(r=>r.sessionId===s.id&&r.frequency!=="SINGLE");
  return {sportsEnrollment:rules.find(r=>r.sessionId===s.id)?.enrollment,sportsPalette:true,id:s.id,isTrial:s.isTrial,nameSnapshot:sportsCourseName(s.nameSnapshot,s.templateId),templateId:s.templateId,coachId:s.coachId,roomId:s.roomId,capacity:s.capacity,pointCost:s.pointCost,requestKey:s.requestKey,teacherAttendance:s.teacherAttendance,rescheduledFromRoomId:s.rescheduledFromRoomId,rescheduledFromCoachId:s.rescheduledFromCoachId,rescheduleKind:s.rescheduleKind,isFixed:fixed,isBiweekly:rules.some(r=>r.sessionId===s.id&&r.frequency==="BIWEEKLY"),startsAt:s.startsAt.toISOString(),endsAt:s.endsAt.toISOString(),rescheduledFromStartsAt:fixed?s.rescheduledFromStartsAt?.toISOString()??null:null,rescheduledFromEndsAt:s.rescheduledFromEndsAt?.toISOString()??null,rescheduledAt:s.rescheduledAt?.toISOString()??null,previewFaded:s.releasedAt?"異動／請假" as const:undefined,bookings:s.bookings.filter(b=>b.status!=="CANCELLED"||["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED","TEACHER_ABSENT"].includes(b.absenceKind??"")).map(b=>({id:b.id,customerId:b.customerId,customerName:b.customerName,status:b.status,absenceKind:b.absenceKind,bookingKind:b.bookingKind,assignedCoachId:assignments.get(b.customerId??"")??null,checkedInAt:b.checkedInAt?.toISOString()??null}))};
 });
 const [year,month]=first.split('-').map(Number),days=new Date(Date.UTC(year,month,0)).getUTCDate();
 const calendarDays=Object.fromEntries(Array.from({length:days+12},(_,i)=>{const d=addTaiwanDuration(first,i-6,"DAY"),r=resolvedCourseHours(d,hours as Parameters<typeof resolvedCourseHours>[1],special as Parameters<typeof resolvedCourseHours>[2]);return[d,{status:r.status,reason:r.reason,periods:r.periods.map(p=>({openTime:p.openTime,closeTime:p.closeTime}))}];}));
 return {success:true as const,data:{schedulingModes:schedulingModes??undefined,month:first.slice(0,7),sessions:[...rows,...rentals.map(r=>({id:`rental:${r.id}`,rentalId:r.id,sportsPalette:true,rentalCancelled:!!r.cancelledAt,templateId:"",nameSnapshot:r.customerName,startsAt:r.startsAt.toISOString(),endsAt:r.endsAt.toISOString(),coachId:"",roomId:r.roomId,capacity:0,pointCost:0,bookings:[],previewKind:"RENTAL" as const}))],cancelledBookings,calendarDays,staffAvailabilityExceptions:exceptions.map(e=>({...e,date:e.date.toISOString().slice(0,10)}))}};
}catch(e){return handleActionError(e);}}
