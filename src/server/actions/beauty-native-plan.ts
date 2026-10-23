"use server";
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {beautyManager,beautyTransaction,command} from '@/server/beauty/access';
import {persistBeautyCatalog} from '@/server/beauty/catalog';
import {requirePermission} from '@/lib/permissions';
import {requireStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {key,planInput} from '@/lib/beauty/contracts';
import {nativeBeautyPlan} from '@/lib/beauty/native-plan';
import {AppError,handleActionError} from '@/lib/errors';
import {settingsSaveUncertain} from '@/server/services/settings-save-error';
import type {Prisma} from '../../../generated/beauty-client';
export async function saveBeautyNativePlan(input:unknown){
 try{
  const a=await beautyManager('plans.edit',true);await requireStoreFeature(a.storeId,FEATURES.PLAN_MANAGEMENT);
  const d=z.object({expectedStoreId:key,requestKey:z.string().uuid(),id:key.optional(),revision:z.number().int().nonnegative().optional(),unit:z.literal('SESSION'),sportsMode:z.enum(['ASSIGNED','LEGACY']),subjectId:key,name:z.string(),sessions:z.number(),price:z.number(),validDays:z.number(),active:z.boolean(),allowShared:z.boolean(),customerPurchasable:z.boolean(),lowBalanceEnabled:z.boolean().optional(),lowBalanceThreshold:planInput.shape.lowBalanceThreshold.optional(),qualification:z.object({coachIds:z.array(key).min(1,'請至少選一位可服務技師').max(200),expectedCoachIds:z.array(key).max(200),serviceRevision:z.number().int().nonnegative()}).optional()}).parse(input);
  if(d.expectedStoreId!==a.storeId)throw new AppError('CONFLICT','門市已切換，請重新開啟收費方式');
  if(d.qualification){await requirePermission('staff.manage');await requirePermission('teacher.compensation.manage');await requireStoreFeature(a.storeId,FEATURES.SERVICE_FEE_CALCULATOR);await requireStoreFeature(a.storeId,FEATURES.STAFF_MANAGEMENT);}
  const receipt=await beautyTransaction(a,tx=>command(tx,a,d.requestKey,{operation:'native-plan',...d},async()=>{
   const prior=d.id?await tx.beautyPlan.findFirst({where:{id:d.id,storeId:a.storeId}}):null;
   if(d.id&&(!prior||prior.revision!==d.revision))throw new AppError('CONFLICT','收費方式已更新，請重新開啟');
   if(d.sportsMode==='LEGACY'&&!prior)throw new AppError('CONFLICT','既有方案適用範圍已更新，請重新核對');
   const service=await tx.beautyService.findFirst({where:{id:d.subjectId,storeId:a.storeId}});
   if(!service||(!service.active&&!prior?.serviceIds.includes(service.id)))throw new AppError('VALIDATION','請選擇本店上架的服務項目');
   if(d.qualification){
    if(service.revision!==d.qualification.serviceRevision)throw new AppError('CONFLICT','服務設定已更新，請重新開啟');
    const current=await tx.beautyTechnician.findMany({where:{storeId:a.storeId,serviceIds:{has:service.id}}});
    if(JSON.stringify(current.map(t=>t.id).sort())!==JSON.stringify([...d.qualification.expectedCoachIds].sort()))throw new AppError('CONFLICT','可服務技師已更新，請重新開啟');
    const selected=await tx.beautyTechnician.findMany({where:{storeId:a.storeId,id:{in:d.qualification.coachIds}}});
    if(new Set(d.qualification.coachIds).size!==d.qualification.coachIds.length||selected.length!==d.qualification.coachIds.length)throw new AppError('FORBIDDEN','技師資料重複或不屬於本店');
    for(const t of [...current,...selected.filter(t=>!current.some(c=>c.id===t.id))]){
     const include=d.qualification.coachIds.includes(t.id),serviceIds=include?[...new Set([...t.serviceIds,service.id])]:t.serviceIds.filter(id=>id!==service.id);
     if(JSON.stringify(serviceIds)!==JSON.stringify(t.serviceIds))await persistBeautyCatalog(tx,a,'technician',{...t,serviceIds});
    }
   }
   const saved=await persistBeautyCatalog(tx,a,'plan',{...prior,id:prior?.id,revision:prior?.revision??0,name:d.name,sessions:d.sessions,price:d.price,validDays:d.validDays,active:d.active,allowShared:d.allowShared,customerPurchasable:d.customerPurchasable,serviceIds:d.sportsMode==='LEGACY'?[...new Set([d.subjectId,...prior!.serviceIds.slice(1)])]:[d.subjectId],lowBalanceEnabled:d.lowBalanceEnabled??prior?.lowBalanceEnabled??false,lowBalanceThreshold:d.lowBalanceThreshold===undefined?prior?.lowBalanceThreshold??null:d.lowBalanceThreshold});
   return JSON.parse(JSON.stringify(nativeBeautyPlan(saved.record))) as Prisma.InputJsonValue;
  }));
  let syncWarning=false;try{revalidatePath('/dashboard/beauty');}catch{syncWarning=true;}
  return {success:true as const,storeId:a.storeId,data:receipt,syncWarning};
 }catch(error){const r=handleActionError(error);return {success:false as const,error:r.success?'收費方式尚未儲存':r.error,uncertain:settingsSaveUncertain(error)};}
}
