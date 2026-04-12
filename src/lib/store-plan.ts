/**
 * Store Plan 讀取工具
 *
 * 從 Store.plan 讀取當前店舖的 PricingPlan。
 * 供 server component / server action 使用。
 */

import { prisma } from "@/lib/db";
import { currentStoreId } from "@/lib/store";
import { requireStaffSession } from "@/lib/session";
import type { PricingPlan, Store } from "@prisma/client";

/** Store plan 查詢所需的 select 欄位 */
export type StorePlanFields = Pick<
  Store,
  | "id"
  | "plan"
  | "maxStaffOverride"
  | "maxCustomersOverride"
  | "maxMonthlyBookingsOverride"
  | "maxMonthlyReportsOverride"
  | "maxReminderSendsOverride"
  | "maxStoresOverride"
>;

const STORE_PLAN_SELECT = {
  id: true,
  plan: true,
  maxStaffOverride: true,
  maxCustomersOverride: true,
  maxMonthlyBookingsOverride: true,
  maxMonthlyReportsOverride: true,
  maxReminderSendsOverride: true,
  maxStoresOverride: true,
} as const;

/** 取得當前 staff 所屬 store 的 PricingPlan */
export async function getCurrentStorePlan(): Promise<PricingPlan> {
  const user = await requireStaffSession();
  const storeId = currentStoreId(user);

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { plan: true },
  });

  return store?.plan ?? "EXPERIENCE";
}

/** 取得當前 staff 所屬 store 的完整 plan 資訊（含 override） */
export async function getCurrentStoreForPlan(): Promise<StorePlanFields> {
  const user = await requireStaffSession();
  const storeId = currentStoreId(user);

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: STORE_PLAN_SELECT,
  });

  if (!store) {
    throw new Error("Store not found");
  }

  return store;
}

/** 依 storeId 取得 plan（供 cron / 非 session 場景使用） */
export async function getStorePlanById(storeId: string): Promise<PricingPlan> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { plan: true },
  });
  return store?.plan ?? "EXPERIENCE";
}
