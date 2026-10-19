import "server-only";
import type { Prisma } from "../../../generated/course-client";
import { calculateTeacherFee, originalMusicUnitPrice, type TeacherFeeSeat } from "@/lib/course-teacher-fee";

/** Caller authorizes salary access. One store-scoped query for the entire requested batch. */
export async function readTeacherFeeSeats(tx: Pick<Prisma.TransactionClient, "$queryRaw">, storeId: string, sessionIds: string[]) {
  const grouped = new Map<string, TeacherFeeSeat[]>();
  if (!sessionIds.length) return grouped;
  const rows = await tx.$queryRaw<Array<TeacherFeeSeat & {sessionId:string;cardId:string|null;trialPrice:number|null;pointCost:number;purchaseCount:bigint;listPrice:number|null;points:number|null;musicBonusLessons:number|null}>>`
    SELECT b.id,b."sessionId",b."customerName",b.status,b."bookingKind",b."absenceKind",b."cardId",b."trialPrice",b."pointCost",
      p.count AS "purchaseCount",p."listPrice",p.points,p."musicBonusLessons"
    FROM "CourseBooking" b
    LEFT JOIN LATERAL (
      SELECT count(*) AS count,min(o."listPrice") AS "listPrice",min(o.points) AS points,min(o."musicBonusLessons") AS "musicBonusLessons"
      FROM "CoursePurchase" o WHERE o."storeId"=b."storeId" AND o."cardId"=b."cardId" AND o."confirmedAt" IS NOT NULL
    ) p ON true
    WHERE b."storeId"=${storeId} AND b."sessionId"=ANY(${sessionIds}::text[]) ORDER BY b.id`;
  for (const row of rows) {
    const originalUnitPrice = row.bookingKind === "TRIAL" ? row.trialPrice : Number(row.purchaseCount) === 1 && row.points !== null
      ? originalMusicUnitPrice({listPrice:row.listPrice,points:row.points,musicBonusLessons:row.musicBonusLessons??0}) : null;
    const seats = grouped.get(row.sessionId) ?? [];
    const sportsCharge=row.bookingKind==="TRIAL"?row.trialPrice:Number(row.purchaseCount)===1&&row.listPrice!==null&&row.points!==null&&row.points>0&&row.pointCost>=0 ? row.listPrice*row.pointCost/row.points : null;
    seats.push({...row,originalUnitPrice,sportsCharge}); grouped.set(row.sessionId,seats);
  }
  return grouped;
}
export { calculateTeacherFee };

export { capturedTeacherFee, type CapturedTeacherFee } from "./course-captured-teacher-fee";
