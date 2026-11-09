import "server-only";
import { Prisma } from "@/../generated/course-client";
import { AppError } from "@/lib/errors";
import { musicLessonPeriodIssue, nextMusicLessonSlot } from "@/lib/music-lesson-periods";
import { musicNativeWorkflowEnabled } from "./music-native-workflow";
import {readManualMusicSlots} from './music-session-adjustment';
type Tx = Prisma.TransactionClient;
export type MusicLessonAssignment = { bookingId: string; cardId: string; customerId: string; period: number; ordinal: number; kind: string; sourceBookingId: string | null; releasedAt: Date | null };
export const fixedMusicPeriodsEnabled = (storeId: string) => musicNativeWorkflowEnabled(storeId);
export async function readMusicLessonAssignments(tx: Tx, storeId: string, bookingIds: string[]) {
  if (!fixedMusicPeriodsEnabled(storeId) || !bookingIds.length) return [] as MusicLessonAssignment[];
  return tx.$queryRaw<MusicLessonAssignment[]>`SELECT "bookingId","cardId","customerId",period,ordinal,kind,"sourceBookingId","releasedAt" FROM "CourseMusicLessonAssignment" WHERE "storeId"=${storeId} AND "bookingId"=ANY(${bookingIds}::text[])`;
}
export async function bindMusicLesson(tx: Tx, storeId: string, booking: { id: string; cardId: string | null; customerId: string | null; makeupForBookingId?: string | null }, card: { musicTermSizes: number[]; musicBonusLessons: number; musicOpeningStateRequired: boolean; requestKey?: string } | null, moveFrom?: string) {
  if (!fixedMusicPeriodsEnabled(storeId) || !booking.cardId || !booking.customerId || !card || card.musicOpeningStateRequired) return;
  const periodIssue = musicLessonPeriodIssue(card);
  if (periodIssue) throw new AppError("VALIDATION", periodIssue);
  const current = await readMusicLessonAssignments(tx, storeId, [booking.id]);
  if (current.length) return;
  const couponSource = card.requestKey?.startsWith("music-leave-makeup:") ? card.requestKey.slice("music-leave-makeup:".length) : null;
  const sourceId = moveFrom ?? booking.makeupForBookingId ?? couponSource;
  const source = sourceId ? (await readMusicLessonAssignments(tx, storeId, [sourceId]))[0] : null;
  if (sourceId && (!source || (!couponSource && source.cardId !== booking.cardId) || source.customerId !== booking.customerId)) throw new AppError("VALIDATION", "原課堂期別待確認，請先核對歸屬");
  // Never silently infer old lessons from their chronological order.
  const unknown = await tx.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM "CourseBooking" b WHERE b."storeId"=${storeId} AND b."cardId"=${booking.cardId} AND b."customerId"=${booking.customerId} AND b.id<>${booking.id} AND (b.status<>'CANCELLED' OR b."absenceKind" IN ('STUDENT_LEAVE','GROUP_LEAVE_FORFEITED','TEACHER_ABSENT')) AND NOT EXISTS(SELECT 1 FROM "CourseMusicLessonAssignment" a WHERE a."bookingId"=b.id)`;
  if (!source && Number(unknown[0]?.count)) throw new AppError("VALIDATION", "既有課堂期別待確認，請先在逐期總覽確認，再安排新堂次");
  const occupied = await tx.$queryRaw<Array<{ period: number; ordinal: number; bonus: boolean }>>`SELECT period,ordinal,false AS bonus FROM "CourseMusicLessonAssignment" WHERE "storeId"=${storeId} AND "cardId"=${booking.cardId} AND "customerId"=${booking.customerId} AND kind='REGULAR' AND "releasedAt" IS NULL`;
  occupied.push(...await readManualMusicSlots(tx,storeId,booking.cardId,booking.customerId));
  const slot = source ?? nextMusicLessonSlot(card.musicTermSizes, card.musicBonusLessons, occupied);
  if (!slot) throw new AppError("VALIDATION", "各期堂次已安排完畢，請核對取消、補課或續購方案");
  await tx.$executeRaw`INSERT INTO "CourseMusicLessonAssignment" ("bookingId","storeId","cardId","customerId",period,ordinal,kind,"sourceBookingId") VALUES (${booking.id},${storeId},${couponSource && source ? source.cardId : booking.cardId},${booking.customerId},${slot.period},${slot.ordinal},${booking.makeupForBookingId || couponSource ? "MAKEUP" : "REGULAR"},${booking.makeupForBookingId ?? couponSource ?? null})`;
}
export async function releaseMusicLesson(tx: Tx, storeId: string, bookingId: string) {
  if (fixedMusicPeriodsEnabled(storeId)) await tx.$executeRaw`UPDATE "CourseMusicLessonAssignment" SET "releasedAt"=now(),"updatedAt"=now() WHERE "storeId"=${storeId} AND "bookingId"=${bookingId} AND "releasedAt" IS NULL`;
}

/** Reassign only the current pending regular slot; immutable attendance/ledger
 * history remains on its original card. Caller audits before/after atomically. */
export async function rebindPendingMusicLesson(tx:Tx,storeId:string,booking:{id:string;cardId:string|null;customerId:string|null},card:{id:string;musicTermSizes:number[];musicBonusLessons:number;musicOpeningStateRequired:boolean}){
  if(!fixedMusicPeriodsEnabled(storeId))return null;
  const current=(await readMusicLessonAssignments(tx,storeId,[booking.id]))[0];
  if(!current){await bindMusicLesson(tx,storeId,{...booking,cardId:card.id},card);return {before:null,after:(await readMusicLessonAssignments(tx,storeId,[booking.id]))[0]??null};}
  if(current.kind!=="REGULAR"||current.sourceBookingId)throw new AppError("VALIDATION","來源補課期別不可自動改卡");
  if(current.cardId===card.id&&!current.releasedAt)return {before:current,after:current};
  const issue=musicLessonPeriodIssue(card);
  if(issue)throw new AppError("VALIDATION",issue);
  const unknown=await tx.$queryRaw<Array<{count:bigint}>>`SELECT count(*) FROM "CourseBooking" b WHERE b."storeId"=${storeId} AND b."cardId"=${card.id} AND b."customerId"=${booking.customerId} AND b.id<>${booking.id} AND (b.status<>'CANCELLED' OR b."absenceKind" IN ('STUDENT_LEAVE','GROUP_LEAVE_FORFEITED','TEACHER_ABSENT')) AND NOT EXISTS(SELECT 1 FROM "CourseMusicLessonAssignment" a WHERE a."bookingId"=b.id)`;
  if(Number(unknown[0]?.count))throw new AppError("VALIDATION","既有課堂期別待確認，尚未改卡或扣堂");
  const occupied=await tx.$queryRaw<Array<{period:number;ordinal:number;bonus:boolean}>>`SELECT period,ordinal,false AS bonus FROM "CourseMusicLessonAssignment" WHERE "storeId"=${storeId} AND "cardId"=${card.id} AND "customerId"=${booking.customerId} AND "bookingId"<>${booking.id} AND kind='REGULAR' AND "releasedAt" IS NULL`;
  occupied.push(...await readManualMusicSlots(tx,storeId,card.id,booking.customerId??undefined));
  const slot=nextMusicLessonSlot(card.musicTermSizes,card.musicBonusLessons,occupied);
  if(!slot)throw new AppError("VALIDATION","各期堂次已安排完畢，尚未改卡或扣堂");
  const count=await tx.$executeRaw`UPDATE "CourseMusicLessonAssignment" SET "cardId"=${card.id},period=${slot.period},ordinal=${slot.ordinal},"releasedAt"=NULL,"updatedAt"=NOW() WHERE "storeId"=${storeId} AND "bookingId"=${booking.id} AND "cardId"=${current.cardId} AND kind='REGULAR' AND "sourceBookingId" IS NULL`;
  if(count!==1)throw new AppError("CONFLICT","課堂期別已更新，請重新核對");
  return {before:current,after:{...current,cardId:card.id,period:slot.period,ordinal:slot.ordinal,releasedAt:null}};
}
