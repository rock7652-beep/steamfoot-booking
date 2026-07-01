import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { getStoreFilter } from "@/lib/manager-visibility";
import {
  resolveStoreViewContextFromCookie,
  storeIdForViewContext,
  userForViewContext,
} from "@/lib/store-view-context-server";
import type { Prisma } from "@prisma/client";

// ============================================================
// listPlans — Owner + Manager（唯讀）
// ============================================================

export async function listPlans(
  includeInactive = false,
  activeStoreId?: string | null,
) {
  const user = await requireStaffSession();
  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  const readUser = userForViewContext(user, storeViewContext);
  const readStoreId = storeIdForViewContext(activeStoreId ?? null, storeViewContext);
  const where: Prisma.ServicePlanWhereInput = {
    ...getStoreFilter(readUser, readStoreId),
  };
  if (!includeInactive) {
    where.isActive = true;
  }
  return prisma.servicePlan.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    // _count.wallets — used by the desktop manage page to show a 「使用中」
    // hint, and to gate "下架後仍有錢包" warnings without an extra query.
    include: { _count: { select: { wallets: true } } },
  });
}

// ============================================================
// getPlanDetail — Owner + Manager
// ============================================================

export async function getPlanDetail(
  planId: string,
  activeStoreId?: string | null,
) {
  const user = await requireStaffSession();
  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  const readUser = userForViewContext(user, storeViewContext);
  const readStoreId = storeIdForViewContext(activeStoreId ?? null, storeViewContext);
  const plan = await prisma.servicePlan.findFirst({
    where: { id: planId, ...getStoreFilter(readUser, readStoreId) },
  });
  if (!plan) throw new AppError("NOT_FOUND", "課程方案不存在");
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
