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

// ============================================================
// getFrontendPlans — PR-6 前台 /book/shop 購買頁
//
// 僅回傳顧客端可見的方案：isActive=true AND publicVisible=true
// 無 auth 檢查（前台購買頁本來就是半公開），但 storeId 必填做店隔離。
// 呼叫者（page）須從 getStoreContext() 取得 storeId 後傳入。
// ============================================================

export async function getFrontendPlans(storeId: string) {
  return prisma.servicePlan.findMany({
    where: {
      storeId,
      isActive: true,
      publicVisible: true,
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      category: true,
      price: true,
      sessionCount: true,
      validityDays: true,
      description: true,
      sortOrder: true,
    },
  });
}
