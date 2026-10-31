import 'server-only';
import {createHash} from 'node:crypto';
import type {Prisma} from '../../../generated/course-client';
import {AppError} from '@/lib/errors';
import {toLocalDateStr} from '@/lib/date-utils';
import {activeSessionAdjustments,type SessionAdjustmentInput,type SessionAdjustmentRecord} from '@/lib/plan-session-adjustment';
import type {PlanManagementActor} from './plan-management-command';
import {courseSessionAdjustmentRecords} from './course-session-adjustment-records';
import {musicAdjustmentSlots,syncMusicAdjustmentActivation} from './music-session-adjustment';

/** courseTransaction holds the same Store lock as reservations and attendance. */
export async function adjustCourseSessions(tx:Prisma.TransactionClient,a:PlanManagementActor,d:SessionAdjustmentInput,customerName:string) {
  if (a.storeId!==d.expectedStoreId) throw new AppError('CONFLICT','門市已切換，請重新開啟方案');
  const id='plan-session-adjustment:'+createHash('sha256').update(JSON.stringify([a.storeId,d.requestKey])).digest('hex');
  const fingerprint=createHash('sha256').update(JSON.stringify([a.userId,d])).digest('hex');
  const receipts=await tx.$queryRaw<Array<{afterJson:{fingerprint:string;record:SessionAdjustmentRecord;expiresAt:string|null}}>>`SELECT "afterJson" FROM "AuditLog" WHERE id=${id} AND "storeId"=${a.storeId}`;
  if(receipts.length){const r=receipts[0].afterJson;if(r.fingerprint!==fingerprint)throw new AppError('CONFLICT','操作識別碼已使用，請核對原請求');return {record:r.record,remaining:r.record.remainingAfter,expiresAt:r.expiresAt};}
  const card=await tx.coursePointCard.findFirst({where:{id:d.cardId,storeId:a.storeId},include:{members:true}});
  if(!card||!card.members.some(m=>m.customerId===d.customerId))throw new AppError('FORBIDDEN','找不到本店學員持有的方案');
  if(card.closedAt||card.remaining!==d.expectedRemaining||(card.expiresAt?.toISOString()??null)!==d.expectedExpiresAt)throw new AppError('CONFLICT','方案額度、期限或狀態已更新，請重新核對');
  // Source-backed and makeup rights retain their dedicated immutable workflows.
  if(card.musicOpeningStateRequired||['music-leave-makeup:','no-show-makeup:','yjy-pilot-'].some(p=>card.requestKey.startsWith(p)))throw new AppError('BUSINESS_RULE','來源方案或補課權益須由原專用流程核對，不能直接調整堂數');
  const records=await courseSessionAdjustmentRecords(tx,a.storeId,[card.id]);
  const original=d.operation==='REVERSE'?activeSessionAdjustments(records).find(r=>r.id===d.reversalOf):null;
  if(d.operation==='REVERSE'&&(!original||original.customerId!==d.customerId||original.quantity!==d.quantity))throw new AppError('CONFLICT','原紀錄已更正或內容不符，請重新核對');
  if(d.operation!=='REVERSE'){
    const held=await tx.courseBooking.aggregate({where:{storeId:a.storeId,cardId:card.id,status:'RESERVED'},_sum:{pointCost:true}});
    if(d.quantity>card.remaining-(held._sum.pointCost??0))throw new AppError('BUSINESS_RULE','可用堂數不足，已預約占用的額度不能調整');
    if(d.operation==='BACKFILL'&&card.expiresAt&&d.occurredOn!>toLocalDateStr(card.expiresAt))throw new AppError('VALIDATION','上課日期超過方案有效期限');
  }
  const remaining=card.remaining+(d.operation==='REVERSE'?d.quantity:-d.quantity);
  const record:SessionAdjustmentRecord={id,cardId:card.id,customerId:d.customerId,customerName,operation:d.operation,quantity:d.quantity,occurredOn:d.operation==='BACKFILL'?d.occurredOn!:null,reason:d.reason,recordedAt:new Date().toISOString(),actorName:a.name??'管理人員',reversalOf:original?.id??null,remainingBefore:card.remaining,remainingAfter:remaining};
  if(d.operation!=='REVERSE')record.slots=await musicAdjustmentSlots(tx,a.storeId,card,d.customerId,d.quantity,records);
  const activation=d.operation==='BACKFILL'||original?.operation==='BACKFILL'?await syncMusicAdjustmentActivation(tx,a.storeId,card,[...records,record]):{};
  await tx.coursePointCard.update({where:{id:card.id},data:{remaining,...activation}});
  await tx.coursePointEntry.create({data:{id,storeId:a.storeId,cardId:card.id,kind:d.operation==='REVERSE'?'RELEASE':d.operation==='VOID'?'VOID':'DEBIT',points:d.quantity,actorUserId:a.userId}});
  const expiresAt=(activation?.expiresAt??card.expiresAt)?.toISOString()??null;
  await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","actorNameSnapshot","actorRoleSnapshot","storeId",module,source,"targetType","targetId",action,summary,"beforeJson","afterJson","createdAt")
    VALUES (${id},${a.userId},${a.name??null},${a.role??null},${a.storeId},CASE WHEN EXISTS(SELECT 1 FROM "StoreFeatureEntitlement" WHERE "storeId"=${a.storeId} AND "featureKey"='business.music' AND status::text='ENABLED') THEN 'MUSIC' ELSE 'FITNESS' END,'MANUAL','CoursePointCard',${card.id},'PLAN_SESSION_ADJUSTMENT','調整堂數：保留原收款與上課紀錄',${JSON.stringify({remaining:card.remaining,expiresAt:card.expiresAt,musicActivatedAt:card.musicActivatedAt})}::jsonb,${JSON.stringify({fingerprint,record,expiresAt})}::jsonb,NOW())`;
  return {record,remaining,expiresAt};
}
