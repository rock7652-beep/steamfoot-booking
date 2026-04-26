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

  // ADMIN 沒有 storeId — 用 active-store-id cookie 或解鎖全部
  if (user.role === "ADMIN") {
    const { getActiveStoreForRead } = await import("@/lib/store");
    const activeStoreId = await getActiveStoreForRead(user);
    if (!activeStoreId) return "ALLIANCE"; // 全部分店 → 解鎖全部功能
    return getStorePlanById(activeStoreId);
  }

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

  // ADMIN: 用 active-store-id 或回傳 ALLIANCE 預設值
  if (user.role === "ADMIN") {
    const { getActiveStoreForRead } = await import("@/lib/store");
    const activeStoreId = await getActiveStoreForRead(user);
    if (activeStoreId) {
      const store = await prisma.store.findUnique({
        where: { id: activeStoreId },
        select: STORE_PLAN_SELECT,
      });
      if (store) return store;
    }
    // 全部分店 → 回傳最高級別虛擬值
    return {
      id: "__all__",
      plan: "ALLIANCE",
      maxStaffOverride: null,
      maxCustomersOverride: null,
      maxMonthlyBookingsOverride: null,
      maxMonthlyReportsOverride: null,
      maxReminderSendsOverride: null,
      maxStoresOverride: null,
    };
  }

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

/**
 * 依 storeId 取得完整 StorePlanFields（含 override）— 不依賴 session。
 *
 * 用途：顧客自助流程（如 createBooking）需檢查店舖方案上限時，session 為 CUSTOMER，
 * 不能走 getCurrentStoreForPlan（內含 requireStaffSession 會拒絕顧客）。
 * 改由呼叫端從 session/customer 拿到 storeId 後傳入此 helper。
 */
export async function getStoreForPlanByStoreId(storeId: string): Promise<StorePlanFields> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: STORE_PLAN_SELECT,
  });
  if (!store) throw new Error(`Store not found: ${storeId}`);
  return store;
}
