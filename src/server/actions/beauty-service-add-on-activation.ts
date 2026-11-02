'use server';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {FEATURES} from '@/lib/feature-flags';
import {resolveEffectiveEntitlement} from '@/lib/effective-entitlement';
import {beautyManager,beautyTransaction,audit} from '@/server/beauty/access';
import {settings} from '@/server/beauty/booking';
import {AppError,handleActionError} from '@/lib/errors';
export async function saveBeautyServiceAddOnActivation(input:unknown){try{
 const a=await beautyManager('add_ons.manage',true),d=z.object({storeId:z.string(),revision:z.number().int().nonnegative(),enabled:z.boolean()}).parse(input);
 if(d.storeId!==a.storeId)throw new AppError('FORBIDDEN','門市已切換');
 const result=await beautyTransaction(a,async tx=>{
  const [grant]=await tx.$queryRaw<{status:'ENABLED'|'DISABLED'|'HIDDEN'|'LOCKED';startsAt:Date|null;expiresAt:Date|null}[]>`SELECT status,"startsAt","expiresAt" FROM "StoreFeatureEntitlement" WHERE "storeId"=${a.storeId} AND "featureKey"=${FEATURES.BEAUTY_SERVICE_ADD_ONS}`;
  if(!resolveEffectiveEntitlement(false,grant??null).enabled)throw new AppError('FORBIDDEN','加做服務尚未開通');
  const before=await settings(tx,a.storeId);if(before.revision!==d.revision)throw new AppError('CONFLICT','設定已更新，請重新整理');
  const saved=await tx.beautySetting.upsert({where:{storeId:a.storeId},create:{...before,serviceAddOnsEnabled:d.enabled,revision:1},update:{serviceAddOnsEnabled:d.enabled,revision:{increment:1}}});
  await audit(tx,a,'SERVICE_ADD_ONS_ENABLED',JSON.stringify({before:before.serviceAddOnsEnabled,after:d.enabled}));return {enabled:saved.serviceAddOnsEnabled,revision:saved.revision};
 });revalidatePath('/dashboard/beauty');return {success:true as const,data:result};
}catch(e){return handleActionError(e);}}
