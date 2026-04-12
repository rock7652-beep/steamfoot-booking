/**
 * Feature Gate — Server-side 功能閘門
 *
 * 用於 server component / server action 中檢查當前 store 的功能是否開通。
 * 不通過會 throw AppError("FORBIDDEN")，進入 error.tsx 顯示升級提示。
 */

import { requireFeature, getPlanLimits } from "@/lib/feature-flags";
import { getCurrentStoreForPlan } from "@/lib/store-plan";
import type { FeatureKey, PlanLimits } from "@/lib/feature-flags";
import type { StorePlanFields } from "@/lib/store-plan";

/** 檢查當前 store 是否有某功能，不通過則 throw */
export async function checkCurrentStoreFeature(feature: FeatureKey): Promise<StorePlanFields> {
  const store = await getCurrentStoreForPlan();
  requireFeature(store.plan, feature);
  return store;
}

/** 取得當前 store 的有效用量限制 */
export async function getCurrentStoreLimits(): Promise<PlanLimits> {
  const store = await getCurrentStoreForPlan();
  return getPlanLimits(store);
}
