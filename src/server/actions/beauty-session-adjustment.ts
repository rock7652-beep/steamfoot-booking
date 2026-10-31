'use server';
import {revalidatePath} from 'next/cache';
import {beautyManager,beautyTransaction} from '@/server/beauty/access';
import {adjustBeautySessions} from '@/server/beauty/session-adjustment';
import {sessionAdjustmentInput,type SessionAdjustmentResult} from '@/lib/plan-session-adjustment';
import {prisma} from '@/lib/db';
import {requireSession} from '@/lib/session';
import {getManagerCustomerWhere} from '@/lib/manager-visibility';
import {requireStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {AppError,handleActionError} from '@/lib/errors';
import {settingsSaveUncertain} from '@/server/services/settings-save-error';

export async function saveBeautySessionAdjustment(input:unknown):Promise<SessionAdjustmentResult>{
  let committed=false;
  try{
    const d=sessionAdjustmentInput.parse(input),a=await beautyManager('wallet.adjust',true);
    if(d.expectedStoreId!==a.storeId)throw new AppError('CONFLICT','門市已切換，請重新開啟方案');
    await beautyManager('customer.read');await beautyManager('wallet.read');
    await requireStoreFeature(a.storeId,FEATURES.PLAN_MANAGEMENT);await requireStoreFeature(a.storeId,FEATURES.CUSTOMER_MANAGEMENT);
    const user=await requireSession();
    const result=await beautyTransaction(a,async tx=>{
      const card=await tx.beautyCard.findFirst({where:{id:d.cardId,storeId:a.storeId},select:{customerId:true,memberIds:true}});
      if(!card||!card.memberIds.includes(d.customerId))throw new AppError('FORBIDDEN','找不到本店顧客持有的方案');
      const ids=[...new Set([card.customerId,...card.memberIds])];
      const people=await prisma.customer.findMany({where:{...getManagerCustomerWhere(user.role,user.staffId,a.storeId),storeId:a.storeId,id:{in:ids},mergedIntoCustomerId:null},select:{id:true,name:true}});
      if(people.length!==ids.length)throw new AppError('FORBIDDEN','僅能調整有權管理之顧客的方案');
      return adjustBeautySessions(tx,a,d,people.find(p=>p.id===d.customerId)!.name);
    });committed=true;
    let syncWarning=false;try{revalidatePath('/dashboard/beauty');revalidatePath('/beauty');}catch{syncWarning=true;}
    return {success:true,data:result,syncWarning};
  }catch(error){const r=handleActionError(error);return {success:false,error:r.success?'調整結果尚未確認':r.error,uncertain:committed||settingsSaveUncertain(error)};}
}
