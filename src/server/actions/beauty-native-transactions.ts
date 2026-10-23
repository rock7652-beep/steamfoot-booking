"use server";
import {z} from 'zod';
import {beautyManager,beautyTransaction} from '@/server/beauty/access';
import {refund} from '@/server/beauty/commerce';
import {refundInput,key} from '@/lib/beauty/contracts';
import {AppError,handleActionError} from '@/lib/errors';
import {settingsSaveUncertain} from '@/server/services/settings-save-error';
import {confirmBeautyPurchase,confirmBeautySettlement} from './beauty';
import {revalidatePath} from 'next/cache';
import {requireStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
export async function refundBeautyNativeTransaction(input:unknown){
 try{
  const d=refundInput.omit({paymentId:true}).extend({purchaseId:key,expectedStoreId:key,expectedRemaining:z.number().int().nonnegative().nullable(),expectedRefundedAmount:z.number().int().nonnegative()}).parse(input);
  const a=await beautyManager('transaction.refund',true);await requireStoreFeature(a.storeId,FEATURES.TRANSACTION_MANAGEMENT);
  if(a.storeId!==d.expectedStoreId)throw new AppError('CONFLICT','目前門市已切換，請重新開啟退款');
  await beautyTransaction(a,async tx=>{
   const p=await tx.beautyPayment.findFirst({where:{id:d.purchaseId,storeId:a.storeId,kind:'SALE'},select:{cardId:true}});
   if(!p)throw new AppError('NOT_FOUND','找不到本店原收款');
   if(p.cardId){await beautyManager('wallet.read');await requireStoreFeature(a.storeId,FEATURES.PLAN_MANAGEMENT);}
   return refund(tx,a,refundInput.parse({...d,paymentId:d.purchaseId}),{remaining:d.expectedRemaining,refundedAmount:d.expectedRefundedAmount});
  });
  let syncWarning=false;try{revalidatePath('/dashboard/beauty');}catch{syncWarning=true;}return {success:true as const,syncWarning};
 }catch(error){const result=handleActionError(error);return {success:false as const,error:result.success?'退款尚未確認':result.error,uncertain:settingsSaveUncertain(error)};}
}
export async function confirmBeautyNativeTransaction(input:unknown){
 try{
  const d=z.object({purchaseId:key,expectedStoreId:key,requestKey:z.string().uuid()}).parse(input),a=await beautyManager('wallet.create',true);
  if(a.storeId!==d.expectedStoreId)throw new AppError('CONFLICT','目前門市已切換，請重新開啟核帳');
  return confirmBeautyPurchase({id:d.purchaseId,requestKey:d.requestKey});
 }catch(error){const result=handleActionError(error);return {success:false as const,error:result.success?'核帳尚未確認':result.error,uncertain:settingsSaveUncertain(error)};}
}

export async function confirmBeautyNativeSettlement(input:unknown){
 try{const d=z.object({month:z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),fingerprint:z.string().length(64),expectedStoreId:key,requestKey:z.string().uuid()}).parse(input),a=await beautyManager('teacher.settlement.confirm',true);if(a.storeId!==d.expectedStoreId)throw new AppError('CONFLICT','目前門市已切換，請重新開啟月結');return confirmBeautySettlement(d);}catch(error){const result=handleActionError(error);return {success:false as const,error:result.success?'月結尚未確認':result.error,uncertain:settingsSaveUncertain(error)};}
}

const correction=z.object({purchaseId:key,expectedStoreId:key,requestKey:z.string().uuid(),expectedRevision:z.number().int().nonnegative(),reason:z.string().trim().min(1).max(500)});
async function correct(input:unknown,operation:'edit'|'void'){
 try{
  const d=(operation==='edit'?correction.extend({note:z.string().trim().max(500),revenueStaffId:key.nullable()}):correction).parse(input);
  const a=await beautyManager(operation==='edit'?'transaction.create':'transaction.void',true);await requireStoreFeature(a.storeId,FEATURES.TRANSACTION_MANAGEMENT);
  if(a.storeId!==d.expectedStoreId)throw new AppError('CONFLICT','目前門市已切換，請重新開啟交易');
  await beautyTransaction(a,async tx=>{
   const sale=await tx.beautyPayment.findFirst({where:{storeId:a.storeId,id:d.purchaseId,kind:'SALE'},select:{cardId:true}});
   if(sale?.cardId){await beautyManager('wallet.read');await requireStoreFeature(a.storeId,FEATURES.PLAN_MANAGEMENT);}
   return (await import('@/server/beauty/transaction-correction')).correctBeautyTransaction(tx,a,{...d,operation});
  });
  let syncWarning=false;try{for(const path of ['/dashboard/beauty','/dashboard/store-revenue','/dashboard/coach-revenue','/dashboard/cashbook'])revalidatePath(path);}catch{syncWarning=true;}return {success:true as const,syncWarning};
 }catch(error){const result=handleActionError(error);return {success:false as const,error:result.success?'操作尚未確認':result.error,uncertain:settingsSaveUncertain(error)};}
}
export async function editBeautyNativeTransaction(input:unknown){return correct(input,'edit');}
export async function voidBeautyNativeTransaction(input:unknown){return correct(input,'void');}
