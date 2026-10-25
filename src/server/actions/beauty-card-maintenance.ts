"use server";
import {beautyManager,beautyTransaction,command,audit} from '@/server/beauty/access';
import {beautyCardMaintenanceInput,maintenanceExpiry,assertCardMaintenanceReservations} from '@/lib/beauty/card-maintenance';
import {requirePermission} from '@/lib/permissions';
import {requireStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {beautyPrisma} from '@/lib/beauty-db';
import {prisma} from '@/lib/db';
import {requireSession} from '@/lib/session';
import {getManagerCustomerWhere} from '@/lib/manager-visibility';
import {AppError,handleActionError} from '@/lib/errors';
import {revalidatePath} from 'next/cache';
export async function maintainBeautyCustomerCard(input:unknown){
 try{
  const d=beautyCardMaintenanceInput.parse(input),a=await beautyManager('wallet.adjust',true);
  if(a.storeId!==d.expectedStoreId)throw new AppError('FORBIDDEN','門市已切換，請重新開啟');
  await requirePermission('wallet.read');await requirePermission('customer.read');
  await requireStoreFeature(a.storeId,FEATURES.PLAN_MANAGEMENT);await requireStoreFeature(a.storeId,FEATURES.CUSTOMER_MANAGEMENT);
  const user=await requireSession();
  const candidate=await beautyPrisma.beautyCard.findFirst({where:{id:d.cardId,storeId:a.storeId},select:{memberIds:true}});
  if(!candidate)throw new AppError('NOT_FOUND','找不到本店方案');
  const visible=await prisma.customer.findMany({where:{...getManagerCustomerWhere(user.role,user.staffId,a.storeId),storeId:a.storeId,mergedIntoCustomerId:null,id:{in:candidate.memberIds}},select:{id:true}});
  const result=await beautyTransaction(a,tx=>command(tx,a,d.requestKey,d,async()=>{
   const card=await tx.beautyCard.findFirst({where:{id:d.cardId,storeId:a.storeId,memberIds:{hasSome:visible.map(p=>p.id)}}});
   if(!card)throw new AppError('NOT_FOUND','找不到可管理的本店方案');
   if(card.closedAt||card.remaining!==d.expectedRemaining||card.expiresAt.toISOString()!==d.expectedExpiresAt)throw new AppError('CONFLICT','方案狀態已更新，請重新核對');
   const expiresAt=d.action==='expiry'?maintenanceExpiry(d.expiresDate??''):card.expiresAt;
   const reservations=await tx.beautyAppointment.findMany({where:{storeId:a.storeId,cardId:card.id,status:'RESERVED'},select:{startsAt:true}});
   assertCardMaintenanceReservations(d.action,expiresAt,reservations);
   await tx.beautyCard.update({where:{id:card.id},data:d.action==='close'?{closedAt:new Date()}:{expiresAt}});
   await audit(tx,a,d.action==='close'?'CARD_CLOSED':'CARD_EXPIRY_CHANGED',JSON.stringify({cardId:card.id,reason:d.reason,before:{expiresAt:card.expiresAt.toISOString(),closedAt:null,remaining:card.remaining},after:{expiresAt:expiresAt.toISOString(),closed:d.action==='close',remaining:card.remaining}}));
   return {cardId:card.id};
  }));
  try{revalidatePath('/dashboard/beauty');}catch{/* Committed receipt remains authoritative. */}
  return {success:true as const,data:result};
 }catch(error){return handleActionError(error);}
}
