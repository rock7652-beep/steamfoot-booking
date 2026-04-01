import { prisma } from "@/lib/db";
import { requireOwnerSession, requireStaffSession } from "@/lib/session";
import { AppError } from "@/lib/errors";

// ============================================================
// listStaff — Owner only
// ============================================================

export async function listStaff() {
  await requireOwnerSession();
  return prisma.staff.findMany({
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, status: true } },
      _count: {
        select: { assignedCustomers: true },
      },
    },
    orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
  });
}

// ============================================================
// listStaffSelectOptions — Owner and Manager can call (for UI select boxes)
// Returns minimal staff data for dropdowns
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
// getStaffDetail — Owner only
// ============================================================

export async function getStaffDetail(staffId: string) {
  await requireOwnerSession();

  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, status: true } },
      _count: {
        select: { assignedCustomers: true, revenueBookings: true },
      },
    },
  });
  if (!staff) throw new AppError("NOT_FOUND", "店長不存在");
  return staff;
}
