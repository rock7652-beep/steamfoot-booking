"use server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { getActiveStoreForRead, resolveWriteStoreId } from "@/lib/store";
import { AppError, handleActionError } from "@/lib/errors";
import { inventoryContext, inventoryTransactionAccess } from "@/server/services/inventory";

export async function setWorkOrderNotificationEnabled(enabled: boolean) {
  try {
    const actor = await requirePermission("business_hours.manage");
    const storeId = await resolveWriteStoreId(actor);
    if (!storeId || typeof enabled !== "boolean") throw new AppError("VALIDATION", "請確認店家設定");
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id"=${storeId} FOR UPDATE`;
      const access = await inventoryTransactionAccess(tx, { user: actor, storeId });
      if (!access("business_hours.manage")) throw new AppError("FORBIDDEN", "設定權限已撤銷");
      await tx.shopConfig.upsert({ where: { storeId }, create: { storeId, workOrderReadyNotificationEnabled: enabled }, update: { workOrderReadyNotificationEnabled: enabled } });
      await tx.auditLog.create({ data: { actorUserId: actor.id, targetType: "ShopConfig", targetId: storeId, action: "WORK_ORDER_NOTIFICATION_SETTING", afterJson: { enabled } } });
    });
    return { success: true as const };
  } catch (error) { return handleActionError(error); }
}

export async function getWorkOrderNotificationEnabled() {
  const actor = await requirePermission("business_hours.manage");
  const storeId = await getActiveStoreForRead(actor);
  if (!storeId) return false;
  return (await prisma.shopConfig.findUnique({ where: { storeId }, select: { workOrderReadyNotificationEnabled: true } }))?.workOrderReadyNotificationEnabled ?? false;
}

export async function loadWorkOrderNotification(orderId: string) {
  try {
    const ctx = await inventoryContext("work_order.read");
    const event = await prisma.workOrderReadyNotification.findFirst({ where: { storeId: ctx.storeId, orderId }, select: { status: true, sentAt: true, lastAttemptAt: true, errorMessage: true } });
    return { success: true as const, data: event ? { ...event, sentAt: event.sentAt?.toISOString() ?? null, lastAttemptAt: event.lastAttemptAt?.toISOString() ?? null } : null };
  } catch (error) { return handleActionError(error); }
}
