import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";
import { getActiveStoreForRead, validateStoreAccess } from "@/lib/store";
import { AppError } from "@/lib/errors";

// ============================================================
// listStaff — 需要 staff.view 權限
// ============================================================

export async function listStaff(activeStoreId?: string | null) {
  const user = await requirePermission("staff.view");
  const storeId = await resolveStaffReadStore(user, activeStoreId);
  return prisma.staff.findMany({
    where: { storeId },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, status: true, role: true } },
      _count: {
        select: { assignedCustomers: true },
      },
    },
    orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
  });
}

// ============================================================
// listStaffSelectOptions — 任何員工角色都可呼叫（UI 下拉選單用）
// ============================================================

export async function listStaffSelectOptions(activeStoreId?: string | null) {
  const user = await requireStaffSession();
  const storeId = await resolveStaffReadStore(user, activeStoreId);
  return prisma.staff.findMany({
    where: {
      status: "ACTIVE",
      storeId,
      user: { role: { not: "ADMIN" } },
    },
    select: { id: true, displayName: true },
    orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
  });
}

// ============================================================
// getStaffDetail — Owner only（編輯權限管理用）
// ============================================================

export async function getStaffDetail(staffId: string, activeStoreId?: string | null) {
  const user = await requirePermission("staff.view");
  const storeId = await resolveStaffReadStore(user, activeStoreId);

  const staff = await prisma.staff.findFirst({
    where: { id: staffId, storeId },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, status: true, role: true } },
      _count: {
        select: { assignedCustomers: true, revenueBookings: true },
      },
    },
  });
  if (!staff) throw new AppError("NOT_FOUND", "員工不存在");
  return staff;
}

async function resolveStaffReadStore(
  user: { role: string; storeId?: string | null },
  requestedStoreId?: string | null,
): Promise<string> {
  const authorizedStoreId = await getActiveStoreForRead(user);
  if (!authorizedStoreId) {
    throw new AppError("VALIDATION", "請先切換到特定店舖");
  }
  if (requestedStoreId && requestedStoreId !== authorizedStoreId) {
    await validateStoreAccess(user, requestedStoreId, "read");
    throw new AppError("FORBIDDEN", "頁面店舖與查詢店舖不一致");
  }
  return authorizedStoreId;
}
