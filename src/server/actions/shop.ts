"use server";

import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/session";
import { revalidateDutyScheduling, revalidateShopConfig } from "@/lib/revalidation";
import type { ShopPlan, PricingPlan } from "@prisma/client";
import type { ActionResult } from "@/types";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { updateTag, revalidatePath } from "next/cache";

const VALID_PLANS: ShopPlan[] = ["FREE", "BASIC", "PRO"];

export async function updateDutyScheduling(
  enabled: boolean
): Promise<ActionResult<void>> {
  try {
    await requireAdminSession();

    await prisma.shopConfig.upsert({
      where: { storeId: DEFAULT_STORE_ID },
      create: { storeId: DEFAULT_STORE_ID, dutySchedulingEnabled: enabled },
      update: { dutySchedulingEnabled: enabled },
    });

    revalidateDutyScheduling();
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "操作失敗" };
  }
}

export async function updateShopPlan(
  plan: ShopPlan
): Promise<ActionResult<void>> {
  try {
    await requireAdminSession();

    if (!VALID_PLANS.includes(plan)) {
      return { success: false, error: "無效的方案" };
    }

    await prisma.shopConfig.upsert({
      where: { storeId: DEFAULT_STORE_ID },
      create: { storeId: DEFAULT_STORE_ID, plan },
      update: { plan },
    });

    revalidateShopConfig();
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "操作失敗" };
  }
}

// ============================================================
// PricingPlan — Store.plan 管理
// ============================================================

const VALID_PRICING_PLANS: PricingPlan[] = ["EXPERIENCE", "BASIC", "GROWTH", "ALLIANCE"];

export async function updateStorePlan(
  storeId: string,
  plan: PricingPlan
): Promise<ActionResult<void>> {
  try {
    await requireAdminSession();

    if (!VALID_PRICING_PLANS.includes(plan)) {
      return { success: false, error: "無效的方案" };
    }

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      return { success: false, error: "店舖不存在" };
    }

    await prisma.store.update({
      where: { id: storeId },
      data: { plan },
    });

    updateTag("store-plan");
    revalidatePath("/dashboard/settings/plan");
    revalidateShopConfig();
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "操作失敗" };
  }
}
