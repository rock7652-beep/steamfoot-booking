import {createHash} from 'node:crypto';
import type {Prisma} from '@prisma/client';
import {AppError} from '@/lib/errors';
import type {WalletSessionCorrectionInput,WalletSessionCorrectionRecord} from '@/lib/wallet-session-correction';
import {refreshWalletCounter} from './wallet-session';

/** Caller authorizes the customer and uses a serializable transaction. No financial writes. */
export async function correctWalletSession(tx:Prisma.TransactionClient,actor:{storeId:string;userId:string;name:string;role:string},d:WalletSessionCorrectionInput){
  if(actor.storeId!==d.expectedStoreId)throw new AppError('CONFLICT','門市已切換，請重新開啟方案');
  const id='wallet-session-correction:'+createHash('sha256').update(JSON.stringify([actor.storeId,d.requestKey])).digest('hex');
  const fingerprint=createHash('sha256').update(JSON.stringify([actor.userId,d.customerId,d.walletId,d.sessionId,d.expectedStatus,d.expectedUpdatedAt,d.reason])).digest('hex');
  const receipt=await tx.auditLog.findUnique({where:{id},select:{storeId:true,afterJson:true}});
  if(receipt){
    const saved=receipt.afterJson as {fingerprint:string;record:WalletSessionCorrectionRecord}|null;
    if(receipt.storeId!==actor.storeId||saved?.fingerprint!==fingerprint||!saved.record)throw new AppError('CONFLICT','此請求已用於其他更正，請重新核對');
    return saved.record;
  }
  const wallet=await tx.customerPlanWallet.findFirst({where:{id:d.walletId,storeId:actor.storeId,customerId:d.customerId},select:{status:true}});
  if(!wallet)throw new AppError('NOT_FOUND','找不到本店顧客持有的方案');
  if(wallet.status==='CANCELLED')throw new AppError('BUSINESS_RULE','整份方案已註銷，不能以更正返還重新啟用');
  const session=await tx.walletSession.findFirst({where:{id:d.sessionId,walletId:d.walletId},include:{voidedByStaff:{select:{displayName:true}}}});
  if(!session||session.bookingId||!['BACKFILLED','VOIDED'].includes(session.status))throw new AppError('BUSINESS_RULE','僅能更正未綁定預約的補登或註銷紀錄');
  if(session.status!==d.expectedStatus||session.updatedAt.toISOString()!==d.expectedUpdatedAt)throw new AppError('CONFLICT','此堂紀錄已更新，請重新核對');
  const changed=await tx.walletSession.updateMany({where:{id:session.id,walletId:d.walletId,status:d.expectedStatus,updatedAt:new Date(d.expectedUpdatedAt),bookingId:null},data:{status:'AVAILABLE',reservedAt:null,completedAt:null,voidedAt:null,voidReason:null,voidedByStaffId:null}});
  if(changed.count!==1)throw new AppError('CONFLICT','此堂紀錄已更新，請重新核對');
  await refreshWalletCounter(tx,d.walletId);
  const updated=await tx.customerPlanWallet.findUniqueOrThrow({where:{id:d.walletId},select:{remainingSessions:true}});
  const record:WalletSessionCorrectionRecord={id,sessionId:session.id,sessionNo:session.sessionNo,walletId:d.walletId,originalStatus:d.expectedStatus,originalDate:(session.status==='BACKFILLED'?session.completedAt:session.voidedAt)?.toISOString()??null,originalReason:session.voidReason,originalOperatorStaffId:session.voidedByStaffId,originalOperatorName:session.voidedByStaff?.displayName??null,correctedAt:new Date().toISOString(),actorName:actor.name,reason:d.reason,remainingAfter:updated.remainingSessions};
  await tx.auditLog.create({data:{id,actorUserId:actor.userId,actorNameSnapshot:actor.name,actorRoleSnapshot:actor.role,storeId:actor.storeId,module:'STEAMFOOT',targetType:'WalletSession',targetId:session.id,action:'WALLET_SESSION_CORRECTION',summary:`更正第 ${session.sessionNo} 堂並返還 1 堂`,beforeJson:{...session,createdAt:session.createdAt.toISOString(),updatedAt:session.updatedAt.toISOString(),reservedAt:session.reservedAt?.toISOString()??null,completedAt:session.completedAt?.toISOString()??null,voidedAt:session.voidedAt?.toISOString()??null},afterJson:{fingerprint,record}}});
  return record;
}
