/**
 * Feature Gate — Server-side 功能閘門
 *
 * 用於 server component / server action 中檢查當前 store 的功能是否開通。
 * 不通過會 throw AppError("FORBIDDEN")，進入 error.tsx 顯示升級提示。
 */

import { inventoryFeatureAllowed } from "@/lib/inventory-feature-access";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { AppError } from "@/lib/errors";
import { resolveEffectiveEntitlement, type FeaturePresentationState } from "@/lib/effective-entitlement";
import { getPlanLimits, hasFeature, FEATURES } from "@/lib/feature-flags";
import { getCurrentStoreForPlan, getStoreForPlanByStoreId } from "@/lib/store-plan";
import type { FeatureKey, PlanLimits } from "@/lib/feature-flags";
import type { StorePlanFields } from "@/lib/store-plan";
import { isSpaDemoStoreId } from "@/lib/spa-demo-store";

const FEATURE_KEY_SET = new Set<string>(Object.values(FEATURES));

export function isFeatureKey(value: string): value is FeatureKey {
  return FEATURE_KEY_SET.has(value);
}

type StoreFeatureEntitlementFields = {
  status: "ENABLED" | "DISABLED" | "LOCKED" | "HIDDEN";
  startsAt: Date | null;
  expiresAt: Date | null;
};

const getCachedStoreFeatureEntitlement = unstable_cache(
  async (
    storeId: string,
    feature: FeatureKey,
  ): Promise<StoreFeatureEntitlementFields | null> => {
    return prisma.storeFeatureEntitlement.findUnique({
      where: {
        uq_store_feature_entitlement: {
          storeId,
          featureKey: feature,
        },
      },
      select: {
        status: true,
        startsAt: true,
        expiresAt: true,
      },
    });
  },
  ["store-feature-entitlement"],
  { revalidate: 60, tags: [CACHE_TAGS.storeFeatureEntitlements] },
);

export async function getActiveStoreFeatureEntitlement(
  storeId: string,
  feature: FeatureKey,
  now: Date = new Date(),
): Promise<StoreFeatureEntitlementFields | null> {
  if (!isFeatureKey(feature)) return null;

  const entitlement = await getCachedStoreFeatureEntitlement(storeId, feature);
  if (!entitlement) return null;

  if (entitlement.startsAt && entitlement.startsAt > now) return null;
  if (entitlement.expiresAt && entitlement.expiresAt < now) return null;

  return entitlement;
}

export async function hasStoreFeature(
  storeId: string,
  feature: FeatureKey,
): Promise<boolean> {
  if (!isFeatureKey(feature)) return false;
  if (feature === FEATURES.INVENTORY) {
    const [store, grant] = await Promise.all([getStoreForPlanByStoreId(storeId), getActiveStoreFeatureEntitlement(storeId, feature)]);
    return inventoryFeatureAllowed(store.plan, grant);
  }
  if (isSpaDemoStoreId(storeId)) return true;

  const entitlement = await getActiveStoreFeatureEntitlement(storeId, feature);
  // Explicit three-state controls are honored in trials; legacy DISABLED trial rules remain unchanged.
  if (entitlement?.status === "HIDDEN" || entitlement?.status === "LOCKED") return false;
  if (entitlement?.status === "ENABLED") return true;
  const store = await getStoreForPlanByStoreId(storeId);
  if (store.plan === "EXPERIENCE") return true;
  // Full trials include preview; ordinary plans still require an active grant.
  if (feature === FEATURES.FRONTEND_PREVIEW) return false;
  const baseAllowed = hasFeature(store.plan, feature);
  return resolveEffectiveEntitlement(baseAllowed, entitlement).enabled;
}

export async function requireStoreFeature(
  storeId: string,
  feature: FeatureKey,
): Promise<void> {
  const allowed = await hasStoreFeature(storeId, feature);

  if (!allowed) {
    throw new AppError(
      "FORBIDDEN",
      "此功能尚未開通，請聯絡總部加購或升級方案",
    );
  }
}

/** 檢查當前 store 是否有某功能，不通過則 throw */
export async function checkCurrentStoreFeature(feature: FeatureKey): Promise<StorePlanFields> {
  const store = await getCurrentStoreForPlan();
  if (store.id !== "__all__") await requireStoreFeature(store.id, feature);
  return store;
}

/** 取得當前 store 的有效用量限制 */
export async function getCurrentStoreLimits(): Promise<PlanLimits> {
  const store = await getCurrentStoreForPlan();
  return getPlanLimits(store);
}

/**
 * 取得指定 storeId 的有效用量限制 — 不依賴 session。
 *
 * 用途：顧客自助流程需要檢查店舖方案上限，但 session 為 CUSTOMER 不能走
 * `getCurrentStoreLimits`（內含 requireStaffSession）。呼叫端先從 session 拿到
 * storeId 後改用此 helper。
 */
export async function getStoreLimitsByStoreId(storeId: string): Promise<PlanLimits> {
  const store = await getStoreForPlanByStoreId(storeId);
  return getPlanLimits(store);
}

export async function hasCurrentStoreFeature(feature: FeatureKey): Promise<boolean> {
  const store = await getCurrentStoreForPlan();
  return store.id === "__all__" || hasStoreFeature(store.id, feature);
}

/** Shares the same entitlement dates and effective authorization as server actions. */
export async function getStoreFeaturePresentation(storeId: string, feature: FeatureKey): Promise<FeaturePresentationState> {
  if (!isFeatureKey(feature)) return "HIDDEN";
  if (feature === FEATURES.INVENTORY) return await hasStoreFeature(storeId,feature) ? "ENABLED" : "HIDDEN";
  if (isSpaDemoStoreId(storeId)) return "ENABLED";
  const entitlement = await getActiveStoreFeatureEntitlement(storeId, feature);
  if (entitlement?.status === "HIDDEN") return "HIDDEN";
  return await hasStoreFeature(storeId, feature) ? "ENABLED" : "LOCKED";
}
