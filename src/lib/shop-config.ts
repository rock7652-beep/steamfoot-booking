/**
 * 店家設定 — Server-side helper
 *
 * 從 DB 讀取 ShopConfig，提供給 layout / server actions 使用
 */

import { prisma } from "@/lib/db";
import type { ShopPlan } from "@prisma/client";
import { hasFeature, FREE_LIMITS, type Feature } from "@/lib/shop-plan";
import { toLocalMonthStr } from "@/lib/date-utils";

/** 取得目前店家方案（快取友好，讀單筆） */
export async function getShopPlan(): Promise<ShopPlan> {
  const config = await prisma.shopConfig.findUnique({
    where: { id: "default" },
    select: { plan: true },
  });
  return config?.plan ?? "FREE";
}

/** 取得完整店家設定 */
export async function getShopConfig() {
  const config = await prisma.shopConfig.findUnique({
    where: { id: "default" },
  });
  return config ?? { id: "default", shopName: "蒸足", plan: "FREE" as ShopPlan, createdAt: new Date(), updatedAt: new Date() };
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

/**
 * FREE 方案限制檢查 — 顧客數
 */
export async function checkCustomerLimit(): Promise<{ allowed: boolean; current: number; limit: number }> {
  const plan = await getShopPlan();
  if (plan !== "FREE") return { allowed: true, current: 0, limit: Infinity };

  const current = await prisma.customer.count();
  return {
    allowed: current < FREE_LIMITS.maxCustomers,
    current,
    limit: FREE_LIMITS.maxCustomers,
  };
}

/**
 * FREE 方案限制檢查 — 本月預約數
 */
export async function checkBookingLimit(): Promise<{ allowed: boolean; current: number; limit: number }> {
  const plan = await getShopPlan();
  if (plan !== "FREE") return { allowed: true, current: 0, limit: Infinity };

  const monthStr = toLocalMonthStr();
  const [year, month] = monthStr.split("-").map(Number);
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0));

  const current = await prisma.booking.count({
    where: {
      bookingDate: { gte: startDate, lte: endDate },
    },
  });

  return {
    allowed: current < FREE_LIMITS.maxMonthlyBookings,
    current,
    limit: FREE_LIMITS.maxMonthlyBookings,
  };
}
