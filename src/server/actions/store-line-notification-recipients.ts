"use server";

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
  return storeId;
}

export async function listStoreLineNotificationRecipients() {
  const storeId = await requireStore();
  return prisma.storeLineNotificationRecipient.findMany({
    where: { storeId },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      displayName: true,
      roleLabel: true,
      isActive: true,
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
    return { success: true, data: undefined };
  } catch (error) {
    return handleActionError(error);
  }
}
