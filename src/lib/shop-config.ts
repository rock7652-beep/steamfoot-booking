/**
 * 店家設定 — Server-side helper
 *
 * ShopConfig 表用於非方案設定（如 dutySchedulingEnabled）。
 * 方案來源為 Store.plan (PricingPlan)。
 */

import { prisma } from "@/lib/db";
import { PLAN_LIMITS } from "@/lib/feature-flags";
import { DEFAULT_STORE_ID } from "@/lib/store";
import type { PricingPlan } from "@prisma/client";

// ============================================================
// 店舖方案讀取（Source of truth: Store.plan）
// ============================================================

/** 取得 Store.plan（唯一真相）。storeId 為空時使用 DEFAULT_STORE_ID */
async function getStorePlan(storeId?: string | null): Promise<PricingPlan> {
  const sid = storeId || DEFAULT_STORE_ID;
  const store = await prisma.store.findUnique({
    where: { id: sid },
    select: { plan: true },
  });
  return store?.plan ?? "EXPERIENCE";
}

// ============================================================
// 非方案設定（dutySchedulingEnabled 等）
// ============================================================

const SYSTEM_DEFAULTS = {
  shopName: "蒸足",
  dutySchedulingEnabled: false,
} as const;

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

  return {
    id: "system-default",
    storeId: sid,
    shopName: SYSTEM_DEFAULTS.shopName,
    dutySchedulingEnabled: SYSTEM_DEFAULTS.dutySchedulingEnabled,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ============================================================
// 體驗版（EXPERIENCE）使用限制 — 統一進度查詢
// Source of truth: Store.plan
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

const TRIAL_DAYS = 14;

/** 取得 EXPERIENCE 方案完整試用狀態（讀 Store.plan） */
export async function getTrialStatus(storeId?: string | null): Promise<TrialStatus> {
  const sid = storeId || DEFAULT_STORE_ID;
  const plan = await getStorePlan(sid);

  if (plan !== "EXPERIENCE") {
    return {
      isFree: false,
      daysRemaining: Infinity,
      trialDays: TRIAL_DAYS,
      trialExpired: false,
      customers: { current: 0, limit: Infinity, pct: 0 },
      bookings: { current: 0, limit: Infinity, pct: 0 },
      overallPct: 0,
      stage: "normal",
      canCreateBooking: true,
      canCreateCustomer: true,
    };
  }

  const limits = PLAN_LIMITS.EXPERIENCE;
  const maxCustomers = limits.maxCustomers ?? 100;
  const maxBookings = limits.maxMonthlyBookings ?? 100;

  // 取 ShopConfig.createdAt 作為 trial 起算日（建店日期）
  const config = await prisma.shopConfig.findUnique({
    where: { storeId: sid },
    select: { createdAt: true },
  });
  const createdAt = config?.createdAt ?? new Date();

  const now = new Date();
  const trialEnd = new Date(createdAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const msRemaining = trialEnd.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
  const trialExpired = daysRemaining === 0;
  const daysPct = Math.round(((TRIAL_DAYS - daysRemaining) / TRIAL_DAYS) * 100);

  const [customerCount, bookingCount] = await Promise.all([
    prisma.customer.count({ where: { storeId: sid } }),
    prisma.booking.count({ where: { storeId: sid } }),
  ]);

  const customerPct = Math.round((customerCount / maxCustomers) * 100);
  const bookingPct = Math.round((bookingCount / maxBookings) * 100);

  const overallPct = Math.max(daysPct, customerPct, bookingPct);

  let stage: TrialStatus["stage"] = "normal";
  if (overallPct >= 100 || trialExpired) stage = "blocked";
  else if (overallPct >= 80) stage = "warning";
  else if (overallPct >= 60) stage = "light";

  const customerBlocked = trialExpired || customerCount >= maxCustomers;
  const bookingBlocked = trialExpired || bookingCount >= maxBookings;

  return {
    isFree: true,
    daysRemaining,
    trialDays: TRIAL_DAYS,
    trialExpired,
    customers: { current: customerCount, limit: maxCustomers, pct: customerPct },
    bookings: { current: bookingCount, limit: maxBookings, pct: bookingPct },
    overallPct,
    stage,
    canCreateBooking: !bookingBlocked,
    canCreateCustomer: !customerBlocked,
  };
}

// ============================================================
// 個別限制檢查（供 server actions 使用）
// Source of truth: Store.plan
// ============================================================

export async function checkCustomerLimit(storeId?: string | null): Promise<{ allowed: boolean; current: number; limit: number }> {
  const sid = storeId || DEFAULT_STORE_ID;
  const plan = await getStorePlan(sid);
  if (plan !== "EXPERIENCE") return { allowed: true, current: 0, limit: Infinity };

  const limits = PLAN_LIMITS.EXPERIENCE;
  const maxCustomers = limits.maxCustomers ?? 100;

  const config = await getShopConfig(sid);
  const trialExpired = isTrialExpired(config.createdAt);
  if (trialExpired) return { allowed: false, current: 0, limit: 0 };

  const current = await prisma.customer.count({ where: { storeId: sid } });
  return {
    allowed: current < maxCustomers,
    current,
    limit: maxCustomers,
  };
}

export async function checkBookingLimit(storeId?: string | null): Promise<{ allowed: boolean; current: number; limit: number }> {
  const sid = storeId || DEFAULT_STORE_ID;
  const plan = await getStorePlan(sid);
  if (plan !== "EXPERIENCE") return { allowed: true, current: 0, limit: Infinity };

  const limits = PLAN_LIMITS.EXPERIENCE;
  const maxBookings = limits.maxMonthlyBookings ?? 100;

  const config = await getShopConfig(sid);
  const trialExpired = isTrialExpired(config.createdAt);
  if (trialExpired) return { allowed: false, current: 0, limit: 0 };

  const current = await prisma.booking.count({ where: { storeId: sid } });
  return {
    allowed: current < maxBookings,
    current,
    limit: maxBookings,
  };
}

function isTrialExpired(createdAt: Date): boolean {
  const trialEnd = new Date(createdAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  return new Date() >= trialEnd;
}
