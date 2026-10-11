"use server";
import {z} from "zod";
import {coursePrisma} from "@/lib/course-db";
import {courseTeacherChangeActor,assertCourseTeacherChange} from "@/server/services/course-teacher-change-access";
import {courseTransaction} from "@/server/services/course-access";
import {settleCourseBooking,reserveCourseInTransaction} from "@/server/services/course-booking";
import {recordCourseStoreNotice} from "@/server/services/course-store-notices";
import {AppError,handleActionError} from "@/lib/errors";
import {getStoreLimitsByStoreId} from "@/lib/feature-gate";
import {revalidatePath} from "next/cache";
import {after} from "next/server";
const id=z.string().min(1).max(100);
export async function loadCourseTeacherLeave(bookingId:string){return loadCourseTeacherChange(bookingId,"leave");}
export async function loadCourseTeacherChange(bookingId:string,mode:"leave"|"reschedule"="reschedule") {
 try {
  const actor=await courseTeacherChangeActor(mode==="leave"?"teacher.booking.leave":"teacher.booking.reschedule");
  const booking=await coursePrisma.courseBooking.findFirst({where:{id:id.parse(bookingId),storeId:actor.storeId,session:{coachId:actor.staffId,cancelledAt:null}},include:{session:true}});
  if(!booking)throw new AppError("FORBIDDEN","只能處理自己負責的課程");
  const sessions=await coursePrisma.courseSession.findMany({where:{storeId:actor.storeId,coachId:actor.staffId,id:{not:booking.sessionId},templateId:booking.session.templateId,cancelledAt:null,releasedAt:null,teacherAttendance:{notIn:["LEAVE","NO_SHOW"]},startsAt:{gt:new Date()}},include:{room:{select:{name:true}},_count:{select:{bookings:{where:{status:{not:"CANCELLED"}}}}}},orderBy:{startsAt:"asc"},take:100});
  return {success:true as const,selfBookingEnabled:true,selfLeaveEnabled:true,selfRescheduleEnabled:true,booking:{id:booking.id,name:booking.session.nameSnapshot,customerName:booking.customerName,startsAt:booking.session.startsAt.toISOString(),trial:booking.bookingKind==="TRIAL",active:booking.status==="RESERVED"&&!booking.session.cancelledAt,cutoff:booking.session.startsAt.toISOString()},sessions:sessions.filter(s=>s._count.bookings<s.capacity).map(s=>({id:s.id,name:s.nameSnapshot,startsAt:s.startsAt.toISOString(),room:s.room.name}))};
 }catch(e){const r=handleActionError(e);return {success:false as const,error:r.success?"操作失敗":r.error};}
}
export async function changeCourseTeacherBooking(input:unknown) {
 try {
  const d=z.object({bookingId:id,sessionId:id.optional()}).parse(input),permission=d.sessionId?"teacher.booking.reschedule":"teacher.booking.leave";
  const {storeId,user,staffId}=await courseTeacherChangeActor(permission,true);
  const limits=await getStoreLimitsByStoreId(storeId);
  const actor={storeId,userId:user.id,name:user.name??"授課人員"};
  const result=await courseTransaction(storeId,async tx=>{
   const b=await tx.courseBooking.findFirst({where:{id:d.bookingId,storeId},include:{session:true,card:true}});
   if(!b)throw new AppError("NOT_FOUND","找不到預約");
   await assertCourseTeacherChange(tx,storeId,user.id,staffId,b.sessionId,permission);
   if(!d.sessionId){const saved=await settleCourseBooking(tx,actor,b.id,"STUDENT_LEAVE");return {bookingId:saved.id,releasedSessionId:b.sessionId};}
   const requestKey=`teacher-reschedule:${b.id}:${d.sessionId}`;
   const previous=await tx.courseBooking.findUnique({where:{storeId_requestKey:{storeId,requestKey}}});
   if(previous?.status==="RESERVED"&&previous.operatorUserId===user.id&&b.status==="CANCELLED")return {bookingId:previous.id,releasedSessionId:b.sessionId};
   if(b.status!=="RESERVED"||b.checkedInAt||b.makeupForBookingId||b.card?.termSessionIds.length||b.session.startsAt<=new Date())throw new AppError("VALIDATION","固定課或補課請由門市調課");
   const target=await tx.courseSession.findFirst({where:{id:d.sessionId,storeId,coachId:staffId,templateId:b.session.templateId,cancelledAt:null,startsAt:{gt:new Date()}}});
   if(!target||target.id===b.sessionId)throw new AppError("VALIDATION","請選擇自己的同課程時段");
   await assertCourseTeacherChange(tx,storeId,user.id,staffId,target.id,permission);
   await settleCourseBooking(tx,actor,b.id,"CANCELLED","DEDUCTED",{suppressNotice:true});
   const next=await reserveCourseInTransaction(tx,actor,{sessionId:target.id,cardId:b.cardId,customerId:b.customerId,customerName:b.customerName,companionIndex:b.companionIndex??undefined,reserverCustomerId:b.reserverCustomerId??undefined,reserverName:b.reserverName??undefined,reserverCardId:b.reserverCardId??undefined,groupKey:b.groupKey??undefined,trialPrice:b.trialPrice??undefined,requestKey,notes:b.notes??undefined},limits.maxMonthlyBookings);
   if(b.bookingKind==="TRIAL")await tx.courseTrialPayment.updateMany({where:{storeId,bookingId:b.id},data:{bookingId:next.id}});
   await recordCourseStoreNotice(tx,actor,{subjectKey:`booking:${next.id}`,kind:"MOVE",customerName:b.customerName,courseName:target.nameSnapshot,coachId:staffId,startsAt:target.startsAt,previousStartsAt:b.session.startsAt,details:{previousBookingId:b.id}});
   return {bookingId:next.id,releasedSessionId:b.sessionId};
  });
  after(async()=>{try{
   const {promoteCourseWaitlistForSession}=await import("@/server/services/course-waitlist");
   const {notifyCourseWaitlistPromotions}=await import("@/server/services/course-waitlist-notifications");
   const promoted=await courseTransaction(storeId,tx=>promoteCourseWaitlistForSession(tx,storeId,result.releasedSessionId));
   if(promoted.length)await notifyCourseWaitlistPromotions(storeId,promoted);
  }catch{console.error("[Course teacher change] waitlist check deferred",{storeId});}});
  revalidatePath("/book");revalidatePath("/dashboard/courses");return {success:true as const,...result};
 }catch(e){const r=handleActionError(e);return {success:false as const,error:r.success?"操作失敗":r.error};}
}
