"use server";

import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/session";
import { revalidateDutyScheduling, revalidateShopConfig } from "@/lib/revalidation";
import type { ShopPlan } from "@prisma/client";
import type { ActionResult } from "@/types";

const VALID_PLANS: ShopPlan[] = ["FREE", "BASIC", "PRO"];
const DEFAULT_STORE_ID = "default-store";

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
