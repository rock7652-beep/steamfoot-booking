/**
 * Store Plan 讀取工具
 *
 * 從 Store.plan 讀取當前店舖的 PricingPlan。
 * 供 server component / server action 使用。
 */

/**
 * Store Plan 讀取工具
 *
 * 從 Store.plan 讀取當前店舖的 PricingPlan。
 * 供 server component / server action 使用。
 */
/**
 * Store Plan 讀取工具
 *
 * 從 Store.plan 讀取當前店舖的 PricingPlan。
 * 供 server component / server action 使用。
 */
/**
 * Store Plan 讀取工具
 *
 * 從 Store.plan 讀取當前店舖的 PricingPlan。
 * 供 server component / server action 使用。
 */
import { cache } from "react";
import {memoizeReadRequest} from "@/server/services/read-request-memo";
import { sportsNativePreview } from "@/lib/sports-native-preview";
import { prisma } from "@/lib/db";
import { getActiveStoreForRead } from "@/lib/store";
import { requireStaffSession } from "@/lib/session";

import type { PricingPlan, Store, Prisma } from "@prisma/client";

/** Store plan 查詢所需的 select 欄位 */
export type StorePlanFields = Pick<
  Store,
  | "id"
  | "plan"
  | "planStatus"
  | "planEffectiveAt"
  | "planExpiresAt"
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
  planStatus: true,
  planEffectiveAt: true,
  planExpiresAt: true,
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

  const storeId = await getActiveStoreForRead(user);
  if (!storeId) return "ALLIANCE"; // ADMIN 全部分店 → 解鎖全部功能

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { plan: true },
  });

  return store?.plan ?? "EXPERIENCE";
}

/** 取得當前 staff 所屬 store 的完整 plan 資訊（含 override） */
export async function getCurrentStoreForPlan(): Promise<StorePlanFields> {
  const user = await requireStaffSession();

  const storeId = await getActiveStoreForRead(user);
  if (!storeId) {
    // ADMIN 全部分店 → 回傳最高級別虛擬值
    return {
      id: "__all__",
      plan: "ALLIANCE",
      planStatus: "ACTIVE", planEffectiveAt: null, planExpiresAt: null,
      maxStaffOverride: null,
      maxCustomersOverride: null,
      maxMonthlyBookingsOverride: null,
      maxMonthlyReportsOverride: null,
      maxReminderSendsOverride: null,
      maxStoresOverride: null,
    };
  }

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
const readPreviewPlan=cache((storeId:string)=>prisma.store.findUnique({where:{id:storeId},select:STORE_PLAN_SELECT}));

export async function getStoreForPlanByStoreId(
  storeId: string,
  client: Pick<Prisma.TransactionClient, "store"> = prisma,
): Promise<StorePlanFields> {

  const read=async()=>client===prisma&&(await sportsNativePreview(storeId))?await readPreviewPlan(storeId):await client.store.findUnique({
    where: { id: storeId },
    select: STORE_PLAN_SELECT,
  });
  // Only an explicitly scoped HTTP read may share the ordinary reader's result.
  // Transaction readers always query their own connection and snapshot.
  const store=await (client===prisma?memoizeReadRequest(`store.plan:${storeId}`,read):read());
  if (!store) throw new Error(`Store not found: ${storeId}`);
  return store;
}
