/**
 * 共用快取查詢
 *
 * 用於跨頁面重複讀取的靜態/低頻資料：
 * - storePlan（Store.plan — 唯一方案真相）
 * - plans（服務方案列表）
 * - staff options（員工選項）
 *
 * 各自帶有 unstable_cache tag，mutation 時由 revalidation.ts 失效。
 */

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { getTrialStatus } from "@/lib/shop-config";
import { getStorePlanById } from "@/lib/store-plan";
import type { PricingPlan } from "@prisma/client";

/**
 * 快取 Store.plan — 60s TTL，tag: "store-plan"
 * Source of truth: Store.plan (PricingPlan)
 *
 * ⚠ storeId 作為函式參數，自動成為 cache key 的一部分，
 *   不同 storeId 會產生獨立的快取條目。
 */
export const getCachedStorePlan = unstable_cache(
  async (storeId?: string): Promise<PricingPlan> => {
    if (!storeId) return "EXPERIENCE";
    return getStorePlanById(storeId);
  },
  ["store-plan"],
  { revalidate: 60, tags: ["store-plan"] },
);


/**
 * 快取 active plans — 60s TTL，tag: "plans"
 * 注意：呼叫端仍需自行做 session 檢查
 */
export function getCachedPlans(storeId: string) {
  return unstable_cache(
    async () => {
      return prisma.servicePlan.findMany({
        where: { storeId, isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
    },
    [`active-plans-${storeId}`],
    { revalidate: 60, tags: ["plans"] },
  )();
}

/**
 * 快取 staff select options — 60s TTL，tag: "staff"
 * 注意：呼叫端仍需自行做 session 檢查
 * storeId 參數自動成為 cache key 一部分（不同店獨立快取）
 */
export const getCachedStaffOptions = unstable_cache(
  async (storeId?: string) => {
    return prisma.staff.findMany({
      where: { status: "ACTIVE", ...(storeId ? { storeId } : {}) },
      select: { id: true, displayName: true },
      orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
    });
  },
  ["staff-options"],
  { revalidate: 60, tags: ["staff"] },
);

/**
 * 快取 trialStatus — 60s TTL，tag: "store-plan"
 * 用於 layout 的試用期狀態顯示
 */
export const getCachedTrialStatus = unstable_cache(
  async (storeId?: string) => {
    return getTrialStatus(storeId);
  },
  ["trial-status"],
  { revalidate: 60, tags: ["store-plan"] },
);
