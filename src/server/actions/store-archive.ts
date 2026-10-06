"use server";

import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";
import { AppError, handleActionError } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types";

/** Catalog visibility only: never changes operating status or authorization. */
export async function setStoreArchivedAction(storeId: string, archived: boolean): Promise<ActionResult<void>> {
  try {
    const user = await requireAdminSession();
    await requirePermission("staff.manage");
    if (!storeId || typeof archived !== "boolean") return { success: false, error: "無效的封存設定" };
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(72819401)`;
      const store = await tx.store.findUnique({ where: { id: storeId }, select: { archivedAt: true, isDefault: true } });
      if (!store) throw new AppError("NOT_FOUND", "店舖不存在");
      if (archived && store.isDefault) throw new AppError("BUSINESS_RULE", "預設店舖不可封存");
      if (Boolean(store.archivedAt) === archived) return;
      if (archived && await tx.store.count({ where: { parentStoreId: storeId, archivedAt: null } })) throw new AppError("BUSINESS_RULE", "請先重新安排或封存下層店，再封存此店舖");
      const archivedAt = archived ? new Date() : null;
      await tx.store.update({ where: { id: storeId }, data: { archivedAt } });
      await tx.auditLog.create({ data: {
        actorUserId: user.id, storeId, targetType: "Store", targetId: storeId,
        action: archived ? "ARCHIVE" : "RESTORE", summary: archived ? "封存 HQ 店舖清單" : "還原 HQ 店舖清單",
        beforeJson: { archivedAt: store.archivedAt?.toISOString() ?? null },
        afterJson: { archivedAt: archivedAt?.toISOString() ?? null },
      } });
    });
    revalidatePath("/hq/dashboard", "layout");
    revalidatePath("/dashboard", "layout");
    return { success: true, data: undefined };
  } catch (error) {
    return handleActionError(error);
  }
}
