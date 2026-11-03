"use server";
import {revalidatePath} from 'next/cache';
import {courseServicePriceInput,savedCourseServicePrice} from '@/lib/course-service-price';
import {beautyManager,beautyTransaction,command} from '@/server/beauty/access';
import {persistBeautyCatalog} from '@/server/beauty/catalog';
import {requireStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {AppError,handleActionError} from '@/lib/errors';
import {settingsSaveUncertain} from '@/server/services/settings-save-error';
export async function saveBeautyServicePrice(input:unknown){
 try{
  const a=await beautyManager('plans.edit',true);
  await requireStoreFeature(a.storeId,FEATURES.PLAN_MANAGEMENT);
  const d=courseServicePriceInput.parse(input);
  if(d.expectedStoreId!==a.storeId)throw new AppError('CONFLICT','門市已切換，請重新開啟收費方式');
  const receipt=await beautyTransaction(a,tx=>command(tx,a,d.requestKey,{operation:'service-price',...d},async()=>{
   const prior=await tx.beautyService.findFirst({where:{storeId:a.storeId,id:d.id,revision:d.revision}});
   if(!prior)throw new AppError('CONFLICT','服務價格已更新，請重新開啟');
   const saved=await persistBeautyCatalog(tx,a,'service',{id:prior.id,revision:prior.revision,name:prior.name,category:prior.category,duration:prior.duration,buffer:prior.buffer,active:prior.active,price:d.price,trialPrice:d.trialPrice,trialDuration:d.trialDuration});
   return savedCourseServicePrice.parse(saved.record);
  }));
  let syncWarning=false;try{revalidatePath('/dashboard/beauty');}catch{syncWarning=true;}
  return {success:true as const,storeId:a.storeId,data:receipt,syncWarning};
 }catch(error){const r=handleActionError(error);return {success:false as const,error:r.success?'服務價格尚未儲存':r.error,uncertain:settingsSaveUncertain(error)};}
}
