"use server";

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { requireStaffSession } from "@/lib/session";
import { AppError, handleActionError } from "@/lib/errors";
import { checkCurrentStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { createPlanSchema, updatePlanSchema } from "@/lib/validators/plan";
import { revalidatePlans } from "@/lib/revalidation";
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
    await checkCurrentStoreFeature(FEATURES.PLAN_MANAGEMENT);
    const user = await requireStaffSession();
    const storeId = user.storeId!;
    const data = createPlanSchema.parse(input);

    // 同店同名方案不可重複建立
    const existing = await prisma.servicePlan.findFirst({
      where: { storeId, name: data.name },
    });
    if (existing) {
      throw new AppError("VALIDATION", `方案名稱「${data.name}」已存在，請使用其他名稱或編輯現有方案`);
    }

    const plan = await prisma.servicePlan.create({
      data: {
        storeId,
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

    revalidatePlans();
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
    const user = await requireStaffSession();
    const data = updatePlanSchema.parse(input);

    const plan = await prisma.servicePlan.findUnique({ where: { id: planId } });
    if (!plan) throw new AppError("NOT_FOUND", "課程方案不存在");
    if (plan.storeId !== user.storeId) throw new AppError("FORBIDDEN", "無權限編輯此方案");

    // 如果改名，檢查新名稱是否與同店其他方案重複
    if (data.name && data.name !== plan.name) {
      const dup = await prisma.servicePlan.findFirst({
        where: { storeId: plan.storeId, name: data.name, id: { not: planId } },
      });
      if (dup) {
        throw new AppError("VALIDATION", `方案名稱「${data.name}」已存在`);
      }
    }

    await prisma.servicePlan.update({
      where: { id: planId },
      data,
    });

    revalidatePlans();
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
    const user = await requireStaffSession();

    const plan = await prisma.servicePlan.findUnique({ where: { id: planId } });
    if (!plan) throw new AppError("NOT_FOUND", "課程方案不存在");
    if (plan.storeId !== user.storeId) throw new AppError("FORBIDDEN", "無權限操作此方案");
    if (!plan.isActive) throw new AppError("VALIDATION", "該方案已停用");

    await prisma.servicePlan.update({
      where: { id: planId },
      data: { isActive: false },
    });

    revalidatePlans();
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}
