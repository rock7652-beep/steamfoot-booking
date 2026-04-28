/**
 * 集中管理快取失效邏輯
 *
 * 所有 server action mutation 應使用此模組的 helper，
 * 確保 unstable_cache tags + 路由都正確失效。
 *
 * Next.js 16: updateTag() 限 server action 內呼叫（read-your-own-writes）
 *
 * ⚠ 此檔 import 了 next/cache (revalidatePath / updateTag)，**只能在
 *   server action / app router server component 內被 import**。不可被
 *   permissions.ts 等會被 middleware (proxy.ts) 或 client bundle
 *   transitively import 的模組引用，否則 build 會失敗。
 *   tag 字串常數請從 cache-tags.ts 取，避免 typo。
 */

import { revalidatePath, updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";

// ── 營業時間（週設定 + 時段） ──────────────────────────

/** 更新每週固定營業時間後呼叫 */
export function revalidateBusinessHours() {
  updateTag(CACHE_TAGS.businessHours);
  updateTag(CACHE_TAGS.specialDays);
  revalidatePath("/dashboard/settings/hours");
  revalidatePath("/dashboard/duty");
  revalidatePath("/book");
}

/** 更新特殊日期（公休 / 訓練 / 自訂）後呼叫 */
export function revalidateSpecialDays() {
  updateTag(CACHE_TAGS.specialDays);
  revalidatePath("/dashboard/settings/hours");
  revalidatePath("/dashboard/duty");
  revalidatePath("/book");
}

// ── 值班排班 ───────────────────────────────────────────

/** 切換 dutySchedulingEnabled 後呼叫 */
export function revalidateDutyScheduling() {
  updateTag(CACHE_TAGS.dutyScheduling);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/duty");
  revalidatePath("/dashboard/settings/duty");
  revalidatePath("/dashboard/bookings");
  revalidatePath("/book");
}

/** 值班指派異動後呼叫（assignments 未用 unstable_cache，只需 path） */
export function revalidateDuty() {
  revalidatePath("/dashboard/duty");
  revalidatePath("/dashboard/bookings");
  revalidatePath("/book");
}

// ── 預約 ───────────────────────────────────────────────

/** 預約異動後呼叫 */
export function revalidateBookings(customerId?: string) {
  updateTag(CACHE_TAGS.bookingsSummary);
  updateTag(CACHE_TAGS.reportStore);
  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard");
  revalidatePath("/book");
  revalidatePath("/my-bookings");
  revalidatePath("/my-plans");
  if (customerId) revalidatePath(`/dashboard/customers/${customerId}`);
}

// ── 交易 ───────────────────────────────────────────────

/** 交易異動後呼叫（含確認付款 → 顧客方案/預約頁） */
export function revalidateTransactions(customerId?: string) {
  updateTag(CACHE_TAGS.reportStore);
  revalidatePath("/dashboard/transactions");
  revalidatePath("/dashboard/payments");
  revalidatePath("/my-plans");
  revalidatePath("/book");
  if (customerId) revalidatePath(`/dashboard/customers/${customerId}`);
}

// ── 方案 ───────────────────────────────────────────────

/** 方案異動後呼叫 */
export function revalidatePlans() {
  updateTag(CACHE_TAGS.plans);
  revalidatePath("/dashboard/plans");
}

// ── 員工 ───────────────────────────────────────────────

/** 員工異動後呼叫 */
export function revalidateStaff() {
  updateTag(CACHE_TAGS.staff);
  revalidatePath("/dashboard/staff");
}

/** Staff 權限異動後呼叫（清掉 staff-permission-codes cache） */
export function revalidateStaffPermissions() {
  updateTag(CACHE_TAGS.staffPermissions);
}

// ── 獎勵項目 ──────────────────────────────────────────

/** 獎勵項目異動後呼叫 */
export function revalidateBonusRules() {
  updateTag(CACHE_TAGS.bonusRules);
  revalidatePath("/dashboard/bonus-rules");
}

// ── 店鋪設定 ──────────────────────────────────────────

/** 店鋪方案異動後呼叫 */
export function revalidateShopConfig() {
  updateTag(CACHE_TAGS.shopConfig);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings/plan");
}

/** 店舖方案 / 訂閱 / 升級申請變更後呼叫 */
export function revalidateStorePlan() {
  updateTag(CACHE_TAGS.storePlan);
  updateTag(CACHE_TAGS.upgradeRequests);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings/plan");
  revalidatePath("/dashboard/upgrade-requests");
}
