import 'server-only';
import {createHash} from 'node:crypto';
import type {Prisma} from '@prisma/client';
import {AppError} from '@/lib/errors';
import {parseTaiwanDateToDbDate,toLocalDateStr} from '@/lib/date-utils';
import {activeSessionAdjustments,type SessionAdjustmentInput,type SessionAdjustmentRecord,type SessionAdjustmentHistoryRecord} from '@/lib/plan-session-adjustment';
import {refreshWalletCounter} from './wallet-session';

type Actor={storeId:string;userId:string;name:string;role:string;staffId:string|null};
type Snapshot={id:string;status:string;updatedAt:string};
type Receipt={fingerprint:string;record:SessionAdjustmentRecord;sessions:Snapshot[];original?:SessionAdjustmentHistoryRecord};
const legacyId=(id:string,updatedAt:Date)=>`steam-session:${id}:${updatedAt.getTime()}`;

/** Private manager projection; no legacy balance is invented when it was never recorded. */
export async function steamSessionAdjustmentRecords(tx:Prisma.TransactionClient,storeId:string,walletId:string,customerId:string,customerName:string){
 const [commands,sessions]=await Promise.all([
  tx.auditLog.findMany({where:{storeId,targetType:'CustomerPlanWallet',targetId:walletId,action:'PLAN_SESSION_ADJUSTMENT'},orderBy:[{createdAt:'desc'},{id:'desc'}],select:{afterJson:true}}),
  tx.walletSession.findMany({where:{walletId},include:{voidedByStaff:{select:{displayName:true}}},orderBy:{sessionNo:'asc'}}),
 ]);
 const receipts=commands.map(row=>row.afterJson as unknown as Receipt).filter(row=>row?.record?.customerId===customerId);
 const covered=new Set(receipts.flatMap(row=>(row.sessions??[]).map(s=>`${s.id}:${s.updatedAt}`)));
 const records:SessionAdjustmentHistoryRecord[]=receipts.flatMap(row=>[row.record,...(row.original?[row.original]:[])]);
 for(const session of sessions){
  if(session.bookingId||!['BACKFILLED','VOIDED'].includes(session.status)||covered.has(`${session.id}:${session.updatedAt.toISOString()}`))continue;
  records.push({id:legacyId(session.id,session.updatedAt),cardId:walletId,customerId,customerName,operation:session.status==='BACKFILLED'?'BACKFILL':'VOID',quantity:1,occurredOn:session.status==='BACKFILLED'&&session.completedAt?toLocalDateStr(session.completedAt):null,reason:session.voidReason??'',recordedAt:(session.voidedAt??session.updatedAt).toISOString(),actorName:session.voidedByStaff?.displayName??'未記錄',reversalOf:null});
 }
 const corrections=sessions.length?await tx.auditLog.findMany({where:{storeId,targetType:'WalletSession',targetId:{in:sessions.map(s=>s.id)},action:'WALLET_SESSION_CORRECTION'},select:{id:true,beforeJson:true,afterJson:true},orderBy:{createdAt:'desc'}}):[];
 for(const row of corrections){
  const before=row.beforeJson as {id?:string;updatedAt?:string;status?:string;completedAt?:string;voidedAt?:string;voidReason?:string;voidedByStaff?:{displayName?:string}}|null;
  const after=row.afterJson as {record?:{correctedAt:string;actorName:string;reason:string;remainingAfter:number;originalOperatorName?:string}}|null;
  if(!before?.id||!before.updatedAt||!['BACKFILLED','VOIDED'].includes(before.status??'')||!after?.record)continue;
  const original=legacyId(before.id,new Date(before.updatedAt)),r=after.record;
  records.push({id:original,cardId:walletId,customerId,customerName,operation:before.status==='BACKFILLED'?'BACKFILL':'VOID',quantity:1,occurredOn:before.completedAt?toLocalDateStr(new Date(before.completedAt)):null,recordedAt:before.voidedAt??before.updatedAt,actorName:r.originalOperatorName??'未記錄',reason:before.voidReason??'',reversalOf:null});
  records.push({id:row.id,cardId:walletId,customerId,customerName,operation:'REVERSE',quantity:1,occurredOn:null,recordedAt:r.correctedAt,actorName:r.actorName,reason:r.reason,reversalOf:original,remainingAfter:r.remainingAfter});
 }
 return [...new Map(records.map(record=>[record.id,record])).values()].sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt)||b.id.localeCompare(a.id));
}

/** Caller holds the Store lock in a serializable transaction. Slot locks also
 * serialize against legacy reservations, backfills and per-slot corrections. */
