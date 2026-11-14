import 'server-only';
import type {Prisma} from '@prisma/client';
import {parseTaipeiDateTime,parseTaiwanDateToDbDate,toLocalDateStr} from '@/lib/date-utils';
import {AppError} from '@/lib/errors';
import {PENDING_STATUSES} from '@/lib/booking-constants';
import type {PlanManagementInput} from '@/lib/plan-management';
import {planManagementCommand,type PlanManagementActor} from './plan-management-command';

/** Lock the wallet and its session rows in the caller's transaction. */
export async function closeSteamWallet(tx:Prisma.TransactionClient,a:PlanManagementActor,d:PlanManagementInput,staffId:string|null){
 if(d.operation!=='close')throw new AppError('VALIDATION','期限請使用調整期限');
 await tx.$queryRaw`SELECT id FROM "CustomerPlanWallet" WHERE id=${d.cardId} AND "storeId"=${a.storeId} FOR UPDATE`;
 return planManagementCommand(tx,a,d,'CustomerPlanWallet','STEAM',async()=>{
  await tx.$queryRaw`SELECT id FROM "WalletSession" WHERE "walletId"=${d.cardId} ORDER BY id FOR UPDATE`;
  const wallet=await tx.customerPlanWallet.findFirst({where:{id:d.cardId,storeId:a.storeId}});
  if(!wallet)throw new AppError('NOT_FOUND','找不到本店方案');
  if(!['ACTIVE','EXPIRED'].includes(wallet.status)||wallet.remainingSessions!==d.expectedRemaining||(wallet.expiryDate?.toISOString()??null)!==d.expectedExpiresAt)throw new AppError('CONFLICT','方案額度、期限或狀態已更新，請重新開啟核對');
  const sessions=await tx.walletSession.groupBy({by:['status'],where:{walletId:wallet.id},_count:{_all:true}});
  const available=sessions.find(s=>s.status==='AVAILABLE')?._count._all??0;
  const reserved=sessions.find(s=>s.status==='RESERVED')?._count._all??0;
  const pending=await tx.booking.count({where:{storeId:a.storeId,customerPlanWalletId:wallet.id,isMakeup:false,bookingStatus:{in:[...PENDING_STATUSES]}}});
  if(reserved||pending)throw new AppError('BUSINESS_RULE','仍有預約占用，請先處理相關預約再註銷');
  if(available!==wallet.remainingSessions)throw new AppError('BUSINESS_RULE','方案餘額與堂數明細不一致，請先核對');
  const changed=await tx.walletSession.updateMany({where:{walletId:wallet.id,status:'AVAILABLE'},data:{status:'VOIDED',voidedAt:new Date(),voidReason:d.reason,voidedByStaffId:staffId}});
  if(changed.count!==available)throw new AppError('CONFLICT','堂數狀態已更新，尚未註銷');
  await tx.customerPlanWallet.update({where:{id:wallet.id},data:{remainingSessions:0,status:'CANCELLED'}});
  return {before:{remaining:wallet.remainingSessions,status:wallet.status,expiresAt:wallet.expiryDate?.toISOString()??null},result:{id:wallet.id,remaining:0,expiresAt:wallet.expiryDate?.toISOString()??null,closed:true}};
 });
}

/** Same command receipt as closing; changing expiry never adjusts quota or money. */
export async function manageSteamWallet(tx:Prisma.TransactionClient,a:PlanManagementActor,d:PlanManagementInput,staffId:string|null){
 if(d.operation==='close')return closeSteamWallet(tx,a,d,staffId);
 await tx.$queryRaw`SELECT id FROM "CustomerPlanWallet" WHERE id=${d.cardId} AND "storeId"=${a.storeId} FOR UPDATE`;
 return planManagementCommand(tx,a,d,'CustomerPlanWallet','STEAM',async()=>{
  const wallet=await tx.customerPlanWallet.findFirst({where:{id:d.cardId,storeId:a.storeId}});
  if(!wallet)throw new AppError('NOT_FOUND','找不到本店方案');
  if(!['ACTIVE','EXPIRED'].includes(wallet.status)||wallet.remainingSessions!==d.expectedRemaining||(wallet.expiryDate?.toISOString()??null)!==d.expectedExpiresAt)throw new AppError('CONFLICT','方案額度、期限或狀態已更新，請重新開啟核對');
  if(!wallet.expiryDate)throw new AppError('BUSINESS_RULE','此方案目前為無期限，暫不提供日期修改');
  if(!d.expiresDate||!parseTaipeiDateTime(d.expiresDate,'00:00')||d.expiresDate<toLocalDateStr())throw new AppError('VALIDATION','請填寫今天或之後的有效日期');
  if(d.expiresDate===toLocalDateStr(wallet.expiryDate))throw new AppError('VALIDATION','新的到期日與目前相同');
  const expiry=parseTaiwanDateToDbDate(d.expiresDate),bookingWhere={bookingStatus:{in:[...PENDING_STATUSES]},bookingDate:{gt:expiry}};
  const [direct,reserved]=await Promise.all([tx.booking.count({where:{storeId:a.storeId,customerPlanWalletId:wallet.id,isMakeup:false,...bookingWhere}}),tx.walletSession.count({where:{walletId:wallet.id,status:'RESERVED',booking:bookingWhere}})]);
  if(direct||reserved)throw new AppError('BUSINESS_RULE','新期限早於既有預約，請先調整相關預約');
  await tx.customerPlanWallet.update({where:{id:wallet.id},data:{expiryDate:expiry,status:'ACTIVE'}});
  return {before:{remaining:wallet.remainingSessions,status:wallet.status,expiresAt:wallet.expiryDate.toISOString()},result:{id:wallet.id,remaining:wallet.remainingSessions,expiresAt:expiry.toISOString(),closed:false}};
 });
}
