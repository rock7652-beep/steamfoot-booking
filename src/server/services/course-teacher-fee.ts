import "server-only";
import type { Prisma } from "../../../generated/course-client";
import { calculateTeacherFee, originalMusicUnitPrice, type TeacherFeeSeat } from "@/lib/course-teacher-fee";

/** Caller authorizes salary access. One store-scoped query for the entire requested batch. */
export async function readTeacherFeeSeats(tx: Pick<Prisma.TransactionClient, "$queryRaw">, storeId: string, sessionIds: string[]) {
  const grouped = new Map<string, TeacherFeeSeat[]>();
  if (!sessionIds.length) return grouped;
  const rows = await tx.$queryRaw<Array<TeacherFeeSeat & {sessionId:string;cardId:string|null;trialPrice:number|null;purchaseCount:bigint;listPrice:number|null;points:number|null;musicBonusLessons:number|null}>>`
    SELECT b.id,b."sessionId",b."customerName",b.status,b."bookingKind",b."absenceKind",b."cardId",b."trialPrice",
      p.count AS "purchaseCount",p."listPrice",p.points,p."musicBonusLessons",p."tuitionTemplateId"
    FROM "CourseBooking" b
    LEFT JOIN LATERAL (
      SELECT count(*) AS count,min(o."listPrice") AS "listPrice",min(o.points) AS points,min(o."musicBonusLessons") AS "musicBonusLessons",max(o."templateIds"[1]) AS "tuitionTemplateId"
      FROM "CoursePurchase" o WHERE o."storeId"=b."storeId" AND o."cardId"=b."cardId" AND o."confirmedAt" IS NOT NULL
    ) p ON true
    WHERE b."storeId"=${storeId} AND b."sessionId"=ANY(${sessionIds}::text[]) ORDER BY b.id`;
  for (const row of rows) {
    const originalUnitPrice = row.bookingKind === "TRIAL" ? row.trialPrice : Number(row.purchaseCount) === 1 && row.points !== null
      ? originalMusicUnitPrice({listPrice:row.listPrice,points:row.points,musicBonusLessons:row.musicBonusLessons??0}) : null;
    const seats = grouped.get(row.sessionId) ?? [];
    seats.push({...row,originalUnitPrice}); grouped.set(row.sessionId,seats);
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
  if(snapshot.revision===0)return {amount:null,issue:"舊課次費率待核對",details:[]};
  const rule=snapshot.rule as {tuitionRules?:Record<string,unknown>;mode?:string;value?:number}|null;
  if(rule?.tuitionRules){
    const relevant=seats.filter(seat=>seat.bookingKind!=="TEACHER_MAKEUP"&&(seat.status!=="CANCELLED"||seat.absenceKind==="GROUP_LEAVE_FORFEITED"));
    const selected=relevant.map(seat=>seat.tuitionTemplateId&&rule.tuitionRules?.[seat.tuitionTemplateId]||rule);
    const keys=new Set(selected.map(value=>{const fee=value as {mode?:string;value?:number};return `${fee.mode}:${fee.value}`;}));
    if(keys.size>1)return {amount:null,issue:"同堂學費薪酬規則不同，請核對",details:[]};
    const chosen=selected[0]??rule;
    return calculateTeacherFee({rule:{...(chosen as object),calculationVersion:2},teacherAttendance:snapshot.teacherAttendance,trialMode:snapshot.musicTrialMode,trialBase:snapshot.musicTeacherFeeBase,seats});
  }
  if(isTeacherFeeV2(snapshot.rule))return calculateTeacherFee({rule:snapshot.rule,teacherAttendance:snapshot.teacherAttendance,trialMode:snapshot.musicTrialMode,trialBase:snapshot.musicTeacherFeeBase,seats});
  const due=seats.filter(s=>s.bookingKind!=="TEACHER_MAKEUP"&&(s.status==="ATTENDED"||s.status==="NO_SHOW"||s.absenceKind==="GROUP_LEAVE_FORFEITED"));
  const free=due.filter(s=>s.bookingKind==="TRIAL"&&snapshot.musicTrialMode==="FREE").length;
  const amount=courseTeacherFee(snapshot.rule,{paid:due.length-free,freeTrial:free,pending:seats.filter(s=>s.status==="RESERVED").length},{perLesson:snapshot.musicPricePerLesson??null,freeTrialBase:snapshot.musicTeacherFeeBase??null});
  return {amount,issue:amount===null?"舊課次費率或點名待核對":null,details:[]};
}