export async function adjustSteamSessions(tx:Prisma.TransactionClient,a:Actor,d:SessionAdjustmentInput,customerName:string){
 if(d.expectedStoreId!==a.storeId)throw new AppError('CONFLICT','門市已切換，請重新開啟方案');
 const id='plan-session-adjustment:'+createHash('sha256').update(JSON.stringify([a.storeId,d.requestKey])).digest('hex');
 const fingerprint=createHash('sha256').update(JSON.stringify([a.userId,d])).digest('hex');
 const previous=await tx.auditLog.findUnique({where:{id},select:{storeId:true,afterJson:true}});
 if(previous){const saved=previous.afterJson as unknown as Receipt;if(previous.storeId!==a.storeId||saved?.fingerprint!==fingerprint||!saved.record)throw new AppError('CONFLICT','操作識別碼已使用，請核對原請求');return {record:saved.record,remaining:saved.record.remainingAfter,expiresAt:d.expectedExpiresAt};}
 await tx.$queryRaw`SELECT id FROM "WalletSession" WHERE "walletId"=${d.cardId} ORDER BY id FOR UPDATE`;
 const wallet=await tx.customerPlanWallet.findFirst({where:{id:d.cardId,storeId:a.storeId,customerId:d.customerId}});
 if(!wallet)throw new AppError('FORBIDDEN','找不到本店顧客持有的方案');
 if(wallet.status==='CANCELLED'||wallet.remainingSessions!==d.expectedRemaining||(wallet.expiryDate?.toISOString()??null)!==d.expectedExpiresAt)throw new AppError('CONFLICT','方案額度、期限或狀態已更新，請重新核對');
 if(d.operation!=='REVERSE'&&wallet.status!=='ACTIVE')throw new AppError('BUSINESS_RULE','僅有效方案可補登或註銷部分額度');
 const slots=await tx.walletSession.findMany({where:{walletId:wallet.id},orderBy:{sessionNo:'asc'}});
 const available=slots.filter(s=>s.status==='AVAILABLE'),remainingSlots=slots.filter(s=>s.status==='AVAILABLE'||s.status==='RESERVED').length;
 if(remainingSlots!==wallet.remainingSessions)throw new AppError('CONFLICT','方案餘額與堂次狀態不一致，請重新核對');
 const history=await steamSessionAdjustmentRecords(tx,a.storeId,wallet.id,d.customerId,customerName);
 const original=d.operation==='REVERSE'?activeSessionAdjustments(history).find(r=>r.id===d.reversalOf):undefined;
 let selected=available.slice(0,d.quantity);
 if(d.operation==='REVERSE'){
  if(!original||original.customerId!==d.customerId||original.quantity!==d.quantity)throw new AppError('CONFLICT','原紀錄已更正或內容不符，請重新核對');
  const receipt=await tx.auditLog.findUnique({where:{id:original.id},select:{afterJson:true}});
  const old=receipt?.afterJson as unknown as Receipt|undefined;
  const snapshots=old?.sessions??slots.filter(s=>legacyId(s.id,s.updatedAt)===original.id).map(s=>({id:s.id,status:s.status,updatedAt:s.updatedAt.toISOString()}));
  selected=snapshots.map(snapshot=>slots.find(s=>s.id===snapshot.id&&!s.bookingId&&s.status===snapshot.status&&s.updatedAt.toISOString()===snapshot.updatedAt)).filter((s):s is typeof slots[number]=>!!s);
  if(selected.length!==d.quantity)throw new AppError('CONFLICT','原堂次已更新，不能重複返還');
 }else{
  if(selected.length!==d.quantity)throw new AppError('BUSINESS_RULE','可用額度不足，已預約占用的額度不能調整');
  if(d.operation==='BACKFILL'&&(d.occurredOn!<toLocalDateStr(wallet.startDate)||wallet.expiryDate&&d.occurredOn!>toLocalDateStr(wallet.expiryDate)))throw new AppError('VALIDATION','補登日期必須在方案有效期間內');
 }
 const stamp=new Date(),status=d.operation==='REVERSE'?'AVAILABLE':d.operation==='BACKFILL'?'BACKFILLED':'VOIDED';
 const changed=await tx.walletSession.updateMany({where:{walletId:wallet.id,OR:selected.map(s=>({id:s.id,status:s.status,updatedAt:s.updatedAt})),bookingId:null},data:{status,updatedAt:stamp,reservedAt:null,completedAt:d.operation==='BACKFILL'?parseTaiwanDateToDbDate(d.occurredOn!):null,voidedAt:d.operation==='VOID'?stamp:null,voidReason:d.operation==='REVERSE'?null:d.reason||null,voidedByStaffId:d.operation==='REVERSE'?null:a.staffId}});
 if(changed.count!==d.quantity)throw new AppError('CONFLICT','部分堂次已更新，本次調整未完成');
 await refreshWalletCounter(tx,wallet.id);
 const remaining=wallet.remainingSessions+(d.operation==='REVERSE'?d.quantity:-d.quantity);
 const updated=await tx.customerPlanWallet.findUniqueOrThrow({where:{id:wallet.id},select:{remainingSessions:true}});
 if(updated.remainingSessions!==remaining)throw new AppError('CONFLICT','方案額度已更新，請重新核對');
 const record:SessionAdjustmentRecord={id,cardId:wallet.id,customerId:d.customerId,customerName,operation:d.operation,quantity:d.quantity,occurredOn:d.operation==='BACKFILL'?d.occurredOn!:null,recordedAt:stamp.toISOString(),actorName:a.name,reason:d.reason,reversalOf:original?.id??null,remainingBefore:wallet.remainingSessions,remainingAfter:remaining};
 const after:Receipt={fingerprint,record,sessions:selected.map(s=>({id:s.id,status,updatedAt:stamp.toISOString()})),...(original?{original}:{})};
 await tx.auditLog.create({data:{id,storeId:a.storeId,actorUserId:a.userId,actorNameSnapshot:a.name,actorRoleSnapshot:a.role,module:'STEAMFOOT',source:'MANUAL',targetType:'CustomerPlanWallet',targetId:wallet.id,action:'PLAN_SESSION_ADJUSTMENT',summary:'補登／註銷／更正方案額度，保留原收款',beforeJson:{remaining:wallet.remainingSessions},afterJson:JSON.parse(JSON.stringify(after))}});
 return {record,remaining,expiresAt:wallet.expiryDate?.toISOString()??null};
}
