"use server";
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {beautyChargeDraft,validateBeautyCharge} from '@/lib/beauty/charge-editor';
import {prepareStoredChargeRuleUpdate} from '@/lib/beauty/charge-rule-storage';
import {key} from '@/lib/beauty/contracts';
import {beautyManager,beautyTransaction,command,audit} from '@/server/beauty/access';
import {beautyChargeEditingEnabled,readCatalogCharge} from '@/server/beauty/charge-runtime';
import {requirePermission} from '@/lib/permissions';
import {requireStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {AppError,handleActionError} from '@/lib/errors';
export async function saveBeautyCharge(input:unknown){
 try{
  const a=await beautyManager('plans.edit',true);await requirePermission('staff.view');await requireStoreFeature(a.storeId,FEATURES.PLAN_MANAGEMENT);await requireStoreFeature(a.storeId,FEATURES.STAFF_MANAGEMENT);
  if(!beautyChargeEditingEnabled(a.storeId))throw new AppError('FORBIDDEN','新版收費儲存尚未啟用');
  const d=z.object({draft:beautyChargeDraft,expectedRevision:z.number().int().nonnegative(),planId:key.optional(),requestKey:z.string().uuid()}).strict().parse(input);
  if(d.draft.expectedStoreId!==a.storeId)throw new AppError('FORBIDDEN','門市已切換，請重新開啟');
  const result=await beautyTransaction(a,tx=>command(tx,a,d.requestKey,d,async()=>{
   const services=await tx.beautyService.findMany({where:{storeId:a.storeId}}),technicians=await tx.beautyTechnician.findMany({where:{storeId:a.storeId}});
   const {draft}=validateBeautyCharge(d.draft,a.storeId,services,technicians);
   if(draft.kind==='single'&&d.planId)throw new AppError('VALIDATION','單次收費不能指定多次方案');
   const source=draft.kind==='single'?await readCatalogCharge(tx,a.storeId,'single',draft.serviceId):d.planId?await readCatalogCharge(tx,a.storeId,'plan',d.planId):null;
   if(source&&source.row.revision!==d.expectedRevision)throw new AppError('CONFLICT','收費方式已更新，請重新核對');
   if(!source&&d.expectedRevision!==0)throw new AppError('CONFLICT','新增方案版本不正確');
   // A new plan uses a preallocated ID; existing multi-service plans cannot be silently narrowed.
   const id=draft.kind==='single'?draft.serviceId:d.planId??crypto.randomUUID();
   const owner=source?.owner??{storeId:a.storeId,chargeId:`plan:${id}`,revision:0,serviceIds:[draft.serviceId]};
   const patch=prepareStoredChargeRuleUpdate({...owner,mode:'SELECTED',technicianIds:draft.technicianIds},owner,a.storeId,technicians);
   if(owner.serviceIds.length!==1||owner.serviceIds[0]!==draft.serviceId)throw new AppError('VALIDATION','既有多服務方案請保留原適用範圍');
   const json=JSON.stringify(patch.chargeTechnicianRule);
   if(draft.kind==='single'){
    const count=await tx.$executeRaw`UPDATE "BeautyService" SET "singleChargeName"=${draft.name},price=${draft.price},"trialPrice"=${draft.trialPrice},"trialDuration"=${draft.trialMinutes},"singlePriceConfigured"=true,"chargeTechnicianRule"=${json}::jsonb,revision=${patch.revision} WHERE "storeId"=${a.storeId} AND id=${id} AND revision=${d.expectedRevision}`;
    if(count!==1)throw new AppError('CONFLICT','服務收費版本已更新');
   }else{
    if(!d.planId)await tx.beautyPlan.create({data:{id,storeId:a.storeId,name:draft.name,sessions:draft.sessions,price:draft.price,validDays:draft.validDays,serviceIds:[draft.serviceId],allowShared:draft.allowShared,active:true}});
    const count=await tx.$executeRaw`UPDATE "BeautyPlan" SET name=${draft.name},sessions=${draft.sessions},price=${draft.price},"validDays"=${draft.validDays},"allowShared"=${draft.allowShared},"chargeTechnicianRule"=${json}::jsonb,revision=${patch.revision} WHERE "storeId"=${a.storeId} AND id=${id} AND revision=${d.expectedRevision}`;
    if(count!==1)throw new AppError('CONFLICT','方案收費版本已更新');
   }
   await audit(tx,a,'CHARGE_SETTING',JSON.stringify({id,kind:draft.kind,revision:patch.revision,storeCost:draft.storeCost??null}));
   return {id,kind:draft.kind,revision:patch.revision};
  }));
  let syncWarning=false;try{revalidatePath('/dashboard/beauty');}catch{syncWarning=true;}
  return {success:true as const,data:result,syncWarning};
 }catch(error){const result=handleActionError(error);return {success:false as const,error:result.success?'收費方式尚未儲存':result.error};}
}
