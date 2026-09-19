"use server";
import { courseMember } from "@/server/services/course-access";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { createReferralEvent } from "@/server/services/referral-events";

/** Actor and store come from the fixed course account link, never supplied customer IDs. */
export async function trackCourseShare(input: { source: string }): Promise<void> {
  try {
    const { customer, storeId } = await courseMember();
    await requireStoreFeature(storeId, FEATURES.REFERRAL_SHARE);
    await createReferralEvent({ storeId, referrerId: customer.id, type: "SHARE", source: typeof input.source === "string" ? input.source.slice(0, 100) : "course-member" });
  } catch { /* Sharing remains usable when an analytics write fails. */ }
}
