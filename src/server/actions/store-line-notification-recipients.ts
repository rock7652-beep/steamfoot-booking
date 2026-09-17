"use server";

import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { FEATURES } from "@/lib/feature-flags";
import { migrateManagerRecipients } from "@/server/services/manager-notification-delivery";
import { managerPreferences, MANAGER_NOTIFICATION_OPTIONS } from "@/lib/manager-notification-preferences";
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

async function requireStore() {
  const user = await requirePermission("business_hours.manage");
  const storeId = await getActiveStoreForRead(user);
  if (!storeId) throw new AppError("FORBIDDEN", "請先切換至特定店舖");
  if (await getStoreIndustryModule(storeId) === "course") {
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
    return { success: true, data: { bindUrl } };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function setStoreLineNotificationRecipientActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  try {
    const storeId = await requireStore();
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
    return { success: true, data: undefined };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function setManagerNotificationPreference(id: string, key: string, enabled: boolean): Promise<ActionResult> {
  try {
    const storeId = await requireStore();
    z.object({ id: z.string().min(1), key: z.enum(MANAGER_NOTIFICATION_OPTIONS.map(o => o.key) as [string, ...string[]]), enabled: z.boolean() }).parse({ id, key, enabled });
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "StoreLineNotificationRecipient" WHERE id = ${id} AND "storeId" = ${storeId} FOR UPDATE`;
      const recipient = await tx.storeLineNotificationRecipient.findFirst({ where: { id, storeId } });
      if (!recipient) throw new AppError("NOT_FOUND", "找不到通知人員");
      if (enabled && (!recipient.isActive || !recipient.lineUserId)) throw new AppError("BUSINESS_RULE", "請先綁定 LINE 並開啟接收通知");
      const preferences = managerPreferences(recipient.preferences, recipient.sameDayBookingEnabled);
      await tx.storeLineNotificationRecipient.update({ where: { id }, data: {
        preferences: { ...preferences, [key]: enabled },
        ...(key === "sameDay" ? { sameDayBookingEnabled: enabled } : {}),
      } });
    });
    revalidatePath("/dashboard/reminders");
    revalidatePath("/dashboard/courses/reminders");
    return { success: true, data: undefined };
  } catch (error) { return handleActionError(error); }
}
