import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";
import { AppError } from "@/lib/errors";

// ============================================================
// listStaff — 需要 staff.view 權限
// ============================================================

export async function listStaff() {
  await requirePermission("staff.view");
  return prisma.staff.findMany({
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
  await requireStaffSession();
  return prisma.staff.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, displayName: true },
    orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
  });
}

// ============================================================
// getStaffDetail — Owner only（編輯權限管理用）
// ============================================================

export async function getStaffDetail(staffId: string) {
  await requirePermission("staff.view");

  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
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
