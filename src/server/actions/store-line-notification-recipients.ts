"use server";

import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { FEATURES } from "@/lib/feature-flags";
import { migrateManagerRecipients } from "@/server/services/manager-notification-delivery";
import { managerPreferences, managerNotificationOptions, MANAGER_NOTIFICATION_OPTIONS } from "@/lib/manager-notification-preferences";
import { settingsStep } from "@/server/services/settings-timing";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { getLineConfigForStore } from "@/lib/line-config";
import { requirePermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import type { ActionResult } from "@/types";

const recipientSchema = z.object({
  displayName: z.string().trim().min(1, "請輸入通知人員姓名").max(30),
  roleLabel: z.enum(["店長", "店主", "合夥人", "值班主管"]),
});

async function requireStore(expectedStoreId?: string) {
  const user = await settingsStep("authorization", () => requirePermission("business_hours.manage"));
  const storeId = await settingsStep("store_scope", () => getActiveStoreForRead(user));
  if (expectedStoreId && storeId !== expectedStoreId) throw new AppError("FORBIDDEN", "店家範圍已變更，請重新整理");
  if (!storeId) throw new AppError("FORBIDDEN", "請先切換至特定店舖");
  const industry = await getStoreIndustryModule(storeId);
  if (industry === "beauty") {
    const [{beautyManager},{requireStoreFeature}] = await Promise.all([import("@/server/beauty/access"),import("@/lib/feature-gate")]);
    const actor = await beautyManager("business_hours.manage", true);
    if (actor.storeId !== storeId) throw new AppError("FORBIDDEN", "店家範圍已變更，請重新整理");
    await requireStoreFeature(storeId,FEATURES.LINE_REMINDER);
  }
  if (industry === "course") {
    const [{courseManager},{requireStoreFeature}] = await Promise.all([
      import("@/server/services/course-access"), import("@/lib/feature-gate"),
    ]);
    const actor = await courseManager("business_hours.manage");
    if (actor.storeId !== storeId) throw new AppError("FORBIDDEN", "店家範圍已變更，請重新整理");
    await requireStoreFeature(storeId,FEATURES.LINE_REMINDER);
  }
  return storeId;
}

export async function listStoreLineNotificationRecipients() {
  const storeId = await requireStore();
  await migrateManagerRecipients(storeId);
  return prisma.storeLineNotificationRecipient.findMany({
    where: { storeId },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      displayName: true,
      roleLabel: true,
      isActive: true,
      sameDayBookingEnabled: true,
      preferences: true,
      legacyStaffId: true,
      linkedAt: true,
      bindingCode: true,
      bindingCodeExpiresAt: true,
    },
  });
}

export async function createStoreLineNotificationRecipient(
  input: z.infer<typeof recipientSchema>,
): Promise<ActionResult<{ bindUrl: string }>> {
  try {
    const storeId = await requireStore();
    const values = recipientSchema.parse(input);
    if (await getStoreIndustryModule(storeId) === "beauty") {
      const {beautyNotificationDeliveryBlocked} = await import("@/lib/beauty/notification-policy");
      if (beautyNotificationDeliveryBlocked()) throw new AppError("BUSINESS_RULE", "LINE 維持關閉，暫不建立綁定");
    }
    const basicId = getLineConfigForStore(storeId).expectedBasicId;
    if (!basicId) throw new AppError("BUSINESS_RULE", "此分店尚未完成 LINE 官方帳號設定");
    const bindingCode = randomBytes(5).toString("hex").toUpperCase();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.storeLineNotificationRecipient.create({
      data: { storeId, ...values, bindingCode, bindingCodeExpiresAt: expiresAt },
    });
    const command = `綁定通知 ${bindingCode}`;
    const bindUrl = `https://line.me/R/oaMessage/${encodeURIComponent(basicId)}/?${encodeURIComponent(command)}`;
    revalidatePath("/dashboard/reminders");
    revalidatePath("/dashboard/courses/reminders");
    revalidatePath("/dashboard/beauty/reminders");
    revalidatePath("/dashboard/beauty");
    return { success: true, data: { bindUrl } };
  } catch (error) {
    return handleActionError(error);
  }
}

/** Resume the same pending recipient; never turn an unverified identity on. */
export async function resumeStoreLineNotificationRecipient(id:string,expectedStoreId:string):Promise<ActionResult<{bindUrl:string}>>{
  try {
    z.string().min(1).max(100).parse(id);
    const storeId=await requireStore(expectedStoreId);
    if(await getStoreIndustryModule(storeId)==="beauty"){
      const {beautyNotificationDeliveryBlocked}=await import("@/lib/beauty/notification-policy");
      if(beautyNotificationDeliveryBlocked())throw new AppError("BUSINESS_RULE","LINE 維持關閉，暫不建立綁定");
    }
    const basicId=getLineConfigForStore(storeId).expectedBasicId;
    if(!basicId)throw new AppError("BUSINESS_RULE","此分店尚未完成 LINE 官方帳號設定");
    const recipient=await prisma.storeLineNotificationRecipient.findFirst({where:{id,storeId}});
    if(!recipient)throw new AppError("NOT_FOUND","找不到本店通知人員");
    if(recipient.lineUserId||recipient.linkedAt)throw new AppError("CONFLICT","已完成綁定，請重新整理提醒管理");
    let bindingCode=recipient.bindingCode;
    if(!bindingCode||!recipient.bindingCodeExpiresAt||recipient.bindingCodeExpiresAt<=new Date()){
      bindingCode=randomBytes(5).toString("hex").toUpperCase();
      const updated=await prisma.storeLineNotificationRecipient.updateMany({where:{id,storeId,lineUserId:null,linkedAt:null,bindingCode:recipient.bindingCode},data:{bindingCode,bindingCodeExpiresAt:new Date(Date.now()+24*60*60*1000)}});
      if(updated.count!==1)throw new AppError("CONFLICT","綁定狀態已有更新，請重新整理後再試");
    }
    return {success:true,data:{bindUrl:`https://line.me/R/oaMessage/${encodeURIComponent(basicId)}/?${encodeURIComponent(`綁定通知 ${bindingCode}`)}`}};
  }catch(error){return handleActionError(error);}
}

