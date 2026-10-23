import { musicNativeWorkflowEnabled } from "./music-native-workflow";
import { isMusicOpeningMakeupBooking, MUSIC_OPENING_MAKEUP_FEE_ISSUE, readMusicOpeningCard, readMusicOpeningLesson } from "@/lib/music-opening-runtime";
import "server-only";
import type { Prisma } from "../../../generated/course-client";
import { calculateTeacherFee, originalMusicUnitPrice, type TeacherFeeSeat } from "@/lib/course-teacher-fee";
import { readMusicPilotFeeProof, verifiedMusicPilotFeeBasis, type PilotFeeRow } from "./music-pilot-teacher-fee";

/** Caller authorizes salary access. One store-scoped query for the entire requested batch. */
export async function readTeacherFeeSeats(tx: Pick<Prisma.TransactionClient, "$queryRaw">, storeId: string, sessionIds: string[]) {
  const grouped = new Map<string, TeacherFeeSeat[]>();
  if (!sessionIds.length) return grouped;
  const nativeMakeups = musicNativeWorkflowEnabled(storeId);
  const rows = await tx.$queryRaw<Array<TeacherFeeSeat & PilotFeeRow & {sessionId:string;cardId:string|null;trialPrice:number|null;purchaseCount:bigint;listPrice:number|null;points:number|null;musicBonusLessons:number|null;
      customerId:string|null;pointCost:number;companionIndex:number|null;makeupForBookingId:string|null; musicOpeningStateRequired:boolean; musicOpeningState:unknown; cardUnit:string|null;
      musicActivatedAt:Date|null; expiresAt:Date|null; memberCustomerIds:string[];
      musicOpeningTermKey:string|null;musicOpeningLessonOrdinal:number|null;musicOpeningSourceLessonKey:string|null;startsAt:Date}>>`
    SELECT b.id,b."sessionId",b."customerName",b.status,b."bookingKind",b."absenceKind",b."cardId",b."trialPrice",
      p.count AS "purchaseCount",p."listPrice",p.points,p."musicBonusLessons",p."tuitionTemplateId",
      b."customerId",b."pointCost",b."companionIndex",b."makeupForBookingId",b."musicOpeningMakeupEntitlementId",b."musicOpeningTermKey",b."musicOpeningLessonOrdinal",b."musicOpeningSourceLessonKey",s."startsAt",
      c."musicOpeningStateRequired",c.unit AS "cardUnit",c."musicActivatedAt",c."expiresAt",c."requestKey" AS "cardRequestKey",s."templateId",
      source."cardId" AS "sourceCardId",source."customerId" AS "sourceCustomerId",source.status AS "sourceStatus",source."absenceKind" AS "sourceAbsenceKind",ss."templateId" AS "sourceTemplateId",
      m."contentHash" AS "makeupContentHash",m."customerId" AS "makeupCustomerId",m."templateId" AS "makeupTemplateId",
      CASE WHEN os.id IS NULL THEN NULL ELSE to_jsonb(os) END AS "musicOpeningState",
      ARRAY(SELECT m."customerId" FROM "CourseCardMember" m WHERE m."cardId"=c.id AND m."storeId"=c."storeId") AS "memberCustomerIds"
    FROM "CourseBooking" b
    JOIN "CourseSession" s ON s.id=b."sessionId" AND s."storeId"=b."storeId"
    LEFT JOIN "CoursePointCard" c ON c.id=b."cardId" AND c."storeId"=b."storeId"
    LEFT JOIN "CourseMusicOpeningState" os ON os."cardId"=c.id AND os."storeId"=c."storeId"
    LEFT JOIN "CourseBooking" source ON source.id=CASE WHEN c."requestKey" LIKE 'yjy-pilot-makeup:%' THEN substring(c."requestKey" from length('yjy-pilot-makeup:')+1) WHEN ${nativeMakeups} AND c."requestKey" LIKE 'music-leave-makeup:%' THEN substring(c."requestKey" from length('music-leave-makeup:')+1) ELSE NULL END AND source."storeId"=b."storeId"
    LEFT JOIN "CourseSession" ss ON ss.id=source."sessionId" AND ss."storeId"=b."storeId"
    LEFT JOIN "CourseMusicOpeningMakeupEntitlement" m ON m.id=b."musicOpeningMakeupEntitlementId" AND m."storeId"=b."storeId"
    LEFT JOIN LATERAL (
      SELECT count(*) AS count,min(o."listPrice") AS "listPrice",min(o.points) AS points,min(o."musicBonusLessons") AS "musicBonusLessons",max(o."templateIds"[1]) AS "tuitionTemplateId"
      FROM "CoursePurchase" o WHERE o."storeId"=b."storeId" AND o."cardId"=CASE WHEN ${nativeMakeups} AND c."requestKey" LIKE 'music-leave-makeup:%' AND source.status='CANCELLED' AND source."absenceKind"='STUDENT_LEAVE' AND source."customerId"=b."customerId" THEN source."cardId" ELSE b."cardId" END AND o."confirmedAt" IS NOT NULL
    ) p ON true
    WHERE b."storeId"=${storeId} AND b."sessionId"=ANY(${sessionIds}::text[]) ORDER BY b.id`;
  const discounted = nativeMakeups ? await tx.$queryRaw<Array<{cardId:string;total:number;lessons:number}>>`
    SELECT o."cardId",t.due AS total,(o.points-o."musicBonusLessons") AS lessons
    FROM "CourseMusicTuition" t JOIN "CoursePurchase" o ON o.id=t."purchaseId" AND o."storeId"=t."storeId"
    WHERE t."storeId"=${storeId} AND t."discountTeacherFee" AND o."cardId"=ANY(${rows.flatMap(r=>[r.cardId,r.sourceCardId].filter((id):id is string=>!!id))}::text[])` : [];
  const discountedByCard=new Map(discounted.map(r=>[r.cardId,{total:r.total,lessons:r.lessons}]));
  const pilotProof=rows.some(r=>r.cardId?.startsWith("yjy-pilot-")||r.customerId?.startsWith("yjy-lubymusic-student-"))?await readMusicPilotFeeProof(tx,storeId):null;
  for (const row of rows) {
    const openingMakeupSource = isMusicOpeningMakeupBooking(row);
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
    const verified=pilotProof&&opening.kind!=="BLOCKED"&&!(opening.kind==="OPENING"&&lesson.kind==="BLOCKED")?verifiedMusicPilotFeeBasis(pilotProof,row):null;
    if(verified){originalUnitPrice=verified.price;openingIssue=null;}
    const discountedBasis=!verified&&opening.kind==="NATIVE"&&Number(row.purchaseCount)===1?discountedByCard.get(row.cardRequestKey?.startsWith("music-leave-makeup:")?row.sourceCardId??"":row.cardId??""):undefined;
    if(discountedBasis&&discountedBasis.lessons>0)originalUnitPrice=discountedBasis.total/discountedBasis.lessons;
    const seats = grouped.get(row.sessionId) ?? [];
    const sportsCharge=row.bookingKind==="TRIAL"?row.trialPrice:Number(row.purchaseCount)===1&&row.listPrice!==null&&row.points!==null&&row.points>0&&row.pointCost>=0 ? row.listPrice*row.pointCost/row.points : null;
    // Keep source snapshots/keys on the server; expose only the existing fee-seat shape.
    seats.push({ tuitionTemplateId:row.tuitionTemplateId, sportsCharge, id:row.id, customerName:row.customerName, status:row.status, bookingKind:row.bookingKind,
      absenceKind:row.absenceKind, originalUnitPrice, ...(discountedBasis?{discountedBasis}:{}),
      ...(verified&&row.bookingKind==="TRIAL"?{verifiedTrialFeeBase:verified.price}:{}),
      ...(openingMakeupSource ? { openingMakeupSource: true, openingIssue: verified?null:MUSIC_OPENING_MAKEUP_FEE_ISSUE,verifiedOpeningMakeupFee:!!verified?.makeup } : {}),
      ...(!openingMakeupSource && (verified||opening.kind !== "NATIVE" || openingIssue) ? { openingPriceSource:true, openingIssue } : {}) });
    grouped.set(row.sessionId,seats);
  }
  return grouped;
}
export { calculateTeacherFee };

export { capturedTeacherFee, type CapturedTeacherFee } from "./course-captured-teacher-fee";
