"use server";

import { z } from "zod";
import { handleActionError } from "@/lib/errors";
import { requirePermission } from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import type { ActionResult } from "@/types";
import { revalidatePath } from "next/cache";
import {
  getReferralTemplatePersonalization,
  recordReferralTemplateUsage,
  setReferralTemplateFavorite,
  type ReferralShareTemplatePersonalization,
} from "@/server/services/referral-share-template-personalization";

const templateIdSchema = z.string().trim().min(1).max(120);
const favoriteSchema = z.object({
  templateId: templateIdSchema,
  favorite: z.boolean(),
});
const usageSchema = z.object({
  templateId: templateIdSchema,
  action: z.enum(["PREVIEW", "APPLY", "SAVE"]),
});

async function authenticatedStoreId(): Promise<string> {
  const user = await requirePermission("plans.edit");
  const storeId = await resolveWriteStoreId(user);
  await requireStoreFeature(storeId, FEATURES.REFERRAL_SHARE);
  return storeId;
}

export async function getReferralTemplatePersonalizationAction(): Promise<
  ActionResult<ReferralShareTemplatePersonalization>
> {
  try {
    const storeId = await authenticatedStoreId();
    const data = await getReferralTemplatePersonalization(storeId);
    return { success: true, data };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function setReferralTemplateFavoriteAction(
  input: unknown,
): Promise<ActionResult<void>> {
  try {
    const storeId = await authenticatedStoreId();
    const data = favoriteSchema.parse(input);
    await setReferralTemplateFavorite({ storeId, ...data });
    revalidatePath("/dashboard/settings/referral-share");
    return { success: true, data: undefined };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function recordReferralTemplateUsageAction(
  input: unknown,
): Promise<ActionResult<void>> {
  try {
    const storeId = await authenticatedStoreId();
    const data = usageSchema.parse(input);
    await recordReferralTemplateUsage({ storeId, ...data });
    revalidatePath("/dashboard/settings/referral-share");
    return { success: true, data: undefined };
  } catch (error) {
    return handleActionError(error);
  }
}
