"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { AppError, handleActionError } from "@/lib/errors";
import { courseManager, courseTransaction } from "@/server/services/course-access";
import { correctCourseAttendance } from "@/server/services/course-booking";
import { isMusicCourseStore } from "@/server/services/course-business-profile";
import { enqueueOperationAudit } from "@/server/services/operation-audit-outbox";
import { isMusicOpeningMakeupBooking, MUSIC_OPENING_MAKEUP_OPERATION_ISSUE } from "@/lib/music-opening-runtime";

const schema=z.object({bookingId:z.string().min(1).max(100),expectedStatus:z.enum(["RESERVED","ATTENDED","NO_SHOW","CANCELLED"]),target:z.enum(["RESERVED","WAIVED","NO_SHOW"])});
/** Manager correction: the existing attendance ledger refunds or deducts once, in the store lock. */
export async function correctMusicRosterAttendance(input:unknown){
 try{
  const data=schema.parse(input);
  const {storeId,user}=await courseManager("booking.update");
  await courseTransaction(storeId,async tx=>{
   if(!await isMusicCourseStore(tx,storeId))throw new AppError("FORBIDDEN","此入口僅適用音樂課程");
   const booking=await tx.courseBooking.findFirst({where:{id:data.bookingId,storeId},select:{status:true,absenceKind:true,bookingKind:true,musicOpeningMakeupEntitlementId:true,card:{select:{requestKey:true}}}});
   if(!booking||booking.status!==data.expectedStatus)throw new AppError("CONFLICT","點名狀態已變更，請重新核對");
   if(booking.card?.requestKey.startsWith("yjy-"))throw new AppError("VALIDATION","封存來源方案請由原核對流程更正，未變更點名或堂數");
   if(isMusicOpeningMakeupBooking(booking))throw new AppError("FORBIDDEN",MUSIC_OPENING_MAKEUP_OPERATION_ISSUE);
   if(booking.status==="CANCELLED"&&!["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"].includes(booking.absenceKind??""))throw new AppError("VALIDATION","已取消的預約無法更正點名");
   if(data.target==="WAIVED"&&booking.bookingKind==="TRIAL")await courseManager("trial.cancel");
   const actor={storeId,userId:user.id,name:user.name??"店長"};
   // A released leave must regain its seat before becoming a charged absence.
   if(booking.status==="CANCELLED"&&data.target==="NO_SHOW")await correctCourseAttendance(tx,actor,data.bookingId,"RESERVED","CANCELLED",{suppressNotice:true});
   await correctCourseAttendance(tx,actor,data.bookingId,data.target==="WAIVED"?"CANCELLED":data.target,booking.status==="CANCELLED"&&data.target==="NO_SHOW"?"RESERVED":booking.status,{suppressNotice:true,...(data.target==="WAIVED"?{waiveAbsence:true}:{})});
   await enqueueOperationAudit({actorUserId:user.id,storeId,module:"COURSE",targetType:"CourseBooking",targetId:data.bookingId,action:`ATTENDANCE_${data.target}`,summary:({RESERVED:"恢復待點名",WAIVED:"未出席不扣堂",NO_SHOW:"未出席扣堂"} as const)[data.target]},tx);
  });
  revalidatePath("/dashboard/courses");revalidatePath("/book");
  return {success:true as const};
 }catch(error){return handleActionError(error);}
}
