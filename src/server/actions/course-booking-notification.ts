"use server";
import { z } from "zod";
import { courseSelfBookingEnabled } from "@/lib/course-self-booking";
import { assertCourseSelfBookingEnabled } from "@/server/services/course-self-booking";
import { revalidatePath } from "next/cache";
import { courseMember, courseTransaction } from "@/server/services/course-access";
import { reserveCourseInTransaction, settleCourseBooking } from "@/server/services/course-booking";
import { coursePrisma } from "@/lib/course-db";
import { prisma } from "@/lib/db";
import { getStoreLimitsByStoreId } from "@/lib/feature-gate";
import { resolveCustomerBookingWindow } from "@/lib/shop-config";
import { AppError, handleActionError } from "@/lib/errors";
import { after } from "next/server";
import type { Prisma } from "../../../generated/course-client";

const id = z.string().min(1).max(100);
async function ownedBooking(tx: Prisma.TransactionClient, storeId: string, customerId: string, bookingId: string) {
  const booking = await tx.courseBooking.findFirst({where:{id:bookingId,storeId},include:{session:true,card:{include:{members:true}}}});
  if (!booking || !(booking.customerId === customerId || booking.reserverCustomerId === customerId || booking.card?.members.some(m=>m.customerId===customerId))) throw new AppError("FORBIDDEN", "無權操作此預約");
  return booking;
}
export async function loadCourseBookingNotification(bookingId: string) {
  try {
    const {storeId,customer}=await courseMember();
    const booking=await ownedBooking(coursePrisma,storeId,customer.id,id.parse(bookingId));
    const [rule,config]=await Promise.all([
      coursePrisma.courseBookingRule.findUnique({where:{storeId}}),
      prisma.shopConfig.findUnique({where:{storeId},select:{bookableUntilDate:true,bookingOpensAt:true,bookingWindowDays:true}}),
    ]);
    const now=new Date(),window=resolveCustomerBookingWindow(config,now);
    const selfBookingEnabled = courseSelfBookingEnabled(rule);
    const sessions=selfBookingEnabled && booking.status === "RESERVED" && !booking.session.cancelledAt ? await coursePrisma.courseSession.findMany({
      where:{storeId,id:{not:booking.sessionId},templateId:booking.session.templateId,cancelledAt:null,releasedAt:null,teacherAttendance:{notIn:["LEAVE","NO_SHOW"]},template:{isActive:true,visibility:"PUBLIC"},startsAt:{gt:new Date(Math.max(now.getTime()+(rule?.bookingLeadMinutes??0)*60000,window.opensAt?.getTime()??0)),lte:window.closesAt}},
      include:{room:{select:{name:true}},_count:{select:{bookings:{where:{status:{not:"CANCELLED"}}}}}},orderBy:{startsAt:"asc"},take:100,
    }) : [];
    return {success:true as const,selfBookingEnabled,booking:{id:booking.id,name:booking.session.nameSnapshot,customerName:booking.customerName,startsAt:booking.session.startsAt.toISOString(),trial:booking.bookingKind==="TRIAL",active:booking.status==="RESERVED"&&!booking.session.cancelledAt,cutoff:new Date(booking.session.startsAt.getTime()-(rule?.cancellationLeadMinutes??0)*60000).toISOString()},sessions:sessions.filter(s=>s._count.bookings<s.capacity).map(s=>({id:s.id,name:s.nameSnapshot,startsAt:s.startsAt.toISOString(),room:s.room.name}))};
  } catch(e) {const result=handleActionError(e);return {success:false as const,error:result.success?"讀取失敗":result.error};}
}
export async function confirmMemberCourseTrial(bookingId: string) {
  try {
    const {user,storeId,customer}=await courseMember({write:true});
    await courseTransaction(storeId,async tx=>{
      const b=await ownedBooking(tx,storeId,customer.id,id.parse(bookingId));
      if(b.bookingKind!=="TRIAL" || b.customerId!==customer.id || b.status!=="RESERVED" || b.session.cancelledAt || b.session.startsAt<=new Date()) throw new AppError("VALIDATION","此體驗預約目前無法確認會到");
      // Confirmation is intent, never attendance or a payment. Deterministic key makes repeat clicks harmless.
      await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","actorNameSnapshot","storeId",module,summary,"targetType","targetId",action,"afterJson","createdAt") VALUES (${`course-trial-confirm:${storeId}:${b.id}`},${user.id},${customer.name},${storeId},'COURSE','顧客確認體驗會到','CourseBooking',${b.id},'COURSE_TRIAL_CONFIRM',${JSON.stringify({customerId:customer.id,attendanceUnchanged:true})}::jsonb,NOW()) ON CONFLICT (id) DO NOTHING`;
    });
    return {success:true as const};
  } catch(e) {return handleActionError(e);}
}
export async function rescheduleMemberCourseBooking(input: unknown) {
  try {
    const data=z.object({bookingId:id,sessionId:id}).parse(input);
    const {user,storeId,customer}=await courseMember({write:true});
    const actor={userId:user.id,storeId,name:customer.name,customerId:customer.id};
    const limits=await getStoreLimitsByStoreId(storeId);
    const result=await courseTransaction(storeId,async tx=>{
      const old=await ownedBooking(tx,storeId,customer.id,data.bookingId);
      const requestKey=`course-reschedule:${old.id}:${data.sessionId}`;
      const prior=await tx.courseBooking.findUnique({where:{storeId_requestKey:{storeId,requestKey}}});
      if(prior && prior.operatorUserId===user.id && old.status==="CANCELLED" && prior.status==="RESERVED")return {bookingId:prior.id,oldSessionId:old.sessionId};
      // Check before cancellation, including trials whose reservation actor becomes staff-like.
      assertCourseSelfBookingEnabled(await tx.courseBookingRule.findUnique({ where: { storeId } }));
      if(old.status!=="RESERVED" || old.session.cancelledAt || old.checkedInAt || old.makeupForBookingId || old.card?.termSessionIds.length) throw new AppError("VALIDATION","此預約請由店家協助調整");
      const target=await tx.courseSession.findFirst({where:{id:data.sessionId,storeId,templateId:old.session.templateId,cancelledAt:null,template:{isActive:true,visibility:"PUBLIC"}}});
      if(!target || target.id===old.sessionId)throw new AppError("VALIDATION","請選擇本店同課程的可預約時段");
      // Customer cancellation deadline is checked before releasing the original reservation.
      await settleCourseBooking(tx,actor,old.id,"CANCELLED");
      if(old.bookingKind==="TRIAL") {
        const config=await tx.$queryRaw<Array<{bookableUntilDate:Date|null;bookingOpensAt:Date|null;bookingWindowDays:number|null}>>`SELECT "bookableUntilDate","bookingOpensAt","bookingWindowDays" FROM "ShopConfig" WHERE "storeId"=${storeId}`;
        const window=resolveCustomerBookingWindow(config[0],new Date());
        if((window.opensAt&&new Date()<window.opensAt)||target.startsAt>window.closesAt)throw new AppError("VALIDATION","此時段尚未開放會員預約");
      }
      const next=await reserveCourseInTransaction(tx,old.bookingKind==="TRIAL"?{...actor,customerId:undefined}:actor,{
        sessionId:target.id,cardId:old.cardId,customerId:old.customerId,trialPrice:old.bookingKind==="TRIAL"?old.trialPrice??undefined:undefined,requestKey,notes:old.notes??undefined,
        customerName:old.customerName,companionIndex:old.companionIndex??undefined,reserverCustomerId:old.reserverCustomerId??undefined,reserverName:old.reserverName??undefined,reserverCardId:old.reserverCardId??undefined,groupKey:old.groupKey??undefined,
      },limits.maxMonthlyBookings);
      // A paid trial keeps its original receipts; no refund or new cash entry is created.
      if(old.bookingKind==="TRIAL")await tx.courseTrialPayment.updateMany({where:{storeId,bookingId:old.id},data:{bookingId:next.id}});
      await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","actorNameSnapshot","storeId",module,summary,"targetType","targetId",action,"beforeJson","afterJson","createdAt") VALUES (${crypto.randomUUID()},${user.id},${customer.name},${storeId},'COURSE','顧客改期：原預約與新預約同步完成','CourseBooking',${old.id},'COURSE_MEMBER_RESCHEDULE',${JSON.stringify({sessionId:old.sessionId})}::jsonb,${JSON.stringify({bookingId:next.id,sessionId:next.sessionId,paymentUnchanged:true})}::jsonb,NOW())`;
      return {bookingId:next.id,oldSessionId:old.sessionId};
    });
    after(async()=>{
      const {promoteCourseWaitlistForSession}=await import("@/server/services/course-waitlist");
      const {notifyCourseWaitlistPromotions}=await import("@/server/services/course-waitlist-notifications");
      try {const promoted=await courseTransaction(storeId,tx=>promoteCourseWaitlistForSession(tx,storeId,result.oldSessionId));if(promoted.length)await notifyCourseWaitlistPromotions(storeId,promoted);}catch{console.error("[Course reschedule] waitlist check failed",{storeId});}
    });
    revalidatePath("/book");revalidatePath("/dashboard/courses");
    return {success:true as const,bookingId:result.bookingId};
  } catch(e) {return handleActionError(e);}
}
