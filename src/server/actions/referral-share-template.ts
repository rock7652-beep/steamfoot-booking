"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { requirePermission } from "@/lib/permissions";
import { revalidateShopConfig } from "@/lib/revalidation";
import { validateReferralShareTemplate } from "@/lib/share";
import { resolveWriteStoreId } from "@/lib/store";
import type { ActionResult } from "@/types";

const updateReferralShareTemplateSchema = z.object({
  template: z.string().nullable(),
});

/**
 * PR 3-A backend write boundary.
 * Store identity is derived from the authenticated staff context, never from client input.
 * null / blank resets the store to the system fallback.
 */
export async function updateReferralShareTemplate(
  input: z.infer<typeof updateReferralShareTemplateSchema>,
): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("plans.edit");
    const storeId = await resolveWriteStoreId(user);
    const { template } = updateReferralShareTemplateSchema.parse(input);
    const validation = validateReferralShareTemplate(template);

    if (!validation.ok) {
      throw new AppError("VALIDATION", validation.error);
    }

    await prisma.shopConfig.upsert({
      where: { storeId },
      create: {
        storeId,
        referralShareTemplate: validation.template,
      },
      update: {
        referralShareTemplate: validation.template,
      },
    });

    revalidateShopConfig();
    revalidatePath("/dashboard/settings");
    return { success: true, data: undefined };
  } catch (error) {
    return handleActionError(error);
  }
}
