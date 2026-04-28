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
import { CACHE_TAGS } from "@/lib/cache-tags";
import {
  computeMonthScheduleSummary,
  type MonthSummary,
} from "@/lib/business-hours-resolver";
import { getShopConfig, getTrialStatus } from "@/lib/shop-config";
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
  { revalidate: 60, tags: [CACHE_TAGS.storePlan] },
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
    { revalidate: 60, tags: [CACHE_TAGS.plans] },
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
  { revalidate: 60, tags: [CACHE_TAGS.staff] },
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
  { revalidate: 60, tags: [CACHE_TAGS.storePlan] },
);

/**
 * 快取 ShopConfig — 60s TTL，tag: "shop-config"
 * 設定 / 預約 / dashboard layout 都會讀，每次都打 DB 浪費。
 * mutation 路徑：revalidateShopConfig() 失效。
 */
export const getCachedShopConfig = unstable_cache(
  async (storeId?: string | null) => {
    return getShopConfig(storeId);
  },
  ["shop-config"],
  { revalidate: 60, tags: [CACHE_TAGS.shopConfig] },
);

/**
 * 快取每週固定營業時間 — 60s TTL，tag: "business-hours"
 * 設定頁 / 預約頁 / 顧客 /book 都會讀。
 * mutation 路徑：revalidateBusinessHours() 失效。
 */
export const getCachedBusinessHours = unstable_cache(
  async (storeId: string) => {
    return prisma.businessHours.findMany({
      where: { storeId },
      orderBy: { dayOfWeek: "asc" },
    });
  },
  ["business-hours-by-store"],
  { revalidate: 60, tags: [CACHE_TAGS.businessHours] },
);

/**
 * 快取整月排班摘要 — 60s TTL，tag: business-hours + special-days
 *
 * key 自動含 (storeId, year, month)。多個 admin 同時看同一店的同一月，
 * 第一個進來的人付出整月解析的成本，60s 內後續所有 request 直接從 cache 拿。
 *
 * 失效路徑（涵蓋所有可能改動該月顯示的 mutation）：
 * - revalidateBusinessHours：updateTag("business-hours") + updateTag("special-days")
 * - revalidateSpecialDays：updateTag("special-days")
 * 兩個 tag 都加，確保 BusinessHours / SpecialBusinessDay / SlotOverride
 * 任一改動都會清掉這份月份摘要 cache。
 */
export function getCachedMonthScheduleSummary(
  storeId: string,
  year: number,
  month: number,
): Promise<MonthSummary> {
  return unstable_cache(
    async () => computeMonthScheduleSummary(storeId, year, month),
    [`month-schedule-summary-${storeId}-${year}-${month}`],
    {
      revalidate: 60,
      tags: [CACHE_TAGS.businessHours, CACHE_TAGS.specialDays],
    },
  )();
}

/**
 * 快取獎勵項目（後台管理用） — 60s TTL，tag: "bonus-rules"
 * mutation 路徑：revalidateBonusRules() 失效。
 */
export const getCachedBonusRules = unstable_cache(
  async (storeId: string) => {
    return prisma.bonusRule.findMany({
      where: { storeId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        points: true,
        description: true,
        isActive: true,
        startDate: true,
        endDate: true,
        sortOrder: true,
      },
    });
  },
  ["bonus-rules-by-store"],
  { revalidate: 60, tags: [CACHE_TAGS.bonusRules] },
);
