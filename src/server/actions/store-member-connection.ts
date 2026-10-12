"use server";
import { requirePermission, checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead, resolveWriteStoreId } from "@/lib/store";
import { handleActionError, AppError } from "@/lib/errors";
import { readStoreMemberConnection, approveStoreMemberConnection } from "@/server/services/store-member-connection";

export async function loadMemberConnectionAction(customerId: string) {
  try {
    const actor = await requirePermission("customer.read");
    const storeId = await getActiveStoreForRead(actor);
    if (!storeId) throw new AppError("FORBIDDEN", "請選擇門市");
    return { success: true as const, data: await readStoreMemberConnection(storeId, customerId), canConfirm: await checkPermission(actor.role, actor.staffId, "customer.update") };
  } catch (error) { return handleActionError(error); }
}

export async function approveMemberConnectionAction(requestId: string, customerId: string) {
  try {
    const actor = await requirePermission("customer.update");
    const storeId = await resolveWriteStoreId(actor);
    if (!storeId) throw new AppError("FORBIDDEN", "請選擇門市");
    await approveStoreMemberConnection({ user: actor, storeId }, requestId, customerId);
    return { success: true as const };
  } catch (error) { return handleActionError(error); }
}
