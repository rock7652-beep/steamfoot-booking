"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { courseManager, courseTransaction } from "@/server/services/course-access";
import { reserveCourseInTransaction } from "@/server/services/course-booking";
import { getStoreLimitsByStoreId } from "@/lib/feature-gate";
import { AppError, handleActionError } from "@/lib/errors";
import type { Prisma } from "../../../generated/course-client";
import { recordOperationAuditBestEffort } from "@/server/services/operation-audit";

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
    const data=z.object({sessionId:id,customerId:id,cardId:id,requestKey:z.string().uuid(),notes:z.string().trim().max(1000).default(""),sessionIds:z.array(id).min(1).max(100),allowOverCapacity:z.boolean().default(false)}).parse(input);
    const {storeId,user}=await courseManager("booking.create");
    const limits=await getStoreLimitsByStoreId(storeId);
    const count=await courseTransaction(storeId,async tx=>{
      const sessions=await enrollmentScope(tx,storeId,data.sessionId,data.customerId);
      const previous=await tx.courseBooking.findMany({where:{storeId,operatorUserId:user.id,customerId:data.customerId,cardId:data.cardId,requestKey:{in:data.sessionIds.map(sessionId=>`${data.requestKey}:${sessionId}`)}},select:{sessionId:true}});
      // A complete replay is idempotent; partial or changed scopes require another preview.
      if(previous.length===data.sessionIds.length)return previous.length;
      if(sessions.map(session=>session.id).join("|")!==data.sessionIds.join("|"))throw new AppError("CONFLICT","後續課程或名單已變更，請重新確認日期");
      const actor={storeId,userId:user.id,name:user.name??"店長"};
      for(const session of sessions)await reserveCourseInTransaction(tx,actor,{...data,sessionId:session.id,requestKey:`${data.requestKey}:${session.id}`},limits.maxMonthlyBookings);
      return sessions.length;
    });
    await recordOperationAuditBestEffort({actorUserId:user.id,storeId,module:"COURSE",targetType:"CourseSession",targetId:data.sessionId,action:"ENROLL_SERIES",summary:`加入學員至 ${count} 堂課程`,after:{customerId:data.customerId,sessionIds:data.sessionIds}});
    revalidatePath("/dashboard/courses");
    return {success:true as const,count};
  }catch(error){return handleActionError(error);}
}
