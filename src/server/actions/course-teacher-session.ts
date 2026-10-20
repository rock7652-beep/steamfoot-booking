"use server";
import { courseDisplayName } from "@/lib/course-template-presentation";
import { createHash } from "node:crypto";
import { z } from "zod";
import { coursePrisma } from "@/lib/course-db";
import { parseTaipeiDateTime } from "@/lib/date-utils";
import { AppError } from "@/lib/errors";
import { assertCourseTeacherChange } from "@/server/services/course-teacher-change-access";
import { requirePermission } from "@/lib/permissions";
import { courseTransaction } from "@/server/services/course-access";
import { assertCourseResources, handleCourseActionError } from "@/server/services/course-resources";
import { assertCourseSessionsFitHours } from "@/server/services/course-business-hours";
import { assertMusicCourseAvailability } from "@/server/services/course-availability";
import { assertCourseDutyCoverage } from "@/server/services/course-duty";
import { refundTeacherAbsentSession, syncCourseRelease } from "@/server/services/course-booking";
import { cancelCourseWaitlistForSession } from "@/server/services/course-waitlist";
import { recordCourseStoreNotice } from "@/server/services/course-store-notices";
import { revalidatePath } from "next/cache";

const id = z.string().min(1).max(100);
const modeSchema = z.enum(["leave", "reschedule"]);
// Include cancelled leave bookings: stopping a lesson also returns any forfeited allowance.
const include = { room: { select: { name: true } }, bookings: { include: { card: { select: { expiresAt: true } } }, orderBy: { id: "asc" as const } } };
type Session = NonNullable<Awaited<ReturnType<typeof readSession>>>;
function readSession(storeId: string, sessionId: string) {
  return coursePrisma.courseSession.findFirst({ where: { id: sessionId, storeId }, include });
}
type Waiting = {id:string;customerName:string;updatedAt:Date;cardId:string};
function revision(s: Session, waiting:Waiting[]) {
  return createHash("sha256").update(JSON.stringify([s.nameSnapshot,s.templateId,s.startsAt,s.endsAt,s.coachId,s.roomId,s.capacity,s.pointCost,s.teacherAttendance,s.cancelledAt,s.releasedAt,s.rescheduledAt,s.bookings.map(b=>[b.id,b.updatedAt,b.status,b.absenceKind,b.checkedInAt]),waiting.map(w=>[w.id,w.updatedAt,w.cardId])])).digest("hex");
}
function assertEditable(s: Session | null) {
  if (!s || s.cancelledAt || s.releasedAt || s.teacherAttendance !== "SCHEDULED" || s.startsAt <= new Date()) throw new AppError("CONFLICT", "只能處理自己尚未開始、未停課的課程");
  if (s.bookings.some(b=>b.checkedInAt || b.status==="ATTENDED" || b.status==="NO_SHOW")) throw new AppError("CONFLICT", "已有報到或點名紀錄，請由門市核對");
}
export async function loadCourseTeacherSession(sessionId: string, mode: "leave" | "reschedule") {
  try {
    const permission = modeSchema.parse(mode)==="leave" ? "teacher.session.leave" : "teacher.session.reschedule";
    const user = await requirePermission(permission,undefined,{courseTeacherSelfService:true,deferSubscriptionGuard:true});
    const actor = {user,storeId:user.storeId!,staffId:user.staffId!};
    const s = await readSession(actor.storeId, id.parse(sessionId));
    if (!s || s.coachId!==actor.staffId) throw new AppError("FORBIDDEN", "只能處理自己的課程");
    assertEditable(s);
    const waiting=await coursePrisma.courseWaitlistEntry.findMany({where:{storeId:actor.storeId,sessionId:s.id,status:"WAITING"},select:{id:true,customerName:true,updatedAt:true,cardId:true},orderBy:{id:"asc"}});
    return { success:true as const, data:{ name:courseDisplayName(s.nameSnapshot), startsAt:s.startsAt.toISOString(), endsAt:s.endsAt.toISOString(), room:s.room.name, revision:revision(s,waiting), waiting:waiting.map(w=>({id:w.id,name:w.customerName})), students:s.bookings.filter(b=>b.status!=="CANCELLED" || ["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"].includes(b.absenceKind??"")).map(b=>({id:b.id,name:b.customerName})) } };
  } catch(error) { return handleCourseActionError(error); }
}
export async function changeCourseTeacherSession(input: unknown) {
  try {
    const d = z.object({ sessionId:id, mode:modeSchema, revision:z.string().regex(/^[a-f0-9]{64}$/), reason:z.string().trim().min(1,"請填寫原因").max(500), date:z.string().optional(), time:z.string().regex(/^([01]\d|2[0-3]):(?:00|30)$/,"請選擇整點或半點").optional() }).parse(input);
    const permission = d.mode==="leave" ? "teacher.session.leave" : "teacher.session.reschedule";
    const user = await requirePermission(permission,undefined,{courseTeacherSelfService:true});
    const storeId=user.storeId!, staffId=user.staffId!;
    const actor = {storeId,userId:user.id,name:user.name??"授課人員"};
    await courseTransaction(storeId,async tx=>{
      await assertCourseTeacherChange(tx,storeId,user.id,staffId,d.sessionId,permission);
      const s = await tx.courseSession.findFirst({where:{id:d.sessionId,storeId},include});
      assertEditable(s);
      const waiting=await tx.courseWaitlistEntry.findMany({where:{storeId,sessionId:d.sessionId,status:"WAITING"},select:{id:true,customerName:true,updatedAt:true,cardId:true},orderBy:{id:"asc"}});
      if (!s || revision(s,waiting)!==d.revision) throw new AppError("CONFLICT", "課程或學員已更新，請重新開啟核對");
      const students = s.bookings.filter(b=>b.status!=="CANCELLED" || ["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"].includes(b.absenceKind??""));
      if (d.mode==="leave") {
        await tx.courseSession.update({where:{id:s.id,storeId},data:{teacherAttendance:"LEAVE",teacherAttendanceReason:d.reason,teacherAttendanceAt:new Date(),teacherAttendanceById:user.id}});
        await refundTeacherAbsentSession(tx,actor,s.id);
        await cancelCourseWaitlistForSession(tx,storeId,s.id);
        await syncCourseRelease(tx,storeId,s.id);
      } else {
        const startsAt = d.date && d.time ? parseTaipeiDateTime(d.date,d.time) : null;
        if (!startsAt || startsAt<=new Date()) throw new AppError("VALIDATION", "請選擇未來的上課時間");
        if (+startsAt===+s.startsAt) throw new AppError("VALIDATION", "請選擇不同的上課時間");
        const endsAt = new Date(+startsAt + +s.endsAt - +s.startsAt);
        const range = {startsAt,endsAt};
        await assertCourseResources(tx,storeId,{templateId:s.templateId,roomId:s.roomId,coachId:staffId,capacity:s.capacity},s);
        if (s.bookings.some(b=>b.status!=="CANCELLED" && b.card && b.card.expiresAt<startsAt)) throw new AppError("CONFLICT", "新日期超過學員方案期限，原課保留");
        const waitingCardIds=[...new Set(waiting.map(w=>w.cardId))];
        if (waitingCardIds.length) {
          const cards=await tx.coursePointCard.findMany({where:{storeId,id:{in:waitingCardIds}},select:{id:true,expiresAt:true}});
          if (cards.length!==waitingCardIds.length || cards.some(card=>card.expiresAt<startsAt)) throw new AppError("CONFLICT", "新日期超過候補學員方案期限，原課保留");
        }
        const collision = await tx.courseSession.findFirst({where:{storeId,id:{not:s.id},cancelledAt:null,releasedAt:null,startsAt:{lt:endsAt},endsAt:{gt:startsAt},OR:[{roomId:s.roomId},{coachId:staffId}]}});
        if (collision) throw new AppError("CONFLICT", "這個時間教室或老師已有課，原課保留");
        await assertCourseSessionsFitHours(tx,storeId,[range]);
        await assertMusicCourseAvailability(tx,storeId,staffId,[range]);
        await assertCourseDutyCoverage(tx,storeId,[{...range,coachId:staffId}]);
        await tx.courseSessionMove.create({data:{storeId,sessionId:s.id,scope:"SINGLE",fromStartsAt:s.startsAt,fromEndsAt:s.endsAt,fromRoomId:s.roomId,fromCoachId:staffId,toStartsAt:startsAt,toEndsAt:endsAt,toRoomId:s.roomId,toCoachId:staffId,actorUserId:user.id}});
        await tx.courseSession.update({where:{id:s.id,storeId},data:{...range,rescheduledFromStartsAt:s.rescheduledFromStartsAt??s.startsAt,rescheduledFromEndsAt:s.rescheduledFromEndsAt??s.endsAt,rescheduledFromRoomId:s.rescheduledFromRoomId??s.roomId,rescheduledFromCoachId:s.rescheduledFromCoachId??staffId,rescheduleKind:"SINGLE",rescheduledAt:new Date(),rescheduledById:user.id}});
      }
      const saved = await tx.courseSession.findFirstOrThrow({where:{id:s.id,storeId}});
      await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","actorNameSnapshot","storeId",module,summary,"targetType","targetId",action,"beforeJson","afterJson","createdAt") VALUES (${crypto.randomUUID()},${user.id},${actor.name},${storeId},'COURSE',${d.mode==="leave"?"教師自行請假，整堂停課":"教師自行調課，整堂改時間"},'CourseSession',${s.id},'COURSE_TEACHER_SELF_CHANGE',${JSON.stringify({startsAt:s.startsAt,endsAt:s.endsAt,teacherAttendance:s.teacherAttendance})}::jsonb,${JSON.stringify({startsAt:saved.startsAt,endsAt:saved.endsAt,teacherAttendance:saved.teacherAttendance,reason:d.reason})}::jsonb,NOW())`;
      await recordCourseStoreNotice(tx,actor,{subjectKey:`session:${s.id}`,kind:d.mode==="leave"?"STOP":"MOVE",customerName:s.nameSnapshot,courseName:s.nameSnapshot,coachId:staffId,startsAt:saved.startsAt,previousStartsAt:s.startsAt,affectedCount:students.length,details:{students:students.map(b=>b.customerName),reason:d.reason}});
    });
    revalidatePath("/book"); revalidatePath("/dashboard/courses"); revalidatePath("/dashboard");
    return {success:true as const};
  } catch(error) {return handleCourseActionError(error);}
}
