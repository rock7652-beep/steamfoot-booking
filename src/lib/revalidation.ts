/**
 * 集中管理快取失效邏輯
 *
 * 所有 server action mutation 應使用此模組的 helper，
 * 確保 unstable_cache tags + 路由都正確失效。
 *
 * Next.js 16: updateTag() 限 server action 內呼叫（read-your-own-writes）
 */

import { revalidatePath, updateTag } from "next/cache";

// ── 營業時間（週設定 + 時段） ──────────────────────────

/** 更新每週固定營業時間後呼叫 */
export function revalidateBusinessHours() {
  updateTag("business-hours");
  updateTag("special-days");
  revalidatePath("/dashboard/settings/hours");
  revalidatePath("/dashboard/duty");
  revalidatePath("/book");
}

/** 更新特殊日期（公休 / 訓練 / 自訂）後呼叫 */
export function revalidateSpecialDays() {
  updateTag("special-days");
  revalidatePath("/dashboard/settings/hours");
  revalidatePath("/dashboard/duty");
  revalidatePath("/book");
}

// ── 值班排班 ───────────────────────────────────────────

/** 切換 dutySchedulingEnabled 後呼叫 */
export function revalidateDutyScheduling() {
  updateTag("duty-scheduling");
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
  updateTag("bookings-summary");
  updateTag("report-store");
  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard");
  revalidatePath("/book");
  revalidatePath("/my-bookings");
  revalidatePath("/my-plans");
  if (customerId) revalidatePath(`/dashboard/customers/${customerId}`);
}

// ── 交易 ───────────────────────────────────────────────

/** 交易異動後呼叫 */
export function revalidateTransactions(customerId?: string) {
  updateTag("report-store");
  revalidatePath("/dashboard/transactions");
  if (customerId) revalidatePath(`/dashboard/customers/${customerId}`);
}

// ── 方案 ───────────────────────────────────────────────

/** 方案異動後呼叫 */
export function revalidatePlans() {
  updateTag("plans");
  revalidatePath("/dashboard/plans");
}

// ── 員工 ───────────────────────────────────────────────

/** 員工異動後呼叫 */
export function revalidateStaff() {
  updateTag("staff");
  revalidatePath("/dashboard/staff");
}

// ── 店鋪設定 ──────────────────────────────────────────

/** 店鋪方案異動後呼叫 */
export function revalidateShopConfig() {
  updateTag("shop-config");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings/plan");
}

/** 店舖方案 / 訂閱 / 升級申請變更後呼叫 */
export function revalidateStorePlan() {
  updateTag("store-plan");
  updateTag("upgrade-requests");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings/plan");
  revalidatePath("/dashboard/upgrade-requests");
}
