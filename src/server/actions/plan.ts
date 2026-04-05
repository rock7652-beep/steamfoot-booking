"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { AppError, handleActionError } from "@/lib/errors";
import { createPlanSchema, updatePlanSchema } from "@/lib/validators/plan";
import type { ActionResult } from "@/types";
import type { z } from "zod";

// ============================================================
// createPlan — Owner only
// ============================================================

export async function createPlan(
  input: z.infer<typeof createPlanSchema>
): Promise<ActionResult<{ planId: string }>> {
  try {
    await requirePermission("wallet.create");
    const data = createPlanSchema.parse(input);

    const plan = await prisma.servicePlan.create({
      data: {
        name: data.name,
        category: data.category,
        price: data.price,
        sessionCount: data.sessionCount,
        validityDays: data.validityDays ?? null,
        description: data.description ?? null,
        sortOrder: data.sortOrder ?? 0,
        isActive: true,
      },
    });

    revalidatePath("/dashboard/plans");
    return { success: true, data: { planId: plan.id } };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// updatePlan — Owner only
// ============================================================

export async function updatePlan(
  planId: string,
  input: z.infer<typeof updatePlanSchema>
): Promise<ActionResult<void>> {
  try {
    await requirePermission("wallet.create");
    const data = updatePlanSchema.parse(input);

    const plan = await prisma.servicePlan.findUnique({ where: { id: planId } });
    if (!plan) throw new AppError("NOT_FOUND", "課程方案不存在");

    await prisma.servicePlan.update({
      where: { id: planId },
      data,
    });

    revalidatePath("/dashboard/plans");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// deactivatePlan — Owner only（不刪除，只停用）
// ============================================================

export async function deactivatePlan(planId: string): Promise<ActionResult<void>> {
  try {
    await requirePermission("wallet.create");

    const plan = await prisma.servicePlan.findUnique({ where: { id: planId } });
    if (!plan) throw new AppError("NOT_FOUND", "課程方案不存在");
    if (!plan.isActive) throw new AppError("VALIDATION", "該方案已停用");

    await prisma.servicePlan.update({
      where: { id: planId },
      data: { isActive: false },
    });

    revalidatePath("/dashboard/plans");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}
