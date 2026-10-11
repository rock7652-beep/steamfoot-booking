import "server-only";
import { revalidatePath,revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { courseManager } from "@/server/services/course-access";
import { AppError,handleActionError } from "@/lib/errors";
import { TRIAL_DEFAULTS } from "@/lib/shop-config";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { ensureTrialPlan } from "@/server/services/trial-plan";
import { settingsSaveUncertain } from "./settings-save-error";
import { shopSettingsSaveInput,paymentSettingsValues,trialSettingsValues } from "@/lib/shop-settings-save";

/** Configuration edits use a committed receipt, without an RSC render response. */
export async function saveShopSettings(input:unknown) {
  try {
    const request=shopSettingsSaveInput.parse(input);
    const permission=request.kind==="PAYMENT"?"plans.edit":"trial.manage";
    const user=await requirePermission(permission);
    const storeId=await resolveWriteStoreId(user);
    if(storeId!==request.expectedStoreId)throw new AppError("CONFLICT","目前門市已切換，請重新開啟設定。");
    const course=await getStoreIndustryModule(storeId)==="course";
    if(course && (await courseManager(permission)).storeId!==storeId)throw new AppError("CONFLICT","目前門市已切換，請重新開啟設定。");
    const schema=request.kind==="PAYMENT"?paymentSettingsValues:trialSettingsValues;
    const values=schema.parse(request.values);
    const data=await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;
      const previous=await tx.shopConfig.findUnique({where:{storeId}});
      const current=request.kind==="PAYMENT" ? paymentSettingsValues.parse({bankName:previous?.bankName??null,bankCode:previous?.bankCode??null,bankAccountNumber:previous?.bankAccountNumber??null,lineOfficialId:previous?.lineOfficialId??null,lineOfficialUrl:previous?.lineOfficialUrl??null}) : trialSettingsValues.parse(previous?{trialEnabled:previous.trialEnabled,trialDefaultPrice:Number(previous.trialDefaultPrice),trialAllowPriceEdit:previous.trialAllowPriceEdit,trialMinPrice:Number(previous.trialMinPrice),trialMaxPrice:Number(previous.trialMaxPrice)}:TRIAL_DEFAULTS);
      if(JSON.stringify(current)!==request.expectedRevision && JSON.stringify(current)!==JSON.stringify(values))
        throw new AppError("CONFLICT","設定已有更新，輸入已保留。請重新開啟後核對。");
      if(JSON.stringify(current)!==JSON.stringify(values)) {
        if(previous) {
          const updated=await tx.shopConfig.updateMany({where:{storeId,updatedAt:previous.updatedAt},data:values});
          if(!updated.count)throw new AppError("CONFLICT","設定已有更新，請重新核對。");
        } else await tx.shopConfig.create({data:{storeId,...values}});
      }
      // Keep the canonical steamfoot/SPA trial plan in the same transaction.
      if(request.kind==="TRIAL"&&!course)await ensureTrialPlan(storeId,request.values.trialDefaultPrice,tx);
      const saved=await tx.shopConfig.findUnique({where:{storeId}});
      const confirmed=schema.parse(request.kind==="PAYMENT"?saved??values:saved?{...saved,trialDefaultPrice:Number(saved.trialDefaultPrice),trialMinPrice:Number(saved.trialMinPrice),trialMaxPrice:Number(saved.trialMaxPrice)}:values);
      return {values:confirmed,revision:JSON.stringify(confirmed)};
    });
    let syncWarning=false;
    try {
      // Route handlers expire the tag immediately; updateTag is Server Action only.
      revalidateTag(CACHE_TAGS.shopConfig,{expire:0});
      revalidatePath("/dashboard");revalidatePath("/dashboard/settings");revalidatePath("/dashboard/settings/plan");
      revalidatePath(request.kind==="PAYMENT"?"/dashboard/settings/payment":"/dashboard/settings/trial");
      if(course){revalidatePath("/dashboard/courses");revalidatePath("/book");}
    } catch {syncWarning=true;}
    return {success:true as const,storeId,data,syncWarning};
  } catch(error){return {...handleActionError(error),uncertain:settingsSaveUncertain(error)};}
}
