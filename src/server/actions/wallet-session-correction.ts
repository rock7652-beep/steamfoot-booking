'use server';
import {Prisma} from '@prisma/client';
import {revalidatePath} from 'next/cache';
import {requireWritablePermission,requirePermission} from '@/lib/permissions';
import {resolveWriteStoreId} from '@/lib/store';
import {requireSteamfootStore} from '@/lib/industry-module-server';
import {getManagerCustomerWhere} from '@/lib/manager-visibility';
import {prisma} from '@/lib/db';
import {AppError,handleActionError} from '@/lib/errors';
import {walletSessionCorrectionInput,type WalletSessionCorrectionResult} from '@/lib/wallet-session-correction';
import {correctWalletSession} from '@/server/services/wallet-session-correction';
import {settingsSaveUncertain} from '@/server/services/settings-save-error';

export async function correctSteamWalletSession(input:unknown):Promise<WalletSessionCorrectionResult>{
  let committed=false;
  try{
    const d=walletSessionCorrectionInput.parse(input),user=await requireWritablePermission('wallet.adjust');
    await requirePermission('customer.read');await requirePermission('wallet.read');
    const storeId=await resolveWriteStoreId(user);
    if(storeId!==d.expectedStoreId)throw new AppError('CONFLICT','門市已切換，請重新開啟方案');
    await requireSteamfootStore(storeId);
    const result=await prisma.$transaction(async tx=>{
      const stores=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "Store" WHERE id=${storeId} AND "industryModule"::text='STEAMFOOT' AND "operatingStatus"::text IN ('ACTIVE','TRIAL') FOR UPDATE`;
      if(stores.length!==1)throw new AppError('FORBIDDEN','店家已停用或模組已變更');
      const customer=await tx.customer.findFirst({where:{...getManagerCustomerWhere(user.role,user.staffId??null,storeId),id:d.customerId,storeId,mergedIntoCustomerId:null,user:{isNot:{status:'SUSPENDED'}}},select:{id:true}});
      if(!customer)throw new AppError('FORBIDDEN','僅能更正有權管理之顧客的方案');
      return correctWalletSession(tx,{storeId,userId:user.id,name:user.name??'管理人員',role:user.role},d);
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});committed=true;
    let syncWarning=false;
    try{for(const path of ['/dashboard/customers',`/dashboard/customers/${d.customerId}`,'/my-plans','/book','/liff/wallets'])revalidatePath(path);}catch{syncWarning=true;}
    return {success:true,data:result,syncWarning};
  }catch(error){const r=handleActionError(error);return {success:false,error:r.success?'更正結果尚未確認':r.error,uncertain:committed||settingsSaveUncertain(error)};}
}
