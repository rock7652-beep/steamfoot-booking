"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { assertStoreAccess } from "@/lib/manager-visibility";
import { AppError, handleActionError } from "@/lib/errors";
import { unlinkCustomerLine } from "@/server/services/customer-line-unlink";
import type { ActionResult } from "@/types";

export async function unlinkLineAccount(customerId: string): Promise<ActionResult<void>> {
  try {
    const actor = await requirePermission("customer.identity.rebind");
    if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "僅限負責人或管理員解除 LINE 綁定");
    }
    const customer = await prisma.customer.findUnique({
      where: { id: customerId }, select: { id: true, storeId: true, mergedIntoCustomerId: true },
    });
    if (!customer || customer.mergedIntoCustomerId) throw new AppError("NOT_FOUND", "顧客不存在");
    assertStoreAccess(actor, customer.storeId);
    await unlinkCustomerLine({ customerId, storeId: customer.storeId, actorUserId: actor.id });
    revalidatePath(`/dashboard/customers/${customerId}`);
    revalidatePath("/dashboard/customers");
    return { success: true, data: undefined };
  } catch (error) {
    return handleActionError(error);
  }
}
