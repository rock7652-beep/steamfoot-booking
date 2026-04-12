/**
 * Usage Gate — Server-side 用量限制檢查
 *
 * 檢查當前 store 是否超過方案的用量上限。
 * 不通過會 throw AppError("FORBIDDEN")。
 */

import { AppError } from "@/lib/errors";
import { getCurrentStoreLimits } from "@/lib/feature-gate";
import { getCurrentStoreForPlan, type StorePlanFields } from "@/lib/store-plan";
import { getPlanLimits, PRICING_PLAN_INFO } from "@/lib/feature-flags";

/** 檢查員工數量是否超過上限 */
export async function checkStaffLimitOrThrow(currentCount: number): Promise<void> {
  const limits = await getCurrentStoreLimits();
  if (limits.maxStaff !== null && currentCount >= limits.maxStaff) {
    const store = await getCurrentStoreForPlan();
    const label = PRICING_PLAN_INFO[store.plan].label;
    throw new AppError(
      "FORBIDDEN",
      `「${label}」方案最多 ${limits.maxStaff} 位員工，請升級方案`
    );
  }
}

/** 檢查顧客數量是否超過上限 */
export async function checkCustomerLimitOrThrow(currentCount: number): Promise<void> {
  const limits = await getCurrentStoreLimits();
  if (limits.maxCustomers !== null && currentCount >= limits.maxCustomers) {
    const store = await getCurrentStoreForPlan();
    const label = PRICING_PLAN_INFO[store.plan].label;
    throw new AppError(
      "FORBIDDEN",
      `「${label}」方案最多 ${limits.maxCustomers} 位顧客，請升級方案`
    );
  }
}

/** 檢查月度預約數量是否超過上限 */
export async function checkMonthlyBookingLimitOrThrow(currentMonthCount: number): Promise<void> {
  const limits = await getCurrentStoreLimits();
  if (limits.maxMonthlyBookings !== null && currentMonthCount >= limits.maxMonthlyBookings) {
    const store = await getCurrentStoreForPlan();
    const label = PRICING_PLAN_INFO[store.plan].label;
    throw new AppError(
      "FORBIDDEN",
      `「${label}」方案每月最多 ${limits.maxMonthlyBookings} 筆預約，請升級方案`
    );
  }
}

// ============================================================
// 非 session 版本 — 供 cron job / background task 使用
// ============================================================

/**
 * 檢查指定 store 的提醒發送是否超過月度上限
 * 回傳 { allowed, current, limit }（不 throw，讓 caller 決定行為）
 */
export function checkReminderSendLimit(
  store: StorePlanFields,
  currentMonthSendCount: number
): { allowed: boolean; current: number; limit: number | null } {
  const limits = getPlanLimits(store);
  if (limits.maxReminderSends === null) {
    return { allowed: true, current: currentMonthSendCount, limit: null };
  }
  return {
    allowed: currentMonthSendCount < limits.maxReminderSends,
    current: currentMonthSendCount,
    limit: limits.maxReminderSends,
  };
}

/**
 * 檢查指定 store 的報表生成是否超過月度上限
 */
export function checkReportLimit(
  store: StorePlanFields,
  currentMonthCount: number
): { allowed: boolean; current: number; limit: number | null } {
  const limits = getPlanLimits(store);
  if (limits.maxMonthlyReports === null) {
    return { allowed: true, current: currentMonthCount, limit: null };
  }
  return {
    allowed: currentMonthCount < limits.maxMonthlyReports,
    current: currentMonthCount,
    limit: limits.maxMonthlyReports,
  };
}
