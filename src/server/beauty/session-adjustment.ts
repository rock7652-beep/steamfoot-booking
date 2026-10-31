import 'server-only';
import {createHash} from 'node:crypto';
import {AppError} from '@/lib/errors';
import {toLocalDateStr} from '@/lib/date-utils';
import {activeSessionAdjustments,type SessionAdjustmentInput,type SessionAdjustmentRecord} from '@/lib/plan-session-adjustment';
import type {BeautyActor} from './access';
import {command} from './command';
import type {Tx} from './booking';

export async function beautySessionAdjustmentRecords(tx:Pick<Tx,'$queryRaw'>,storeId:string,cardIds:string[]) {
  if(!cardIds.length)return [] as SessionAdjustmentRecord[];
  const rows=await tx.$queryRaw<Array<{body:string}>>`SELECT e.body FROM "BeautyEvent" e JOIN "BeautyLedger" l ON l.id=e.id AND l."storeId"=e."storeId" WHERE e."storeId"=${storeId} AND e.kind='PLAN_SESSION_ADJUSTMENT' AND e.status='AUDIT' AND l."cardId"=ANY(${cardIds}::text[]) ORDER BY e."createdAt" DESC,e.id DESC`;
  return rows.map(r=>JSON.parse(r.body) as SessionAdjustmentRecord);
}
/** Called inside beautyTransaction, which serializes all store quota writers. */
export async function adjustBeautySessions(tx:Tx,a:BeautyActor,d:SessionAdjustmentInput,customerName:string) {
  if(a.storeId!==d.expectedStoreId)throw new AppError('CONFLICT','門市已切換，請重新開啟方案');
  return command(tx,a,d.requestKey,{command:'session-adjustment',...d},async()=>{
    const card=await tx.beautyCard.findFirst({where:{storeId:a.storeId,id:d.cardId}});
    if(!card||!card.memberIds.includes(d.customerId))throw new AppError('FORBIDDEN','找不到本店顧客持有的方案');
    if(card.closedAt||card.remaining!==d.expectedRemaining||card.expiresAt.toISOString()!==d.expectedExpiresAt)throw new AppError('CONFLICT','方案額度、期限或狀態已更新，請重新核對');
    const records=await beautySessionAdjustmentRecords(tx,a.storeId,[card.id]);
    const original=d.operation==='REVERSE'?activeSessionAdjustments(records).find(r=>r.id===d.reversalOf):null;
    if(d.operation==='REVERSE'&&(!original||original.customerId!==d.customerId||original.quantity!==d.quantity))throw new AppError('CONFLICT','原紀錄已更正或內容不符，請重新核對');
    if(d.operation!=='REVERSE'){
      const held=await tx.beautyAppointment.count({where:{storeId:a.storeId,cardId:card.id,status:'RESERVED'}});
      if(d.quantity>card.remaining-held)throw new AppError('BUSINESS_RULE','可用堂數不足，已預約占用的額度不能調整');
      if(d.operation==='BACKFILL'&&d.occurredOn!>toLocalDateStr(card.expiresAt))throw new AppError('VALIDATION','上課日期超過方案有效期限');
    }
    const remaining=card.remaining+(d.operation==='REVERSE'?d.quantity:-d.quantity);
    const id='plan-session-adjustment:'+createHash('sha256').update(JSON.stringify([a.storeId,d.requestKey])).digest('hex');
    const record:SessionAdjustmentRecord={id,cardId:card.id,customerId:d.customerId,customerName,operation:d.operation,quantity:d.quantity,occurredOn:d.operation==='BACKFILL'?d.occurredOn!:null,reason:d.reason,recordedAt:new Date().toISOString(),actorName:a.name??'管理人員',reversalOf:original?.id??null,remainingBefore:card.remaining,remainingAfter:remaining};
    await tx.beautyCard.update({where:{id:card.id},data:{remaining}});
    await tx.beautyLedger.create({data:{id,storeId:a.storeId,cardId:card.id,kind:d.operation==='REVERSE'?'MANUAL_REVERSE':d.operation==='VOID'?'MANUAL_VOID':'MANUAL_BACKFILL',delta:d.operation==='REVERSE'?d.quantity:-d.quantity,actorUserId:a.userId}});
    await tx.beautyEvent.create({data:{id,storeId:a.storeId,kind:'PLAN_SESSION_ADJUSTMENT',status:'AUDIT',userId:a.userId,body:JSON.stringify(record)}});
    return {record,remaining,expiresAt:card.expiresAt.toISOString()};
  });
}
