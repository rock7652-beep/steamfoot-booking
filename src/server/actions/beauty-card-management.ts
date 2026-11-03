"use server";
import {beautyManager,beautyTransaction} from '@/server/beauty/access';
import {beautyCardManagementInput,manageBeautyCard} from '@/server/beauty/card-management';
import {prisma} from '@/lib/db';
import {requireSession} from '@/lib/session';
import {getManagerCustomerWhere} from '@/lib/manager-visibility';
import {requireStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {AppError,handleActionError} from '@/lib/errors';
import {settingsSaveUncertain} from '@/server/services/settings-save-error';
import {revalidatePath} from 'next/cache';
export async function saveBeautyCardManagement(input:unknown){
 let committed=false;
 try{
  const d=beautyCardManagementInput.parse(input),a=await beautyManager('wallet.adjust',true);
  if(d.expectedStoreId!==a.storeId)throw new AppError('CONFLICT','門市已切換，請重新開啟方案');
  await beautyManager('customer.read');await requireStoreFeature(a.storeId,FEATURES.PLAN_MANAGEMENT);await requireStoreFeature(a.storeId,FEATURES.CUSTOMER_MANAGEMENT);
  const user=await requireSession();
  const result=await beautyTransaction(a,async tx=>{
   const card=await tx.beautyCard.findFirst({where:{id:d.cardId,storeId:a.storeId},select:{customerId:true}});
   if(!card||!await prisma.customer.findFirst({where:{...getManagerCustomerWhere(user.role,user.staffId,a.storeId),storeId:a.storeId,id:card.customerId,mergedIntoCustomerId:null},select:{id:true}}))throw new AppError('FORBIDDEN','僅能調整有權管理之原持有人的方案');
   return manageBeautyCard(tx,a,d);
  });committed=true;
  let syncWarning=false;try{revalidatePath('/dashboard/beauty');revalidatePath('/beauty');}catch{syncWarning=true;}
  return {success:true as const,data:result,syncWarning};
 }catch(error){const r=handleActionError(error);return {success:false as const,error:r.success?'方案尚未確認':r.error,uncertain:committed||settingsSaveUncertain(error)};}
}
