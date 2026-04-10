"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireOwnerSession } from "@/lib/session";
import type { ShopPlan } from "@prisma/client";
import type { ActionResult } from "@/types";

const VALID_PLANS: ShopPlan[] = ["FREE", "BASIC", "PRO"];

export async function updateDutyScheduling(
  enabled: boolean
): Promise<ActionResult<void>> {
  try {
    await requireOwnerSession();

    await prisma.shopConfig.upsert({
      where: { id: "default" },
      create: { id: "default", dutySchedulingEnabled: enabled },
      update: { dutySchedulingEnabled: enabled },
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/duty");
    revalidatePath("/dashboard/settings/duty");
    revalidatePath("/dashboard/bookings");
    revalidatePath("/book");
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "操作失敗" };
  }
}

export async function updateShopPlan(
  plan: ShopPlan
): Promise<ActionResult<void>> {
  try {
    await requireOwnerSession();

    if (!VALID_PLANS.includes(plan)) {
      return { success: false, error: "無效的方案" };
    }

    await prisma.shopConfig.upsert({
      where: { id: "default" },
      create: { id: "default", plan },
      update: { plan },
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/settings/plan");
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "操作失敗" };
  }
}
