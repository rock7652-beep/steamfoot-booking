import "server-only";
import {createHash} from "node:crypto";
import {revalidatePath,revalidateTag} from "next/cache";
import {prisma} from "@/lib/db";
import {requireWritablePermission} from "@/lib/permissions";
import {requireStaffSession} from "@/lib/session";
import {assertStoreSubscriptionWritable} from "@/lib/subscription-guard";
import {checkCurrentStoreFeature} from "@/lib/feature-gate";
import {FEATURES} from "@/lib/feature-flags";
import {CACHE_TAGS} from "@/lib/cache-tags";
import {AppError,handleActionError} from "@/lib/errors";
import {steamPlanSaveInput,savedSteamPlan} from "@/lib/steam-plan-save";
import {settingsSaveUncertain} from "./settings-save-error";

export async function saveSteamPlan(input:unknown) {
  try {
    const request=steamPlanSaveInput.parse(input);
    await requireWritablePermission("wallet.create");
    if(request.operation==="CREATE")await checkCurrentStoreFeature(FEATURES.PLAN_MANAGEMENT);
    const user=await requireStaffSession();
    const storeId=user.storeId;
    if(!storeId||storeId!==request.expectedStoreId)throw new AppError("CONFLICT","目前門市已切換，請重新開啟方案。");
    await assertStoreSubscriptionWritable(storeId);
    if(request.operation==="CREATE"&&request.values.category==="TRIAL")throw new AppError("BUSINESS_RULE","體驗由「建立體驗預約」處理，無需新增體驗方案");
    // Preserve the cuid shape accepted by existing paper-plan import validation.
    const rowId=request.operation==="UPDATE"?request.id:`c${createHash("sha256").update(JSON.stringify([storeId,request.requestKey])).digest("hex").slice(0,24)}`;
    const row=await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;
      const previous=await tx.servicePlan.findFirst({where:{id:rowId,storeId},include:{_count:{select:{wallets:true}}}});
      if(request.operation==="UPDATE"&&!previous)throw new AppError("NOT_FOUND","課程方案不存在");
      const data=request.operation==="CREATE"?{...request.values,validityDays:request.values.validityDays??null,description:request.values.description??null,sortOrder:request.values.sortOrder??0,isActive:true,publicVisible:request.values.publicVisible??false}:Object.fromEntries(Object.entries(request.values).filter(([key,value])=>key!=="expectedUpdatedAt"&&value!==undefined));
      const matches=previous&&Object.entries(data).every(([key,value])=>key==="price"?Number(previous.price)===value:previous[key as keyof typeof previous]===value);
      if(previous&&(request.operation==="CREATE"||previous.updatedAt.toISOString()!==request.values.expectedUpdatedAt)) {
        if(matches)return previous;
        throw new AppError("CONFLICT","方案已有更新，輸入已保留。請核對目前資料後再編輯。");
      }
      const name="name" in data?String(data.name):previous?.name;
      if(name&&await tx.servicePlan.findFirst({where:{storeId,name,id:{not:rowId}},select:{id:true}}))throw new AppError("VALIDATION",`方案名稱「${name}」已存在`);
      if(request.operation==="CREATE")return tx.servicePlan.create({data:{...request.values,id:rowId,storeId,isActive:true,publicVisible:request.values.publicVisible??false},include:{_count:{select:{wallets:true}}}});
      const {expectedUpdatedAt,...fields}=request.values;
      const saved=await tx.servicePlan.updateMany({where:{id:rowId,storeId,updatedAt:new Date(expectedUpdatedAt)},data:fields});
      if(!saved.count)throw new AppError("CONFLICT","方案已有更新，輸入已保留。請重新核對。");
      return tx.servicePlan.findFirstOrThrow({where:{id:rowId,storeId},include:{_count:{select:{wallets:true}}}});
    });
    const data=savedSteamPlan.parse({...row,price:Number(row.price),createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()});
    let syncWarning=false;
    try{revalidateTag(CACHE_TAGS.plans,{expire:0});revalidatePath("/dashboard/plans");}catch{syncWarning=true;}
    return {success:true as const,storeId,data,syncWarning};
  }catch(error){return {...handleActionError(error),uncertain:settingsSaveUncertain(error)};}
}
