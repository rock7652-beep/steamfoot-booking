import { resolveCourseSharedCardState } from "@/lib/course-shared-card-policy";
/**
 * Feature Gate — Server-side 功能閘門
 *
 * 用於 server component / server action 中檢查當前 store 的功能是否開通。
 * 不通過會 throw AppError("FORBIDDEN")，進入 error.tsx 顯示升級提示。
 */

import {cache} from "react";
import {sportsNativePreview} from "@/lib/sports-native-preview";
import { inventoryFeatureAllowed } from "@/lib/inventory-feature-access";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { AppError } from "@/lib/errors";
import { resolveEffectiveEntitlement, type FeaturePresentationState, type FeatureEntitlementOverride } from "@/lib/effective-entitlement";
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

const previewEntitlements=cache((storeId:string)=>prisma.storeFeatureEntitlement.findMany({where:{storeId},select:{featureKey:true,status:true,startsAt:true,expiresAt:true}}));

export async function getActiveStoreFeatureEntitlement(
  storeId: string,
  feature: FeatureKey,
  now: Date = new Date(),
): Promise<StoreFeatureEntitlementFields | null> {
  if (!isFeatureKey(feature)) return null;

  const entitlement = sportsNativePreview(storeId)?(await previewEntitlements(storeId)).find(row=>row.featureKey===feature)??null:await getCachedStoreFeatureEntitlement(storeId, feature);
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
  if (feature === FEATURES.STORE_OPERATION_AUDIT) {
    const { isStoreOperationAuditEnabled } = await import("@/server/services/store-operation-audit-access");
    return isStoreOperationAuditEnabled(storeId);
  }
  // Sports-only eligibility and explicit controls precede demo/trial shortcuts.
  if (feature === FEATURES.SHARED_CARD) {
    const { getCourseSharedCardState } = await import("@/server/services/course-shared-card");
    return await getCourseSharedCardState(storeId) === "ENABLED";
  }
  if (feature === FEATURES.WORK_ORDERS) {
    const [store, grant] = await Promise.all([getStoreForPlanByStoreId(storeId), getActiveStoreFeatureEntitlement(storeId, feature)]);
    return resolveEffectiveEntitlement(hasFeature(store.plan, feature), grant).enabled;
  }
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
      feature === FEATURES.INVENTORY || feature === FEATURES.WORK_ORDERS
        ? "此功能需額外加購，請聯絡總部確認與開通"
        : "此功能尚未開通，請聯絡總部加購或升級方案",
    );
  }
}

/** 檢查當前 store 是否有某功能，不通過則 throw */
export async function checkCurrentStoreFeature(feature: FeatureKey): Promise<StorePlanFields> {
  const store = await getCurrentStoreForPlan();
  if (store.id === "__all__" && feature === FEATURES.SHARED_CARD) throw new AppError("FORBIDDEN", "請先選擇運動門市");
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
  return store.id === "__all__" ? feature !== FEATURES.SHARED_CARD : hasStoreFeature(store.id, feature);
}

/** Shares the same entitlement dates and effective authorization as server actions. */
export async function getStoreFeaturePresentation(storeId: string, feature: FeatureKey): Promise<FeaturePresentationState> {
  if (!isFeatureKey(feature)) return "HIDDEN";
  if (feature === FEATURES.STORE_OPERATION_AUDIT) return await hasStoreFeature(storeId, feature) ? "ENABLED" : "HIDDEN";
  if (feature === FEATURES.SHARED_CARD) {
    const { getCourseSharedCardState } = await import("@/server/services/course-shared-card");
    return getCourseSharedCardState(storeId);
  }
  if(feature===FEATURES.WORK_ORDERS){
    const [store,grant]=await Promise.all([getStoreForPlanByStoreId(storeId),getActiveStoreFeatureEntitlement(storeId,feature)]);
    const resolution=resolveEffectiveEntitlement(hasFeature(store.plan,feature),grant);
    return resolution.enabled ? "ENABLED" : "HIDDEN";
  }
  if (feature === FEATURES.INVENTORY) return await hasStoreFeature(storeId,feature) ? "ENABLED" : "HIDDEN";
  if (isSpaDemoStoreId(storeId)) return "ENABLED";
  const entitlement = await getActiveStoreFeatureEntitlement(storeId, feature);
  if (entitlement?.status === "HIDDEN") return "HIDDEN";
  return await hasStoreFeature(storeId, feature) ? "ENABLED" : "LOCKED";
}

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

/** Read-only server components may share the same fresh presentation snapshot.
 * Never use this helper instead of mutation feature/transaction checks.
 */
export async function isStoreFeatureEnabledForRead(storeId: string, feature: FeatureKey): Promise<boolean> {
  return (await getStoreFeaturePresentations(storeId))[feature] === "ENABLED";
}
