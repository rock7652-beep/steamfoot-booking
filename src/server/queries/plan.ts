import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { AppError } from "@/lib/errors";

// ============================================================
// listPlans — Owner + Manager（唯讀）
// ============================================================

export async function listPlans(includeInactive = false) {
  const user = await requireStaffSession();
  const where: { storeId: string; isActive?: boolean } = {
    storeId: user.storeId!,
  };
  if (!includeInactive) {
    where.isActive = true;
  }
  return prisma.servicePlan.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

// ============================================================
// getPlanDetail — Owner + Manager
// ============================================================

export async function getPlanDetail(planId: string) {
  const user = await requireStaffSession();
  const plan = await prisma.servicePlan.findUnique({ where: { id: planId } });
  if (!plan) throw new AppError("NOT_FOUND", "課程方案不存在");
  if (plan.storeId !== user.storeId) throw new AppError("FORBIDDEN", "無權限存取此方案");
  return plan;
}
