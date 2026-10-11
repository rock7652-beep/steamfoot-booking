import "server-only";
import {prisma} from "@/lib/db";
import {requireWritablePermission} from "@/lib/permissions";
import {resolveWriteStoreId} from "@/lib/store";
import {getStoreIndustryModule} from "@/lib/industry-module-server";
import {AppError,handleActionError} from "@/lib/errors";
import {dutySettingsSaveInput} from "@/lib/duty-settings-save";
import {withDutyMutation} from "@/server/services/course-duty-mutation";
import {settingsSaveUncertain} from "@/server/services/settings-save-error";
import {revalidateDutySchedulingInRoute} from "@/lib/revalidation";
import type {Prisma} from "@prisma/client";
export async function saveDutySettings(input:unknown){
 try{
  const user=await requireWritablePermission("duty.manage");
  const storeId=await resolveWriteStoreId(user),d=dutySettingsSaveInput.parse(input);
  if(storeId!==d.expectedStoreId)throw new AppError("CONFLICT","門市已切換，請重新開啟設定");
  const work=async(tx:Prisma.TransactionClient)=>{
   const current=await tx.shopConfig.findUnique({where:{storeId}});
   const enabled=current?.dutySchedulingEnabled??false;
   if(enabled===d.enabled)return {enabled};
   if(enabled!==d.expectedEnabled)throw new AppError("CONFLICT","值班聯動已有更新，請核對後再編輯");
   if(current){
    const result=await tx.shopConfig.updateMany({where:{storeId,updatedAt:current.updatedAt},data:{dutySchedulingEnabled:d.enabled}});
    if(result.count!==1)throw new AppError("CONFLICT","值班設定已有更新，請核對後再編輯");
   }else await tx.shopConfig.create({data:{storeId,dutySchedulingEnabled:d.enabled}});
   const saved=await tx.shopConfig.findUniqueOrThrow({where:{storeId}});
   return {enabled:saved.dutySchedulingEnabled};
  };
  // The course helper retains writable/module authorization and validates all
  // unfinished teaching sessions before committing the toggle.
  const data=await getStoreIndustryModule(storeId)==="course"
   ?await withDutyMutation(storeId,work)
   :await prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;return work(tx);});
  let syncWarning=false;try{revalidateDutySchedulingInRoute();}catch{syncWarning=true;}
  return {success:true as const,storeId,data,syncWarning};
 }catch(error){return {...handleActionError(error),uncertain:settingsSaveUncertain(error)};}
}
