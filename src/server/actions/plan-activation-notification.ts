"use server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { AppError, handleActionError } from "@/lib/errors";
import { planActivationSettingId, PLAN_ACTIVATION_TEMPLATE } from "@/lib/plan-activation-notification";

export async function setPlanActivationNotificationEnabled(input: {expectedStoreId: string; enabled: boolean}) {
  try {
    const user = await requirePermission("business_hours.manage");
    const storeId = await resolveWriteStoreId(user);
    if (storeId !== input.expectedStoreId || typeof input.enabled !== "boolean") throw new AppError("CONFLICT", "門市已變更，請重新開啟設定");
    await requireStoreFeature(storeId, FEATURES.LINE_REMINDER);
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;
      await tx.messageTemplate.upsert({where:{id:planActivationSettingId(storeId)},
        create:{id:planActivationSettingId(storeId),storeId,name:PLAN_ACTIVATION_TEMPLATE,body:input.enabled?"enabled":"disabled"},
        update:{body:input.enabled?"enabled":"disabled"}});
      if(!input.enabled)await tx.$executeRaw`UPDATE "PlanActivationNotification" SET status='SKIPPED',"errorMessage"='通知已關閉，不補發',"loggedAt"=NULL WHERE "storeId"=${storeId} AND status IN ('PENDING','FAILED')`;
      await tx.auditLog.create({data:{actorUserId:user.id,targetType:"MessageTemplate",targetId:planActivationSettingId(storeId),action:"PLAN_ACTIVATION_NOTIFICATION_SETTING",afterJson:{enabled:input.enabled}}});
    });
    return {success:true as const};
  } catch(error) {return handleActionError(error);}
}
