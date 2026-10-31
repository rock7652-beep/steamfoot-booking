import 'server-only';
import type {Prisma,CoursePointCard} from '../../../generated/course-client';
import {AppError} from '@/lib/errors';
import {dayRange} from '@/lib/date-utils';
import {musicCourseExpiry} from '@/lib/music-course-products';
import {musicLessonSlots,type MusicLessonSlot} from '@/lib/music-lesson-periods';
import {activeSessionAdjustments,type SessionAdjustmentRecord} from '@/lib/plan-session-adjustment';
import {musicNativeWorkflowEnabled as fixedMusicPeriodsEnabled} from './music-native-workflow';
import {courseSessionAdjustmentRecords} from './course-session-adjustment-records';
import {syncNativeMakeupExpiry,nativeDeductedLeaveIds} from './music-native-leave';

export function manualMusicSlots(records:SessionAdjustmentRecord[],customerId?:string):MusicLessonSlot[] {
  const active=activeSessionAdjustments(records).filter(r=>!customerId||r.customerId===customerId);
  if(active.some(r=>r.slots?.length!==r.quantity))throw new AppError('BUSINESS_RULE','歷史堂數調整的期別尚未核對，請先更正原調整再重新登記');
  return active.flatMap(r=>r.slots??[]);
}
export function earliestMusicBackfill(records:SessionAdjustmentRecord[]) {
  return activeSessionAdjustments(records).flatMap(r=>r.operation==='BACKFILL'&&r.occurredOn?[dayRange(r.occurredOn).start]:[])
    .sort((a,b)=>a.getTime()-b.getTime())[0]??null;
}
export async function musicAdjustmentSlots(tx:Prisma.TransactionClient,storeId:string,card:CoursePointCard,customerId:string,quantity:number,records:SessionAdjustmentRecord[]) {
  if(!fixedMusicPeriodsEnabled(storeId))return [];
  const music=await tx.$queryRaw<Array<{storeId:string}>>`SELECT "storeId" FROM "StoreFeatureEntitlement" WHERE "storeId"=${storeId} AND "featureKey"='business.music' AND status::text='ENABLED'`;
  if(!music.length)return [];
  if(card.unit!=='SESSION'||!card.musicTermSizes.length)throw new AppError('BUSINESS_RULE','音樂方案期別待確認，尚未調整堂數');
  const unknown=await tx.$queryRaw<Array<{count:bigint}>>`SELECT count(*) FROM "CourseBooking" b WHERE b."storeId"=${storeId} AND b."cardId"=${card.id} AND b."customerId"=${customerId} AND (b.status<>'CANCELLED' OR b."absenceKind" IN ('STUDENT_LEAVE','GROUP_LEAVE_FORFEITED','TEACHER_ABSENT')) AND NOT EXISTS(SELECT 1 FROM "CourseMusicLessonAssignment" a WHERE a."bookingId"=b.id)`;
  if(Number(unknown[0]?.count))throw new AppError('BUSINESS_RULE','既有課堂期別待確認，請先核對再調整堂數');
  const occupied=await tx.$queryRaw<MusicLessonSlot[]>`SELECT period,ordinal,false AS bonus FROM "CourseMusicLessonAssignment" WHERE "storeId"=${storeId} AND "cardId"=${card.id} AND "customerId"=${customerId} AND kind='REGULAR' AND "releasedAt" IS NULL`;
  occupied.push(...manualMusicSlots(records,customerId));
  const used=new Set(occupied.map(s=>`${s.period}:${s.ordinal}`));
  const slots=musicLessonSlots(card.musicTermSizes,card.musicBonusLessons).filter(s=>!used.has(`${s.period}:${s.ordinal}`)).slice(0,quantity);
  if(slots.length!==quantity)throw new AppError('BUSINESS_RULE','可調整的音樂期別堂次不足，尚未扣堂');
  return slots;
}
export async function readManualMusicSlots(tx:Pick<Prisma.TransactionClient,'$queryRaw'>,storeId:string,cardId:string,customerId?:string) {
  return manualMusicSlots(await courseSessionAdjustmentRecords(tx,storeId,[cardId]),customerId);
}
export async function readEarliestMusicBackfill(tx:Pick<Prisma.TransactionClient,'$queryRaw'>,storeId:string,cardId:string) {
  return earliestMusicBackfill(await courseSessionAdjustmentRecords(tx,storeId,[cardId]));
}
/** Recalculate first-use only while the card retains its original first-use
 * policy. Explicitly adjusted expiry (musicValidityDays=null) is authoritative. */
export async function syncMusicAdjustmentActivation(tx:Prisma.TransactionClient,storeId:string,card:CoursePointCard,records:SessionAdjustmentRecord[]) {
  if(!card.musicValidityDays)return {};
  const leaveIds=await nativeDeductedLeaveIds(tx,storeId);
  const first=await tx.courseBooking.findFirst({where:{storeId,cardId:card.id,OR:[{status:{in:['ATTENDED','NO_SHOW']}},{absenceKind:'GROUP_LEAVE_FORFEITED'},{id:{in:leaveIds},status:'CANCELLED',absenceKind:'STUDENT_LEAVE'}]},orderBy:{session:{startsAt:'asc'}},select:{session:{select:{startsAt:true}}}});
  const manual=earliestMusicBackfill(records);
  const musicActivatedAt=!first?manual:!manual||first.session.startsAt<manual?first.session.startsAt:manual;
  // No actual/backfilled first lesson: preserve the initial unactivated expiry.
  const expiresAt=musicActivatedAt?musicCourseExpiry(musicActivatedAt,card.musicValidityDays):dayRange('2099-12-31').end;
  if(await tx.courseBooking.count({where:{storeId,cardId:card.id,status:'RESERVED',session:{endsAt:{gt:expiresAt}}}}))throw new AppError('BUSINESS_RULE','補登後的首堂效期早於既有預約，請先核對期限或預約');
  if(card.musicActivatedAt?.getTime()===musicActivatedAt?.getTime()&&card.expiresAt?.getTime()===expiresAt.getTime())return {};
  await syncNativeMakeupExpiry(tx,storeId,card.id,expiresAt,musicActivatedAt);
  return {musicActivatedAt,expiresAt};
}
