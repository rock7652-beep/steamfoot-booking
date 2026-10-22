import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { FEATURES, hasFeature, type FeatureKey } from "@/lib/feature-flags";
import { resolveEffectiveEntitlement, type FeatureEntitlementOverride, type FeaturePresentationState } from "@/lib/effective-entitlement";
import { resolveCourseSharedCardState } from "@/lib/course-shared-card-policy";
import { inventoryFeatureAllowed } from "@/lib/inventory-feature-access";
import { isSpaDemoStoreId } from "@/lib/spa-demo-store";

/** Presentation only. Two fresh queries, shared only inside one React server request.
 * Mutations continue to use their original feature gates and transaction checks.
 */
export const getStoreFeaturePresentations = cache(async (storeId: string): Promise<Record<FeatureKey, FeaturePresentationState>> => {
  const [store, rows] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId }, select: { plan: true, industryModule: true } }),
    prisma.storeFeatureEntitlement.findMany({ where: { storeId }, select: { featureKey: true, status: true, startsAt: true, expiresAt: true } }),
  ]);
  const demo = isSpaDemoStoreId(storeId);
  if (!store && !demo) throw new Error("Store not found");
  const plan = demo ? "ALLIANCE" : store!.plan;
  const now = new Date();
  const grants = new Map<string, FeatureEntitlementOverride>(rows.map(row => [row.featureKey, row]));
  const active = (grant: FeatureEntitlementOverride | undefined) => grant
    && (!grant.startsAt || grant.startsAt <= now) && (!grant.expiresAt || grant.expiresAt >= now) ? grant : null;

  return Object.fromEntries(Object.values(FEATURES).map(feature => {
    const raw = grants.get(feature), grant = active(raw);
    let state: FeaturePresentationState;
    if (feature === FEATURES.STORE_OPERATION_AUDIT) {
      // Audit expiry is exclusive, matching the uncached authorization policy.
      state = grant?.status === "ENABLED" && (!grant.expiresAt || grant.expiresAt > now) ? "ENABLED" : "HIDDEN";
    } else if (feature === FEATURES.SHARED_CARD) {
      state = resolveCourseSharedCardState({ industryModule: store?.industryModule ?? "STEAMFOOT", music: grants.get("business.music")?.status === "ENABLED", entitlement: raw ?? null }, now);
    } else if (feature === FEATURES.WORK_ORDERS) {
      state = resolveEffectiveEntitlement(hasFeature(plan, feature), grant, now).enabled ? "ENABLED" : "HIDDEN";
    } else if (feature === FEATURES.INVENTORY) {
      state = inventoryFeatureAllowed(plan, grant, now) ? "ENABLED" : "HIDDEN";
    } else if (demo) {
      state = "ENABLED";
    } else if (grant?.status === "HIDDEN") {
      state = "HIDDEN";
    } else {
      const enabled = grant?.status === "LOCKED" ? false
        : grant?.status === "ENABLED" ? true
        : plan === "EXPERIENCE" ? true
        : feature === FEATURES.FRONTEND_PREVIEW ? false
        : resolveEffectiveEntitlement(hasFeature(plan, feature), grant, now).enabled;
      state = enabled ? "ENABLED" : "LOCKED";
    }
    return [feature, state];
  })) as Record<FeatureKey, FeaturePresentationState>;
});
