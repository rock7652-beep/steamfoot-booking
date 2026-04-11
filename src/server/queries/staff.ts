import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";
import { getStoreFilter } from "@/lib/manager-visibility";
import { AppError } from "@/lib/errors";

// ============================================================
// listStaff — 需要 staff.view 權限
// ============================================================

export async function listStaff() {
  const user = await requirePermission("staff.view");
  return prisma.staff.findMany({
    where: { ...getStoreFilter(user) },
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

export async function listStaffSelectOptions() {
  const user = await requireStaffSession();
  return prisma.staff.findMany({
    where: { status: "ACTIVE", ...getStoreFilter(user) },
    select: { id: true, displayName: true },
    orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
  });
}

// ============================================================
// getStaffDetail — Owner only（編輯權限管理用）
// ============================================================

export async function getStaffDetail(staffId: string) {
  const user = await requirePermission("staff.view");

  const staff = await prisma.staff.findFirst({
    where: { id: staffId, ...getStoreFilter(user) },
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
