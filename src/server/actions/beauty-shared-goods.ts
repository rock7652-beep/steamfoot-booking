'use server';
import {z} from 'zod';
import {beautyManager,beautyTransaction,command} from '@/server/beauty/access';
import {requirePermission} from '@/lib/permissions';
import {requireStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {sharedGoodsSelection} from '@/lib/add-ons';
import {AppError,handleActionError} from '@/lib/errors';
import {lockBeautyGoodsSubject,readBeautyGoodsOrder,saveBeautyGoodsOrder,postBeautyGoodsReceipt} from '@/server/beauty/shared-goods';
import {revalidatePath} from 'next/cache';
const key=z.string().min(1).max(100),subject=z.object({storeId:key,bookingId:key,participantId:key});
export async function readBeautySharedGoods(input:unknown){try{
 const a=await beautyManager('booking.read');await requirePermission('transaction.read');await requireStoreFeature(a.storeId,FEATURES.TRANSACTION_MANAGEMENT);const d=subject.parse(input);if(d.storeId!==a.storeId)throw new AppError('FORBIDDEN','門市已切換');
 return {success:true as const,data:await beautyTransaction(a,async tx=>readBeautyGoodsOrder(tx,a,await lockBeautyGoodsSubject(tx,a,d.bookingId,d.participantId)))};
}catch(e){return handleActionError(e);}}
export async function mutateBeautySharedGoods(input:unknown){try{
 const d=subject.extend({operation:z.enum(['SAVE','COLLECT','REFUND']),requestKey:z.string().uuid(),revision:z.number().int().nonnegative(),catalogRevision:z.number().int().nonnegative().optional(),selections:sharedGoodsSelection.optional(),amount:z.number().int().positive().max(10000000).optional(),method:z.enum(['CASH','TRANSFER','CREDIT_CARD','OTHER']).optional(),originalId:key.optional()}).parse(input);
 const a=await beautyManager(d.operation==='SAVE'?'booking.update':d.operation==='COLLECT'?'transaction.create':'transaction.refund',true);await requirePermission('booking.read');await requirePermission('transaction.read');await requireStoreFeature(a.storeId,FEATURES.TRANSACTION_MANAGEMENT);if(d.storeId!==a.storeId)throw new AppError('FORBIDDEN','門市已切換');
 const data=await beautyTransaction(a,async tx=>{const p=await lockBeautyGoodsSubject(tx,a,d.bookingId,d.participantId);return command(tx,a,d.requestKey,{...d,commandType:'beauty-shared-goods'},async()=>{
  if(d.operation==='SAVE'){if(d.catalogRevision===undefined||!d.selections)throw new AppError('VALIDATION','缺少商品設定');return saveBeautyGoodsOrder(tx,a,p,{revision:d.revision,catalogRevision:d.catalogRevision,selections:d.selections});}
  if(!d.amount||!d.method||d.operation==='REFUND'&&!d.originalId||d.operation==='COLLECT'&&d.originalId)throw new AppError('VALIDATION','請核對收退款資料');
  return postBeautyGoodsReceipt(tx,a,p,{revision:d.revision,amount:d.amount,method:d.method==='TRANSFER'?'BANK_TRANSFER':d.method==='CREDIT_CARD'?'CARD':d.method,originalId:d.originalId});
 });});for(const path of ['/dashboard/beauty','/dashboard/revenue','/dashboard/store-revenue','/dashboard/cashbook'])revalidatePath(path);return {success:true as const,data};
}catch(e){return handleActionError(e);}}
