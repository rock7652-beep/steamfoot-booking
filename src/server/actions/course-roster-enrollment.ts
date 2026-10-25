"use server";
import { enqueueOperationAudit } from "@/server/services/operation-audit-outbox";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { courseManager, courseTransaction } from "@/server/services/course-access";
import { reserveCourseInTransaction } from "@/server/services/course-booking";
import { getStoreLimitsByStoreId } from "@/lib/feature-gate";
import { AppError, handleActionError } from "@/lib/errors";
import type { Prisma } from "../../../generated/course-client";

const id=z.string().min(1).max(100);
async function enrollmentScope(tx:Prisma.TransactionClient,storeId:string,sessionId:string,customerId:string) {
  const source=await tx.courseSession.findFirst({where:{id:sessionId,storeId,cancelledAt:null,releasedAt:null},select:{id:true,requestKey:true,templateId:true,startsAt:true}});
  if(!source)throw new AppError("NOT_FOUND","找不到可加入的本堂課程");
  const sessions=await tx.courseSession.findMany({where:{storeId,requestKey:source.requestKey,templateId:source.templateId,cancelledAt:null,releasedAt:null,teacherAttendance:"SCHEDULED",OR:[{id:source.id},{startsAt:{gt:source.startsAt,gte:new Date()}}]},select:{id:true,startsAt:true,pointCost:true,capacity:true,bookings:{where:{OR:[{status:{not:"CANCELLED"}},{absenceKind:{in:["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED","TEACHER_ABSENT"]}}]},select:{customerId:true,status:true}}},orderBy:[{startsAt:"asc"},{id:"asc"}],take:101});
  if(sessions.length>100)throw new AppError("VALIDATION","後續課程超過 100 堂，請分段加入");
  return sessions.filter(session=>!session.bookings.some(booking=>booking.customerId===customerId)).map(session=>({id:session.id,startsAt:session.startsAt.toISOString(),pointCost:session.pointCost,full:session.bookings.filter(booking=>booking.status!=="CANCELLED").length>=session.capacity}));
}
export async function previewCourseEnrollment(input:unknown) {
  try {
    const data=z.object({sessionId:id,customerId:id}).parse(input);
    const {storeId}=await courseManager("booking.create");
    const sessions=await courseTransaction(storeId,tx=>enrollmentScope(tx,storeId,data.sessionId,data.customerId));
    return {success:true as const,sessions};
  }catch(error){return handleActionError(error);}
}
export async function enrollCourseSeries(input:unknown) {
  try {
    const data=z.object({bookingKind:z.never().optional(),musicOpeningMakeupEntitlementId:z.never().optional(),sessionId:id,customerId:id,cardId:id.optional(),autoCard:z.boolean().optional(),requestKey:z.string().uuid(),notes:z.string().trim().max(1000).default(""),sessionIds:z.array(id).min(1).max(100),allowOverCapacity:z.boolean().default(false)}).refine(d=>!!d.cardId||d.autoCard===true).parse(input);
    const {storeId,user}=await courseManager("booking.create");
    const limits=await getStoreLimitsByStoreId(storeId);
    const count=await courseTransaction(storeId,async tx=>{
      if(data.autoCard){const {sportsNativePreview}=await import("@/lib/sports-native-preview");if(!(await sportsNativePreview(storeId)))throw new AppError("FORBIDDEN","自動選卡僅適用運動店");}
      const sessions=await enrollmentScope(tx,storeId,data.sessionId,data.customerId);
      const previous=await tx.courseBooking.findMany({where:{storeId,bookingKind:"CARD",musicOpeningMakeupEntitlementId:null,operatorUserId:user.id,customerId:data.customerId,cardId:data.cardId,requestKey:{in:data.sessionIds.map(sessionId=>`${data.requestKey}:${sessionId}`)}},select:{sessionId:true}});
      // A complete replay is idempotent; partial or changed scopes require another preview.
      if(previous.length===data.sessionIds.length)return previous.length;
      if(sessions.map(session=>session.id).join("|")!==data.sessionIds.join("|"))throw new AppError("CONFLICT","後續課程或名單已變更，請重新確認日期");
      const actor={storeId,userId:user.id,name:user.name??"店長"};
      let cardId=data.cardId;
      if(data.autoCard){
        const full=await tx.courseSession.findMany({where:{storeId,id:{in:data.sessionIds}},orderBy:[{startsAt:"asc"},{id:"asc"}]});
        const {readSportsSessionRule}=await import("@/server/services/sports-staging-schedule");const rule=await readSportsSessionRule(tx,storeId,data.sessionId);
        if(!rule)throw new AppError("VALIDATION","請選擇有效的運動課程");
        const {findSportsCard}=await import("@/server/services/sports-card-selection");
        const picked=await findSportsCard(tx,storeId,data.customerId,full,rule);
        if(!picked)throw new AppError("VALIDATION","學員沒有可支付整批課程的有效方案");
        cardId=picked.card.id;
      }
      if(!cardId)throw new AppError("VALIDATION","請選擇有效方案");
      for(const session of sessions)await reserveCourseInTransaction(tx,actor,{...data,cardId,sessionId:session.id,requestKey:`${data.requestKey}:${session.id}`},limits.maxMonthlyBookings);
      return sessions.length;
    }, async (auditResult, tx) => { await enqueueOperationAudit({actorUserId:user.id,storeId,module:"COURSE",targetType:"CourseSession",targetId:data.sessionId,action:"ENROLL_SERIES",summary:`加入學員至 ${auditResult} 堂課程`,after:{customerId:data.customerId,sessionIds:data.sessionIds}}, tx, data.requestKey); });

    revalidatePath("/dashboard/courses");
    return {success:true as const,count};
  }catch(error){return handleActionError(error);}
}
