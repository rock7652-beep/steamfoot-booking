"use server";
import {randomBytes} from "node:crypto";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import type {Prisma} from "@prisma/client";
import {prisma} from "@/lib/db";
import {AppError,handleActionError} from "@/lib/errors";
import {requireStoreFeature} from "@/lib/feature-gate";
import {FEATURES} from "@/lib/feature-flags";
import {beautyManager,beautyMember,beautyTransaction,audit} from "@/server/beauty/access";
import {beautyPlanReminderSchema,beautyTrialCareSchema,beautyPlanPreferenceId} from "@/lib/beauty/reminders";
import {maintainCatalogCharge} from '@/server/beauty/charge-runtime';

async function lockCoreBeauty(tx:Prisma.TransactionClient,storeId:string) {
  const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "Store" WHERE id=${storeId} AND "industryModule"::text='BEAUTY' AND "operatingStatus"::text IN ('ACTIVE','TRIAL') FOR UPDATE`;
  if(rows.length!==1)throw new AppError("FORBIDDEN","店家已停用或模組已更改");
}

export async function saveBeautyPlanReminderSetting(input:unknown) {
  try {
    const a=await beautyManager("business_hours.manage",true),d=beautyPlanReminderSchema.parse(input);
    if(d.expectedStoreId!==a.storeId)throw new AppError("CONFLICT","目前店家已切換，請重新整理");
    await requireStoreFeature(a.storeId,FEATURES.LINE_REMINDER);
    const revision=await beautyTransaction(a,async tx=>{
      const changed=await tx.beautyPlan.updateMany({where:{storeId:a.storeId,id:d.planId,revision:d.expectedRevision},data:{lowBalanceEnabled:d.enabled,lowBalanceThreshold:d.threshold,expiryReminder:d.expiry,revision:{increment:1}}});
      if(changed.count!==1)throw new AppError("CONFLICT","方案已更新或不屬於本店，請重新開啟");
      await maintainCatalogCharge(tx,a.storeId,'plan',{id:d.planId,revision:d.expectedRevision+1},false);
      await audit(tx,a,"PLAN_REMINDER_SETTING",JSON.stringify(d));
      return d.expectedRevision+1;
    });
    revalidatePath("/dashboard/beauty");revalidatePath("/dashboard/beauty/reminders");
    return {success:true as const,revision};
  }catch(e){return handleActionError(e);}
}

export async function saveBeautyTrialCareSettings(input:unknown) {
  try {
    const a=await beautyManager("business_hours.manage",true),d=beautyTrialCareSchema.parse(input);
    if(d.storeId!==a.storeId)throw new AppError("CONFLICT","目前店家已切換，請重新整理");
    await requireStoreFeature(a.storeId,FEATURES.LINE_REMINDER);
    const revision=await prisma.$transaction(async tx=>{
      const stores=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "Store" WHERE id=${a.storeId} AND "industryModule"::text='BEAUTY' AND "operatingStatus"::text IN ('ACTIVE','TRIAL') FOR UPDATE`;
      if(stores.length!==1)throw new AppError("FORBIDDEN","店家已停用或模組已更改");
      const old=await tx.trialCareSetting.findUnique({where:{storeId:a.storeId}});
      if((old?.updatedAt.toISOString()??null)!==d.expectedRevision)throw new AppError("CONFLICT","關懷設定已更新，請重新開啟");
      const updatedAt=new Date(Math.max(Date.now(),(old?.updatedAt.getTime()??0)+1));
      const activatedAt=d.enabled&&!old?.enabled?updatedAt:old?.activatedAt??null;
      const values={enabled:d.enabled,rules:d.rules,activatedAt,updatedAt};
      await tx.trialCareSetting.upsert({where:{storeId:a.storeId},create:{storeId:a.storeId,...values},update:values});
      await tx.auditLog.create({data:{storeId:a.storeId,actorUserId:a.userId!,module:"BEAUTY",action:"BEAUTY_TRIAL_CARE_SETTING",targetType:"TrialCareSetting",targetId:a.storeId,afterJson:{enabled:d.enabled,revision:updatedAt.toISOString()}}});
      return updatedAt.toISOString();
    });
    revalidatePath("/dashboard/beauty/reminders");revalidatePath("/dashboard/beauty");
    return {success:true as const,revision};
  }catch(e){return handleActionError(e);}
}

export async function stopBeautyCustomerTrialCare(customerId:string) {
  try {
    const a=await beautyManager("customer.update",true),id=z.string().min(1).parse(customerId);
    await requireStoreFeature(a.storeId,FEATURES.LINE_REMINDER);
    await prisma.$transaction(async tx=>{
      await lockCoreBeauty(tx,a.storeId);
      if(!await tx.customer.findFirst({where:{id,storeId:a.storeId},select:{id:true}}))throw new AppError("NOT_FOUND","找不到本店顧客");
      await tx.trialCarePreference.upsert({where:{storeId_customerId:{storeId:a.storeId,customerId:id}},create:{storeId:a.storeId,customerId:id,token:randomBytes(24).toString("hex"),stoppedAt:new Date(),lastEventAt:new Date()},update:{stoppedAt:new Date(),lastEventAt:new Date()}});
    });
    revalidatePath("/dashboard/beauty/reminders");return {success:true as const};
  }catch(e){return handleActionError(e);}
}

export async function setBeautyPlanReminderPreference(stopped:boolean) {
  try {
    const a=await beautyMember(true),value=z.boolean().parse(stopped),id=beautyPlanPreferenceId(a.storeId,a.customerId!);
    await prisma.$transaction(async tx=>{
      await lockCoreBeauty(tx,a.storeId);
      await tx.messageTemplate.upsert({where:{id},create:{id,storeId:a.storeId,name:"美業個人方案提醒偏好",channel:"LINE",body:value?"stopped":"receiving"},update:{body:value?"stopped":"receiving"}});
    });
    revalidatePath("/beauty/reminders");return {success:true as const};
  }catch(e){return handleActionError(e);}
}
export async function setBeautyTrialCarePreference(stopped:boolean) {
  try {
    const a=await beautyMember(true),value=z.boolean().parse(stopped);
    await prisma.$transaction(async tx=>{
      await lockCoreBeauty(tx,a.storeId);
      await tx.trialCarePreference.upsert({where:{storeId_customerId:{storeId:a.storeId,customerId:a.customerId!}},create:{storeId:a.storeId,customerId:a.customerId!,token:randomBytes(24).toString("hex"),stoppedAt:value?new Date():null,lastEventAt:new Date()},update:{stoppedAt:value?new Date():null,lastEventAt:new Date()}});
    });
    revalidatePath("/beauty/reminders");return {success:true as const};
  }catch(e){return handleActionError(e);}
}
