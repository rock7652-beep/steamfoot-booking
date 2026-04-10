/**
 * 店家設定 — Server-side helper
 *
 * 從 DB 讀取 ShopConfig，提供給 layout / server actions 使用
 */

import { prisma } from "@/lib/db";
import type { ShopPlan } from "@prisma/client";
import { hasFeature, FREE_LIMITS, type Feature } from "@/lib/shop-plan";

/** 取得目前店家方案（快取友好，讀單筆） */
export async function getShopPlan(): Promise<ShopPlan> {
  const config = await prisma.shopConfig.findUnique({
    where: { id: "default" },
    select: { plan: true },
  });
  return config?.plan ?? "FREE";
}

/** 值班排班聯動是否啟用 */
export async function isDutySchedulingEnabled(): Promise<boolean> {
  const config = await prisma.shopConfig.findUnique({
    where: { id: "default" },
    select: { dutySchedulingEnabled: true },
  });
  return config?.dutySchedulingEnabled ?? false;
}

/** 取得完整店家設定 */
export async function getShopConfig() {
  const config = await prisma.shopConfig.findUnique({
    where: { id: "default" },
  });
  return config ?? { id: "default", shopName: "蒸足", plan: "FREE" as ShopPlan, dutySchedulingEnabled: false, createdAt: new Date(), updatedAt: new Date() };
}

/**
 * 後端功能檢查 — 用於 server actions
 * 若功能未開放，拋出 AppError
 */
export async function requireFeature(feature: Feature) {
  const { AppError } = await import("@/lib/errors");
  const plan = await getShopPlan();
  if (!hasFeature(plan, feature)) {
    throw new AppError("FORBIDDEN", "此功能需要升級方案才能使用");
  }
  return plan;
}

// ============================================================
// 體驗版（FREE）使用限制 — 統一進度查詢
// ============================================================

export interface TrialStatus {
  /** 是否為 FREE 方案 */
  isFree: boolean;
  /** 體驗期剩餘天數（0 = 已到期） */
  daysRemaining: number;
  /** 體驗期總天數 */
  trialDays: number;
  /** 體驗期是否已到期 */
  trialExpired: boolean;
  /** 顧客使用狀況 */
  customers: { current: number; limit: number; pct: number };
  /** 預約使用狀況（總數） */
  bookings: { current: number; limit: number; pct: number };
  /** 整體使用率（取三者最高） */
  overallPct: number;
  /** 階段：normal / light / warning / blocked */
  stage: "normal" | "light" | "warning" | "blocked";
  /** 是否允許新增（任一維度達上限即封鎖） */
  canCreateBooking: boolean;
  canCreateCustomer: boolean;
}

/** 取得 FREE 方案完整試用狀態 */
export async function getTrialStatus(): Promise<TrialStatus> {
  const config = await getShopConfig();

  if (config.plan !== "FREE") {
    return {
      isFree: false,
      daysRemaining: Infinity,
      trialDays: FREE_LIMITS.trialDays,
      trialExpired: false,
      customers: { current: 0, limit: Infinity, pct: 0 },
      bookings: { current: 0, limit: Infinity, pct: 0 },
      overallPct: 0,
      stage: "normal",
      canCreateBooking: true,
      canCreateCustomer: true,
    };
  }

  // 計算體驗期
  const now = new Date();
  const createdAt = config.createdAt;
  const trialEnd = new Date(createdAt.getTime() + FREE_LIMITS.trialDays * 24 * 60 * 60 * 1000);
  const msRemaining = trialEnd.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
  const trialExpired = daysRemaining === 0;
  const daysPct = Math.round(((FREE_LIMITS.trialDays - daysRemaining) / FREE_LIMITS.trialDays) * 100);

  // 計算顧客 / 預約數
  const [customerCount, bookingCount] = await Promise.all([
    prisma.customer.count(),
    prisma.booking.count(),
  ]);

  const customerPct = Math.round((customerCount / FREE_LIMITS.maxCustomers) * 100);
  const bookingPct = Math.round((bookingCount / FREE_LIMITS.maxBookings) * 100);

  const overallPct = Math.max(daysPct, customerPct, bookingPct);

  // 階段判定
  let stage: TrialStatus["stage"] = "normal";
  if (overallPct >= 100 || trialExpired) stage = "blocked";
  else if (overallPct >= 80) stage = "warning";
  else if (overallPct >= 60) stage = "light";

  const customerBlocked = trialExpired || customerCount >= FREE_LIMITS.maxCustomers;
  const bookingBlocked = trialExpired || bookingCount >= FREE_LIMITS.maxBookings;

  return {
    isFree: true,
    daysRemaining,
    trialDays: FREE_LIMITS.trialDays,
    trialExpired,
    customers: { current: customerCount, limit: FREE_LIMITS.maxCustomers, pct: customerPct },
    bookings: { current: bookingCount, limit: FREE_LIMITS.maxBookings, pct: bookingPct },
    overallPct,
    stage,
    canCreateBooking: !bookingBlocked,
    canCreateCustomer: !customerBlocked,
  };
}

// ============================================================
// 個別限制檢查（供 server actions 使用）
// ============================================================

/**
 * FREE 方案限制檢查 — 顧客數
 */
export async function checkCustomerLimit(): Promise<{ allowed: boolean; current: number; limit: number }> {
  const plan = await getShopPlan();
  if (plan !== "FREE") return { allowed: true, current: 0, limit: Infinity };

  const config = await getShopConfig();
  const trialExpired = isTrialExpired(config.createdAt);
  if (trialExpired) return { allowed: false, current: 0, limit: 0 };

  const current = await prisma.customer.count();
  return {
    allowed: current < FREE_LIMITS.maxCustomers,
    current,
    limit: FREE_LIMITS.maxCustomers,
  };
}

/**
 * FREE 方案限制檢查 — 預約數（總數，非月度）
 */
export async function checkBookingLimit(): Promise<{ allowed: boolean; current: number; limit: number }> {
  const plan = await getShopPlan();
  if (plan !== "FREE") return { allowed: true, current: 0, limit: Infinity };

  const config = await getShopConfig();
  const trialExpired = isTrialExpired(config.createdAt);
  if (trialExpired) return { allowed: false, current: 0, limit: 0 };

  const current = await prisma.booking.count();
  return {
    allowed: current < FREE_LIMITS.maxBookings,
    current,
    limit: FREE_LIMITS.maxBookings,
  };
}

/** 判斷體驗期是否已到期 */
function isTrialExpired(createdAt: Date): boolean {
  const trialEnd = new Date(createdAt.getTime() + FREE_LIMITS.trialDays * 24 * 60 * 60 * 1000);
  return new Date() >= trialEnd;
}
