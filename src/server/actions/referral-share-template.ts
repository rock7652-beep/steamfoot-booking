"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { requirePermission } from "@/lib/permissions";
import {
  REFERRAL_SHARE_TEMPLATE_MAX_LENGTH,
  ReferralShareTemplateValidationError,
  normalizeReferralShareTemplate,
} from "@/lib/referral-share-template";
import { revalidateShopConfig } from "@/lib/revalidation";
import { resolveWriteStoreId } from "@/lib/store";
import type { ActionResult } from "@/types";
import { revalidatePath } from "next/cache";

const inputSchema = z.object({
  referralShareTemplate: z
    .string()
    .max(
      REFERRAL_SHARE_TEMPLATE_MAX_LENGTH,
      `推薦分享文案不可超過 ${REFERRAL_SHARE_TEMPLATE_MAX_LENGTH} 個字元`,
    )
    .nullable(),
});

/**
 * Save only to the authenticated operator's writable store.
 * Client-supplied storeId is intentionally ignored/stripped.
 */
export async function updateReferralShareTemplate(
  input: unknown,
): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("plans.edit");
    const storeId = await resolveWriteStoreId(user);
    const data = inputSchema.parse(input);

    let referralShareTemplate: string | null;
    try {
      referralShareTemplate = normalizeReferralShareTemplate(
        data.referralShareTemplate,
      );
    } catch (error) {
      if (error instanceof ReferralShareTemplateValidationError) {
        throw new AppError("VALIDATION", error.message);
      }
      throw error;
    }

    await prisma.shopConfig.upsert({
      where: { storeId },
      create: { storeId, referralShareTemplate },
      update: { referralShareTemplate },
    });

    revalidateShopConfig();
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/settings/referral-share");
    return { success: true, data: undefined };
  } catch (error) {
    return handleActionError(error);
  }
}
