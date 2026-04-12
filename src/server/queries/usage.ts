/**
 * 店舖用量查詢 — 供方案管理 UI 與 usage gate 使用
 */

import { prisma } from "@/lib/db";
import { getPlanLimits, type PlanLimits } from "@/lib/feature-flags";
import type { PricingPlan } from "@prisma/client";

export interface UsageMetric {
  label: string;
  current: number;
  limit: number | null;
  pct: number;
  status: "normal" | "warning" | "danger" | "unlimited";
}

export interface StoreUsage {
  storeId: string;
  storeName: string;
  plan: PricingPlan;
  planStatus: import("@prisma/client").StorePlanStatus;
  planEffectiveAt: Date | null;
  planExpiresAt: Date | null;
  limits: PlanLimits;
  metrics: UsageMetric[];
}

function calcStatus(current: number, limit: number | null): UsageMetric["status"] {
  if (limit === null) return "unlimited";
  if (limit === 0) return current > 0 ? "danger" : "normal";
  const pct = (current / limit) * 100;
  if (pct >= 100) return "danger";
  if (pct >= 80) return "warning";
  return "normal";
}

function calcPct(current: number, limit: number | null): number {
  if (limit === null || limit === 0) return 0;
  return Math.min(100, Math.round((current / limit) * 100));
}

/**
 * 取得單一店舖的完整用量資料
 */
export async function getStoreUsage(storeId: string): Promise<StoreUsage | null> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      name: true,
      plan: true,
      planStatus: true,
      planEffectiveAt: true,
      planExpiresAt: true,
      maxStaffOverride: true,
      maxCustomersOverride: true,
      maxMonthlyBookingsOverride: true,
      maxMonthlyReportsOverride: true,
      maxReminderSendsOverride: true,
      maxStoresOverride: true,
    },
  });

  if (!store) return null;

  const limits = getPlanLimits(store);

  // 本月範圍
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [staffCount, customerCount, monthlyBookingCount, storeCount] =
    await Promise.all([
      prisma.staff.count({ where: { storeId, status: "ACTIVE" } }),
      prisma.customer.count({ where: { storeId } }),
      prisma.booking.count({
        where: {
          storeId,
          createdAt: { gte: monthStart, lte: monthEnd },
        },
      }),
      prisma.store.count(),
    ]);

  const metrics: UsageMetric[] = [
    {
      label: "員工數",
      current: staffCount,
      limit: limits.maxStaff,
      pct: calcPct(staffCount, limits.maxStaff),
      status: calcStatus(staffCount, limits.maxStaff),
    },
    {
      label: "顧客數",
      current: customerCount,
      limit: limits.maxCustomers,
      pct: calcPct(customerCount, limits.maxCustomers),
      status: calcStatus(customerCount, limits.maxCustomers),
    },
    {
      label: "本月預約",
      current: monthlyBookingCount,
      limit: limits.maxMonthlyBookings,
      pct: calcPct(monthlyBookingCount, limits.maxMonthlyBookings),
      status: calcStatus(monthlyBookingCount, limits.maxMonthlyBookings),
    },
    {
      label: "分店數",
      current: storeCount,
      limit: limits.maxStores,
      pct: calcPct(storeCount, limits.maxStores),
      status: calcStatus(storeCount, limits.maxStores),
    },
  ];

  return {
    storeId: store.id,
    storeName: store.name,
    plan: store.plan,
    planStatus: store.planStatus,
    planEffectiveAt: store.planEffectiveAt,
    planExpiresAt: store.planExpiresAt,
    limits,
    metrics,
  };
}

/**
 * 取得所有店舖的用量資料（ADMIN 用）
 */
export async function getAllStoresUsage(): Promise<StoreUsage[]> {
  const stores = await prisma.store.findMany({
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  const results = await Promise.all(
    stores.map((s) => getStoreUsage(s.id))
  );

  return results.filter((r): r is StoreUsage => r !== null);
}
