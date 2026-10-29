'use server';
import { z } from 'zod';
import { AppError,handleActionError } from '@/lib/errors';
import { requireStoreFeature } from '@/lib/feature-gate';
import { FEATURES } from '@/lib/feature-flags';
import { key,money } from '@/lib/beauty/contracts';
import { beautyMember,beautyTransaction } from '@/server/beauty/access';
import { acknowledgeBeautyMemberIntent,beautyMemberPurchaseFingerprint,beautyMemberPurchaseIntentsEnabled,cancelBeautyMemberIntent,prepareBeautyMemberIntent,readBeautyMemberIntent } from '@/server/beauty/member-purchase-intent';

const scope=z.object({expectedStoreId:key,requestKey:z.string().uuid().optional()});
async function actorFor(expectedStoreId:string,write:boolean){
  if(process.env.BEAUTY_MEMBER_PURCHASE_INTENTS_ENABLED!=='1')throw new AppError('FORBIDDEN','購買核對功能尚未開放');
  const actor=await beautyMember(write);
  if(actor.storeId!==expectedStoreId||!actor.customerId||!actor.userId)throw new AppError('FORBIDDEN','會員或門市已變更，請重新開啟');
  if(!beautyMemberPurchaseIntentsEnabled(actor.storeId))throw new AppError('FORBIDDEN','購買核對功能尚未開放');
  await requireStoreFeature(actor.storeId,FEATURES.PLAN_MANAGEMENT);
  return actor;
}
async function result<T>(work:()=>Promise<T>){try{return {success:true as const,data:await work()};}catch(error){return handleActionError(error);}}
export async function prepareBeautyMemberPurchaseIntent(input:unknown){
  return result(async()=>{
    const d=scope.extend({requestKey:z.string().uuid(),planId:key,lastFour:z.string().regex(/^\d{4}$/, '請填轉帳後四碼'),expectedName:z.string().trim().min(1).max(100),expectedPrice:money,expectedSessions:z.number().int().min(1).max(10000),expectedRevision:z.number().int().nonnegative()}).parse(input),a=await actorFor(d.expectedStoreId,true);
    return beautyTransaction(a,tx=>prepareBeautyMemberIntent(tx,a,{requestKey:d.requestKey,fingerprint:beautyMemberPurchaseFingerprint(d)}));
  });
}
export async function readBeautyMemberPurchaseIntent(input:unknown){
  return result(async()=>{const d=scope.parse(input),a=await actorFor(d.expectedStoreId,false);return beautyTransaction(a,tx=>readBeautyMemberIntent(tx,a,d));});
}
export async function cancelBeautyMemberPurchaseIntent(input:unknown){
  return result(async()=>{const d=scope.extend({requestKey:z.string().uuid()}).parse(input),a=await actorFor(d.expectedStoreId,true);return beautyTransaction(a,tx=>cancelBeautyMemberIntent(tx,a,d));});
}
export async function acknowledgeBeautyMemberPurchaseIntent(input:unknown){
  return result(async()=>{
    const d=scope.extend({requestKey:z.string().uuid(),purchaseId:key}).parse(input),a=await actorFor(d.expectedStoreId,true);
    return beautyTransaction(a,async tx=>{
      const order=await tx.beautyPurchase.findFirst({where:{id:d.purchaseId,storeId:a.storeId,customerId:a.customerId},select:{id:true}});
      if(!order)throw new AppError('CONFLICT','購買申請尚未完整，請聯絡店家核對');
      return acknowledgeBeautyMemberIntent(tx,a,d);
    });
  });
}
