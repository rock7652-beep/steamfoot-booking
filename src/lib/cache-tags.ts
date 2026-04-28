/**
 * 共用 cache tag 常數
 *
 * 純常數檔 — 不可 import next/cache 或任何 server-only 模組。
 *
 * 為什麼存在這個檔？
 *   permissions.ts 會被 proxy.ts (middleware) 與 customer error.tsx (client)
 *   間接 import。若 permissions.ts 直接 import revalidation.ts，
 *   `revalidatePath` / `updateTag` 會被連帶拉進 middleware / client bundle，
 *   build 會失敗（"This API is only available in Server Components"）。
 *
 *   所以 tag 字串集中在這個 pure file：
 *   - revalidation.ts（server action 用）import 後呼叫 updateTag()
 *   - query-cache.ts（server-only 快取層）import 後傳給 unstable_cache
 *   - permissions.ts（被 middleware/client transitively import）也只 import 此檔
 *
 *   常數共用避免 typo（eg. "staff-permissions" vs "staff_permissions"）造成
 *   失效失靈。
 */

export const CACHE_TAGS = {
  /** Store.plan / 試用狀態 */
  storePlan: "store-plan",
  /** 升級申請 */
  upgradeRequests: "upgrade-requests",
  /** ShopConfig（值班開關、銀行資訊等） */
  shopConfig: "shop-config",
  /** 每週固定營業時間 */
  businessHours: "business-hours",
  /** 特殊日期（公休 / 訓練 / 自訂） */
  specialDays: "special-days",
  /** 值班排班 toggle */
  dutyScheduling: "duty-scheduling",
  /** 預約 summary（月曆等） */
  bookingsSummary: "bookings-summary",
  /** 店家報表（含交易） */
  reportStore: "report-store",
  /** 服務方案 */
  plans: "plans",
  /** 員工 */
  staff: "staff",
  /** 員工權限（StaffPermission 表） */
  staffPermissions: "staff-permissions",
  /** 獎勵項目 */
  bonusRules: "bonus-rules",
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];