export async function setStoreLineNotificationRecipientActive(
  id: string,
  isActive: boolean,
  expectedStoreId?: string,
): Promise<ActionResult> {
  try {
    const storeId = await requireStore(expectedStoreId);
    const recipient = await prisma.storeLineNotificationRecipient.findFirst({
      where: { id, storeId },
      select: { lineUserId: true },
    });
    if (!recipient) throw new AppError("NOT_FOUND", "找不到通知人員");
    if (isActive && !recipient.lineUserId) {
      throw new AppError("BUSINESS_RULE", "請先完成 LINE 綁定");
    }
    await prisma.storeLineNotificationRecipient.updateMany({
      where: { id, storeId },
      data: { isActive },
    });
    revalidatePath("/dashboard/reminders");
    revalidatePath("/dashboard/courses/reminders");
    revalidatePath("/dashboard/beauty/reminders");
    revalidatePath("/dashboard/beauty");
    return { success: true, data: undefined };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function removeStoreLineNotificationRecipient(id: string): Promise<ActionResult> {
  try {
    const storeId = await requireStore();
    await prisma.storeLineNotificationRecipient.deleteMany({ where: { id, storeId } });
    revalidatePath("/dashboard/reminders");
    revalidatePath("/dashboard/courses/reminders");
    revalidatePath("/dashboard/beauty/reminders");
    revalidatePath("/dashboard/beauty");
    return { success: true, data: undefined };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function setSameDayBookingReminder(
  id: string,
  enabled: boolean,
): Promise<ActionResult> {
  try {
    const storeId = await requireStore();
    const values = z.object({ id: z.string().min(1), enabled: z.boolean() }).parse({ id, enabled });
    const recipient = await prisma.storeLineNotificationRecipient.findFirst({
      where: { id: values.id, storeId },
      select: { lineUserId: true, isActive: true },
    });
    if (!recipient) throw new AppError("NOT_FOUND", "找不到通知人員");
    if (values.enabled && (!recipient.lineUserId || !recipient.isActive)) {
      throw new AppError("BUSINESS_RULE", "請先完成 LINE 綁定並啟用通知人員");
    }
    await prisma.storeLineNotificationRecipient.updateMany({
      where: { id: values.id, storeId },
      data: { sameDayBookingEnabled: values.enabled },
    });
    revalidatePath("/dashboard/reminders");
    revalidatePath("/dashboard/courses/reminders");
    revalidatePath("/dashboard/beauty/reminders");
    revalidatePath("/dashboard/beauty");
    return { success: true, data: undefined };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function setManagerNotificationPreference(id: string, key: string, enabled: boolean, expectedStoreId?: string): Promise<ActionResult> {
  try {
    const storeId = await requireStore(expectedStoreId);
    z.object({ id: z.string().min(1), key: z.enum(MANAGER_NOTIFICATION_OPTIONS.map(o => o.key) as [string, ...string[]]), enabled: z.boolean() }).parse({ id, key, enabled });
    if (enabled && await getStoreIndustryModule(storeId) === "course" && !managerNotificationOptions(true).some(option => option.key === key)) {
      throw new AppError("BUSINESS_RULE", "此通知尚未接入課程流程");
    }
    if (enabled && await getStoreIndustryModule(storeId) === "beauty" && !managerNotificationOptions(false,true).some(option => option.key === key)) {
      throw new AppError("BUSINESS_RULE", "此通知尚未接入美業流程");
    }
    await settingsStep("transaction", () => prisma.$transaction(async tx => {
      await settingsStep("db_lock", () => tx.$queryRaw`SELECT id FROM "StoreLineNotificationRecipient" WHERE id = ${id} AND "storeId" = ${storeId} FOR UPDATE`);
      const recipient = await tx.storeLineNotificationRecipient.findFirst({ where: { id, storeId } });
      if (!recipient) throw new AppError("NOT_FOUND", "找不到通知人員");
      if (enabled && (!recipient.isActive || !recipient.lineUserId)) throw new AppError("BUSINESS_RULE", "請先綁定 LINE 並開啟接收通知");
      const preferences = managerPreferences(recipient.preferences, recipient.sameDayBookingEnabled);
      await tx.storeLineNotificationRecipient.update({ where: { id }, data: {
        preferences: { ...preferences, [key]: enabled },
        ...(key === "sameDay" ? { sameDayBookingEnabled: enabled } : {}),
      } });
    }));
    revalidatePath("/dashboard/reminders");
    revalidatePath("/dashboard/courses/reminders");
    revalidatePath("/dashboard/beauty/reminders");
    revalidatePath("/dashboard/beauty");
    return { success: true, data: undefined };
  } catch (error) { return handleActionError(error); }
}
