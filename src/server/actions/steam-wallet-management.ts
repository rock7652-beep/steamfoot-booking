'use server';
import {revalidatePath} from 'next/cache';
import {requireWritablePermission,requirePermission} from '@/lib/permissions';
import {resolveWriteStoreId} from '@/lib/store';
import {requireSteamfootStore} from '@/lib/industry-module-server';
import {getManagerCustomerWhere} from '@/lib/manager-visibility';
import {prisma} from '@/lib/db';
import {AppError,handleActionError} from '@/lib/errors';
import {planManagementInput,type PlanManagementResult} from '@/lib/plan-management';
import {closeSteamWallet} from '@/server/services/steam-wallet-management';
import {settingsSaveUncertain} from '@/server/services/settings-save-error';

export async function closeSteamPlan(input:unknown):Promise<PlanManagementResult>{
 let committed=false;
 try{
  const d=planManagementInput.parse(input),user=await requireWritablePermission('wallet.adjust');
  await requirePermission('customer.read');await requirePermission('wallet.read');
  const storeId=await resolveWriteStoreId(user);
  if(storeId!==d.expectedStoreId)throw new AppError('CONFLICT','門市已切換，請重新開啟方案');
  await requireSteamfootStore(storeId);
  const result=await prisma.$transaction(async tx=>{
   const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "Store" WHERE id=${storeId} AND "industryModule"::text='STEAMFOOT' AND "operatingStatus"::text IN ('ACTIVE','TRIAL') FOR UPDATE`;
   if(rows.length!==1)throw new AppError('FORBIDDEN','店家已停用或模組已變更');
   const wallet=await tx.customerPlanWallet.findFirst({where:{id:d.cardId,storeId},select:{customerId:true}});
   if(!wallet||!await tx.customer.findFirst({where:{...getManagerCustomerWhere(user.role,user.staffId,storeId),id:wallet.customerId,storeId,mergedIntoCustomerId:null},select:{id:true}}))throw new AppError('FORBIDDEN','僅能調整有權管理之顧客的方案');
   return closeSteamWallet(tx,{storeId,userId:user.id,name:user.name??undefined,role:user.role},d,user.staffId??null);
  });committed=true;
  let syncWarning=false;try{revalidatePath('/dashboard/customers');revalidatePath('/my-plans');revalidatePath('/book');revalidatePath('/liff/wallets');}catch{syncWarning=true;}
  return {success:true,data:result,syncWarning};
 }catch(error){const r=handleActionError(error);return {success:false,error:r.success?'方案尚未確認':r.error,uncertain:committed||settingsSaveUncertain(error)};}
}
