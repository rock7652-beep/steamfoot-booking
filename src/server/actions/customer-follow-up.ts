"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { assertStoreAccess } from "@/lib/manager-visibility";
import { requireWritablePermission } from "@/lib/permissions";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import type { ActionResult } from "@/types";

const createCustomerFollowUpSchema = z.object({
  customerId: z.string().min(1, "缺少顧客"),
  result: z.enum(["CONTACTED", "NO_ANSWER", "BOOKED", "OTHER"]),
  note: z
    .string()
    .max(500, "備註最多 500 字")
    .optional()
    .nullable()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed.length > 0 ? trimmed : null;
    }),
});

export async function createCustomerFollowUpAction(
  input: z.input<typeof createCustomerFollowUpSchema>,
): Promise<ActionResult<{ followUpId: string }>> {
  try {
    const user = await requireWritablePermission("customer.update");
    const data = createCustomerFollowUpSchema.parse(input);

    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
      select: {
        id: true,
        storeId: true,
        mergedIntoCustomerId: true,
        user: { select: { status: true } },
      },
    });
    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");
    assertStoreAccess(user, customer.storeId);
    if (customer.mergedIntoCustomerId || customer.user?.status === "SUSPENDED") {
      throw new AppError("NOT_FOUND", "顧客不存在");
    }
    await requireStoreFeature(customer.storeId, FEATURES.CUSTOMER_CARE);

    const followUp = await prisma.customerFollowUp.create({
      data: {
        customerId: customer.id,
        storeId: customer.storeId,
        createdByUserId: user.id,
        result: data.result,
        note: data.note,
      },
      select: { id: true },
    });

    revalidatePath("/dashboard/growth");
    revalidatePath("/dashboard/customers");
    revalidatePath(`/dashboard/customers/${customer.id}`);
    return { success: true, data: { followUpId: followUp.id } };
  } catch (e) {
    return handleActionError(e);
  }
}
