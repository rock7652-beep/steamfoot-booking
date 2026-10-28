'use server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getManagerCustomerWhere } from '@/lib/manager-visibility';
import { requireSession } from '@/lib/session';
import { requireStoreFeature } from '@/lib/feature-gate';
import { FEATURES } from '@/lib/feature-flags';
import { AppError,handleActionError } from '@/lib/errors';
import { calculateCourseCheckout } from '@/lib/course-checkout';
import { beautyManager,beautyTransaction } from '@/server/beauty/access';
import { beautyNativePlanCheckoutSchema,beautyPlanPurchaseIntentsEnabled } from '@/server/beauty/plan-checkout-input';
import { acknowledgeBeautyPlanIntent,beautyPlanIntentFingerprint,cancelBeautyPlanIntent,prepareBeautyPlanIntent,readBeautyPlanIntent } from '@/server/beauty/purchase-intent';

const id=z.string().min(1).max(180);
const lookup=z.object({customerId:id,expectedStoreId:id,requestKey:z.string().uuid().optional()});
async function authorized(input:{customerId:string;expectedStoreId:string},write:boolean){
  if(process.env.BEAUTY_PLAN_PURCHASE_INTENTS_ENABLED!=='1')throw new AppError('FORBIDDEN','購買核對功能尚未開放');
  const [actor,finance,customerActor,user]=await Promise.all([
    beautyManager('wallet.create',write),beautyManager('transaction.create',write),
    beautyManager('customer.read'),requireSession(),
  ]);
  if(actor.storeId!==input.expectedStoreId||finance.storeId!==actor.storeId||customerActor.storeId!==actor.storeId||finance.userId!==actor.userId||customerActor.userId!==actor.userId||user.id!==actor.userId)
    throw new AppError('FORBIDDEN','目前門市或身分不一致，請重新開啟');
  if(!beautyPlanPurchaseIntentsEnabled(actor.storeId))throw new AppError('FORBIDDEN','購買核對功能尚未開放');
  await Promise.all([requireStoreFeature(actor.storeId,FEATURES.PLAN_MANAGEMENT),requireStoreFeature(actor.storeId,FEATURES.CUSTOMER_MANAGEMENT)]);
  const customer=await prisma.customer.findFirst({where:{...getManagerCustomerWhere(user.role,user.staffId,actor.storeId),storeId:actor.storeId,id:input.customerId,mergedIntoCustomerId:null},select:{id:true}});
  if(!customer)throw new AppError('NOT_FOUND','找不到本店可查看的顧客');
  return actor;
}
async function result<T>(work:()=>Promise<T>){try{return {success:true as const,data:await work()};}catch(error){return handleActionError(error);}}

export async function prepareBeautyPlanPurchaseIntent(input:unknown){
  return result(async()=>{
    const d=beautyNativePlanCheckoutSchema.parse(input),actor=await authorized(d,true);
    if(d.revenueStaffId||d.expectedStoreCost||d.musicPurchaseTerms||d.musicValidityDays||d.musicManualBonus||d.musicJoinSessionId)throw new AppError('VALIDATION','此服務方案不使用課程期數或成本欄位');
    if(d.discountValue)await beautyManager('wallet.adjust',true);
    if(d.paymentMethod==='BANK_TRANSFER'&&!/^\d{4}$/.test(d.transferLastFour))throw new AppError('VALIDATION','請填寫轉帳末四碼');
    calculateCourseCheckout(d.expectedListPrice,d.discountKind,d.discountValue);
    const fingerprint=beautyPlanIntentFingerprint(d);
    return beautyTransaction(actor,tx=>prepareBeautyPlanIntent(tx,actor,{customerId:d.customerId,requestKey:d.requestKey,fingerprint}));
  });
}

export async function readBeautyPlanPurchaseIntent(input:unknown){
  return result(async()=>{const d=lookup.parse(input),actor=await authorized(d,false);return beautyTransaction(actor,tx=>readBeautyPlanIntent(tx,actor,d));});
}
export async function cancelBeautyPlanPurchaseIntent(input:unknown){
  return result(async()=>{const d=lookup.extend({requestKey:z.string().uuid()}).parse(input),actor=await authorized(d,true);return beautyTransaction(actor,tx=>cancelBeautyPlanIntent(tx,actor,d));});
}
export async function acknowledgeBeautyPlanPurchaseIntent(input:unknown){
  return result(async()=>{
    const d=lookup.extend({requestKey:z.string().uuid(),purchaseId:id}).parse(input),actor=await authorized(d,true);
    return beautyTransaction(actor,async tx=>{
      const [card,payment]=await Promise.all([
        tx.beautyCard.findFirst({where:{storeId:actor.storeId,id:d.purchaseId,customerId:d.customerId},select:{id:true}}),
        tx.beautyPayment.findFirst({where:{storeId:actor.storeId,cardId:d.purchaseId,kind:'SALE'},select:{id:true}}),
      ]);
      if(!card||!payment)throw new AppError('CONFLICT','購買紀錄尚未完整，請聯絡管理員核對');
      return acknowledgeBeautyPlanIntent(tx,actor,d);
    });
  });
}
