import { readMusicOpeningCard, readMusicOpeningLesson } from "@/lib/music-opening-runtime";
import "server-only";
import type { Prisma } from "../../../generated/course-client";
import { calculateTeacherFee, originalMusicUnitPrice, type TeacherFeeSeat } from "@/lib/course-teacher-fee";

/** Caller authorizes salary access. One store-scoped query for the entire requested batch. */
export async function readTeacherFeeSeats(tx: Pick<Prisma.TransactionClient, "$queryRaw">, storeId: string, sessionIds: string[]) {
  const grouped = new Map<string, TeacherFeeSeat[]>();
  if (!sessionIds.length) return grouped;
  const rows = await tx.$queryRaw<Array<TeacherFeeSeat & {sessionId:string;cardId:string|null;trialPrice:number|null;purchaseCount:bigint;listPrice:number|null;points:number|null;musicBonusLessons:number|null;
      customerId:string|null;pointCost:number;companionIndex:number|null;makeupForBookingId:string|null; musicOpeningStateRequired:boolean; musicOpeningState:unknown; cardUnit:string|null;
      musicActivatedAt:Date|null; expiresAt:Date|null; memberCustomerIds:string[];
      musicOpeningTermKey:string|null;musicOpeningLessonOrdinal:number|null;musicOpeningSourceLessonKey:string|null;startsAt:Date}>>`
    SELECT b.id,b."sessionId",b."customerName",b.status,b."bookingKind",b."absenceKind",b."cardId",b."trialPrice",
      p.count AS "purchaseCount",p."listPrice",p.points,p."musicBonusLessons",
      b."customerId",b."pointCost",b."companionIndex",b."makeupForBookingId",b."musicOpeningTermKey",b."musicOpeningLessonOrdinal",b."musicOpeningSourceLessonKey",s."startsAt",
      c."musicOpeningStateRequired",c.unit AS "cardUnit",c."musicActivatedAt",c."expiresAt",
      CASE WHEN os.id IS NULL THEN NULL ELSE to_jsonb(os) END AS "musicOpeningState",
      ARRAY(SELECT m."customerId" FROM "CourseCardMember" m WHERE m."cardId"=c.id AND m."storeId"=c."storeId") AS "memberCustomerIds"
    FROM "CourseBooking" b
    JOIN "CourseSession" s ON s.id=b."sessionId" AND s."storeId"=b."storeId"
    LEFT JOIN "CoursePointCard" c ON c.id=b."cardId" AND c."storeId"=b."storeId"
    LEFT JOIN "CourseMusicOpeningState" os ON os."cardId"=c.id AND os."storeId"=c."storeId"
    LEFT JOIN LATERAL (
      SELECT count(*) AS count,min(o."listPrice") AS "listPrice",min(o.points) AS points,min(o."musicBonusLessons") AS "musicBonusLessons"
      FROM "CoursePurchase" o WHERE o."storeId"=b."storeId" AND o."cardId"=b."cardId" AND o."confirmedAt" IS NOT NULL
    ) p ON true
    WHERE b."storeId"=${storeId} AND b."sessionId"=ANY(${sessionIds}::text[]) ORDER BY b.id`;
  for (const row of rows) {
    const opening = readMusicOpeningCard(row.cardId ? {
      id: row.cardId, storeId, unit: row.cardUnit ?? undefined,
      musicOpeningStateRequired: row.musicOpeningStateRequired, musicOpeningState: row.musicOpeningState,
      members: row.memberCustomerIds?.map(customerId => ({ customerId })),
    } : null, storeId, row.customerId);
    const lesson = readMusicOpeningLesson(opening, { ...row, session: { startsAt: row.startsAt } });
    let openingIssue: string | null = lesson.kind === "BLOCKED" ? lesson.issue : null;
    let originalUnitPrice: number | null = null;
    if (opening.kind === "OPENING") {
      const record = opening.record;
      if (Number(row.purchaseCount)>0) openingIssue = "期初方案不可同時連結購買收款，請先核對";
      if (opening.teacherFeePolicy !== "MUSIC_V2_ORIGINAL_PRICE") openingIssue = "期初來源計薪規則尚未核對";
      else if (record.originalUnitPrice === null || record.tuition.originalListPrice === null ||
          record.originalUnitPrice * record.paidLessons !== record.tuition.originalListPrice) openingIssue = "期初原單堂價與原總價待核對";
      originalUnitPrice = openingIssue ? null : record.originalUnitPrice;
    } else if (opening.kind === "NATIVE" && !openingIssue) {
      originalUnitPrice = row.bookingKind === "TRIAL" ? row.trialPrice : Number(row.purchaseCount) === 1 && row.points !== null
        ? originalMusicUnitPrice({listPrice:row.listPrice,points:row.points,musicBonusLessons:row.musicBonusLessons??0}) : null;
    }
    const seats = grouped.get(row.sessionId) ?? [];
    // Keep source snapshots/keys on the server; expose only the existing fee-seat shape.
    seats.push({ id:row.id, customerName:row.customerName, status:row.status, bookingKind:row.bookingKind,
      absenceKind:row.absenceKind, originalUnitPrice,
      ...(opening.kind !== "NATIVE" || openingIssue ? { openingPriceSource:true, openingIssue } : {}) });
    grouped.set(row.sessionId,seats);
  }
  return grouped;
}
export { calculateTeacherFee };

import { courseTeacherFee } from "@/lib/course-fee-payment";
import { isTeacherFeeV2, type TeacherFeeResult } from "@/lib/course-teacher-fee";
export type CapturedTeacherFee = {
  rule:unknown;revision?:number;teacherAttendance?:string;cancelledAt?:Date|null;
  musicTrialMode?:string|null;musicTeacherFeeBase?:number|null;musicPricePerLesson?:number|null;
};
export function capturedTeacherFee(snapshot:CapturedTeacherFee,seats:TeacherFeeSeat[]):TeacherFeeResult {
  if (snapshot.cancelledAt || ["LEAVE","NO_SHOW"].includes(snapshot.teacherAttendance??"")) return {amount:0,issue:null,details:[]};
  if (seats.some(seat => seat.openingIssue)) return {amount:null,issue:seats.find(seat => seat.openingIssue)!.openingIssue!,details:[]};
  if (seats.some(seat => seat.openingPriceSource) && !isTeacherFeeV2(snapshot.rule)) return {amount:null,issue:"期初方案尚未核對此計薪版本",details:[]};
  if(snapshot.revision===0)return {amount:null,issue:"舊課次費率待核對",details:[]};
  if(isTeacherFeeV2(snapshot.rule))return calculateTeacherFee({rule:snapshot.rule,teacherAttendance:snapshot.teacherAttendance,trialMode:snapshot.musicTrialMode,trialBase:snapshot.musicTeacherFeeBase,seats});
  const due=seats.filter(s=>s.bookingKind!=="TEACHER_MAKEUP"&&(s.status==="ATTENDED"||s.status==="NO_SHOW"||s.absenceKind==="GROUP_LEAVE_FORFEITED"));
  const free=due.filter(s=>s.bookingKind==="TRIAL"&&snapshot.musicTrialMode==="FREE").length;
  const amount=courseTeacherFee(snapshot.rule,{paid:due.length-free,freeTrial:free,pending:seats.filter(s=>s.status==="RESERVED").length},{perLesson:snapshot.musicPricePerLesson??null,freeTrialBase:snapshot.musicTeacherFeeBase??null});
  return {amount,issue:amount===null?"舊課次費率或點名待核對":null,details:[]};
}
