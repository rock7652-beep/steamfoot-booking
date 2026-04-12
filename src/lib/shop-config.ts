/**
 * 店家設定 — Server-side helper
 *
 * 從 DB 讀取 ShopConfig，提供給 layout / server actions 使用
 *
 * Fallback 規則：
 * 1. 先查指定 storeId 的 config
 * 2. 沒有時回傳系統預設設定（不再綁定特定 store 的 config）
 */

import { prisma } from "@/lib/db";
import type { ShopPlan } from "@prisma/client";
import { hasFeature, FREE_LIMITS, type Feature } from "@/lib/shop-plan";
import { DEFAULT_STORE_ID } from "@/lib/store";

// ============================================================
// 系統預設設定（無 ShopConfig 時的 fallback）
// ============================================================

const SYSTEM_DEFAULTS = {
  shopName: "蒸足",
  plan: "FREE" as ShopPlan,
  dutySchedulingEnabled: false,
} as const;

// ============================================================
// 核心查詢（接受 storeId 參數）
// ============================================================

/** 取得店家方案。storeId 為空時使用 DEFAULT_STORE_ID */
export async function getShopPlan(storeId?: string | null): Promise<ShopPlan> {
  const sid = storeId || DEFAULT_STORE_ID;
  const config = await prisma.shopConfig.findUnique({
    where: { storeId: sid },
    select: { plan: true },
  });
  return config?.plan ?? SYSTEM_DEFAULTS.plan;
}

/** 值班排班聯動是否啟用 */
export async function isDutySchedulingEnabled(storeId?: string | null): Promise<boolean> {
  const sid = storeId || DEFAULT_STORE_ID;
  const config = await prisma.shopConfig.findUnique({
    where: { storeId: sid },
    select: { dutySchedulingEnabled: true },
  });
  return config?.dutySchedulingEnabled ?? SYSTEM_DEFAULTS.dutySchedulingEnabled;
}

/** 取得完整店家設定（含 fallback） */
export async function getShopConfig(storeId?: string | null) {
  const sid = storeId || DEFAULT_STORE_ID;
  const config = await prisma.shopConfig.findUnique({
    where: { storeId: sid },
  });
  if (config) return config;

  // Fallback: 回傳系統預設，不依賴任何特定 store 的 config
  return {
    id: "system-default",
    storeId: sid,
    shopName: SYSTEM_DEFAULTS.shopName,
    plan: SYSTEM_DEFAULTS.plan,
    dutySchedulingEnabled: SYSTEM_DEFAULTS.dutySchedulingEnabled,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * 後端功能檢查 — 用於 server actions
 * 若功能未開放，拋出 AppError
 */
export async function requireFeature(feature: Feature, storeId?: string | null) {
  const { AppError } = await import("@/lib/errors");
  const plan = await getShopPlan(storeId);
  if (!hasFeature(plan, feature)) {
    throw new AppError("FORBIDDEN", "此功能需要升級方案才能使用");
  }
  return plan;
}

// ============================================================
// 體驗版（FREE）使用限制 — 統一進度查詢
// ============================================================

export interface TrialStatus {
  isFree: boolean;
  daysRemaining: number;
  trialDays: number;
  trialExpired: boolean;
  customers: { current: number; limit: number; pct: number };
  bookings: { current: number; limit: number; pct: number };
  overallPct: number;
  stage: "normal" | "light" | "warning" | "blocked";
  canCreateBooking: boolean;
  canCreateCustomer: boolean;
}

/** 取得 FREE 方案完整試用狀態 */
export async function getTrialStatus(storeId?: string | null): Promise<TrialStatus> {
  const sid = storeId || DEFAULT_STORE_ID;
  const config = await getShopConfig(sid);

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

  const now = new Date();
  const createdAt = config.createdAt;
  const trialEnd = new Date(createdAt.getTime() + FREE_LIMITS.trialDays * 24 * 60 * 60 * 1000);
  const msRemaining = trialEnd.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
  const trialExpired = daysRemaining === 0;
  const daysPct = Math.round(((FREE_LIMITS.trialDays - daysRemaining) / FREE_LIMITS.trialDays) * 100);

  const [customerCount, bookingCount] = await Promise.all([
    prisma.customer.count({ where: { storeId: sid } }),
    prisma.booking.count({ where: { storeId: sid } }),
  ]);

  const customerPct = Math.round((customerCount / FREE_LIMITS.maxCustomers) * 100);
  const bookingPct = Math.round((bookingCount / FREE_LIMITS.maxBookings) * 100);

  const overallPct = Math.max(daysPct, customerPct, bookingPct);

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

export async function checkCustomerLimit(storeId?: string | null): Promise<{ allowed: boolean; current: number; limit: number }> {
  const sid = storeId || DEFAULT_STORE_ID;
  const plan = await getShopPlan(sid);
  if (plan !== "FREE") return { allowed: true, current: 0, limit: Infinity };

  const config = await getShopConfig(sid);
  const trialExpired = isTrialExpired(config.createdAt);
  if (trialExpired) return { allowed: false, current: 0, limit: 0 };

  const current = await prisma.customer.count({ where: { storeId: sid } });
  return {
    allowed: current < FREE_LIMITS.maxCustomers,
    current,
    limit: FREE_LIMITS.maxCustomers,
  };
}

export async function checkBookingLimit(storeId?: string | null): Promise<{ allowed: boolean; current: number; limit: number }> {
  const sid = storeId || DEFAULT_STORE_ID;
  const plan = await getShopPlan(sid);
  if (plan !== "FREE") return { allowed: true, current: 0, limit: Infinity };

  const config = await getShopConfig(sid);
  const trialExpired = isTrialExpired(config.createdAt);
  if (trialExpired) return { allowed: false, current: 0, limit: 0 };

  const current = await prisma.booking.count({ where: { storeId: sid } });
  return {
    allowed: current < FREE_LIMITS.maxBookings,
    current,
    limit: FREE_LIMITS.maxBookings,
  };
}

function isTrialExpired(createdAt: Date): boolean {
  const trialEnd = new Date(createdAt.getTime() + FREE_LIMITS.trialDays * 24 * 60 * 60 * 1000);
  return new Date() >= trialEnd;
}
