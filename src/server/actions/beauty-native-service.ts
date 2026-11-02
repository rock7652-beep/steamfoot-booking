"use server";
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {beautyManager,beautyTransaction,command} from '@/server/beauty/access';
import {persistBeautyCatalog} from '@/server/beauty/catalog';
import {AppError,handleActionError} from '@/lib/errors';
import {requirePermission} from '@/lib/permissions';
import {requireStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {key} from '@/lib/beauty/contracts';
import {beautyServiceIdentity} from '@/lib/beauty/service-identity';
import {nativeBeautyService} from '@/lib/beauty/native-service';
import {settingsSaveUncertain} from '@/server/services/settings-save-error';
import type {Prisma} from '../../../generated/beauty-client';
export async function saveBeautyNativeService(input:unknown){
 try{
  const a=await beautyManager('plans.edit',true);await requireStoreFeature(a.storeId,FEATURES.PLAN_MANAGEMENT);
  const d=z.object({id:key.optional(),revision:z.number().int().nonnegative().optional(),expectedStoreId:key,requestKey:z.string().uuid(),name:z.string(),category:z.string(),duration:z.number(),buffer:z.number(),active:z.boolean(),rule:z.object({coachIds:z.array(key).max(200),expectedCoachIds:z.array(key).max(200)}).optional()}).parse(input);
  if(d.expectedStoreId!==a.storeId)throw new AppError('CONFLICT','目前門市已切換，請重新開啟服務');
  if(d.rule){await requirePermission('staff.manage');await requirePermission('teacher.compensation.manage');await requireStoreFeature(a.storeId,FEATURES.SERVICE_FEE_CALCULATOR);await requireStoreFeature(a.storeId,FEATURES.STAFF_MANAGEMENT);}
  const receipt=await beautyTransaction(a,tx=>command(tx,a,d.requestKey,{operation:'native-service',...d},async()=>{
   const prior=d.id?await tx.beautyService.findFirst({where:{storeId:a.storeId,id:d.id}}):null;
   if(d.id&&(!prior||prior.revision!==d.revision))throw new AppError('CONFLICT','服務已更新，請重新開啟');
   if(d.active){
    const peers=await tx.beautyService.findMany({where:{storeId:a.storeId,active:true,duration:d.duration},select:{id:true,name:true,duration:true}});
    const duplicate=peers.find(s=>s.id!==d.id&&beautyServiceIdentity(s.name,s.duration)===beautyServiceIdentity(d.name,d.duration));
    if(duplicate)throw new AppError('CONFLICT',`已有相同服務「${duplicate.name}」，請沿用此服務；方案請在收費方式建立。`);
   }
   const current=d.id?await tx.beautyTechnician.findMany({where:{storeId:a.storeId,serviceIds:{has:d.id}}}):[];
   if(d.rule&&JSON.stringify(current.map(t=>t.id).sort())!==JSON.stringify([...d.rule.expectedCoachIds].sort()))throw new AppError('CONFLICT','可服務技師已更新，請重新核對');
   if(d.rule&&new Set(d.rule.coachIds).size!==d.rule.coachIds.length)throw new AppError('VALIDATION','技師不可重複');
   const selected=d.rule?await tx.beautyTechnician.findMany({where:{storeId:a.storeId,id:{in:d.rule.coachIds}}}):current;
   if(d.rule&&selected.length!==d.rule.coachIds.length)throw new AppError('FORBIDDEN','包含非本店技師');
   // Qualification edits never change compensation. New nullable defaults stay omitted;
   // do not round-trip a JSON null sentinel through the native runtime.
   if(d.rule&&prior)for(const t of current.filter(t=>!d.rule!.coachIds.includes(t.id)))await persistBeautyCatalog(tx,a,'technician',{...t,serviceIds:t.serviceIds.filter(id=>id!==prior.id)});
   const saved=await persistBeautyCatalog(tx,a,'service',{...prior,id:prior?.id,revision:prior?.revision??0,name:d.name,category:d.category,duration:d.duration,buffer:d.buffer,active:d.active,price:prior?.price??0,trialPrice:prior?.trialPrice??null,...(d.rule&&prior?.defaultRate?{defaultRate:prior.defaultRate}:{})});
   const service=nativeBeautyService({...saved.record as object,...(d.rule?{}:{defaultRate:undefined})},selected.map(t=>t.id));
   if(d.rule){
    const ids=new Set(selected.map(t=>t.id));
    for(const id of ids){const t=[...current,...selected].find(t=>t.id===id)!;const include=d.rule.coachIds.includes(id),serviceIds=include?[...new Set([...t.serviceIds,service.id])]:t.serviceIds.filter(s=>s!==service.id);
     if(JSON.stringify(serviceIds)!==JSON.stringify(t.serviceIds))await persistBeautyCatalog(tx,a,'technician',{...t,serviceIds});
    }
   }
   return JSON.parse(JSON.stringify(service)) as Prisma.InputJsonValue;
  }));
  let syncWarning=false;try{revalidatePath('/dashboard/beauty');}catch{syncWarning=true;}
  return {success:true as const,storeId:a.storeId,data:receipt,syncWarning};
 }catch(error){const result=handleActionError(error);return {success:false as const,error:result.success?'服務尚未儲存':result.error,uncertain:settingsSaveUncertain(error)};}
}
