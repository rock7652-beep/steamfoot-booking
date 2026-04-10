import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

// ============================================================
// getDutyByDate — 查某天的所有值班安排（含 Staff 資訊）
// ============================================================

export async function getDutyByDate(date: string) {
  await requirePermission("duty.read");
  const dateObj = new Date(date + "T00:00:00Z");

  return prisma.dutyAssignment.findMany({
    where: { date: dateObj },
    include: {
      staff: {
        select: {
          id: true,
          displayName: true,
          colorCode: true,
          user: { select: { role: true } },
        },
      },
    },
    orderBy: [{ slotTime: "asc" }, { createdAt: "asc" }],
  });
}

// ============================================================
// getDutyByWeek — 查某週的所有值班安排（週檢視用）
// ============================================================

export async function getDutyByWeek(weekStart: string) {
  await requirePermission("duty.read");

  const startDate = new Date(weekStart + "T00:00:00Z");
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + 6);

  return prisma.dutyAssignment.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
    },
    include: {
      staff: {
        select: {
          id: true,
          displayName: true,
          colorCode: true,
        },
      },
    },
    orderBy: [{ date: "asc" }, { slotTime: "asc" }, { createdAt: "asc" }],
  });
}

// ============================================================
// getStaffDutyByMonth — 查某人某月的值班紀錄（報表用）
// ============================================================

export async function getStaffDutyByMonth(staffId: string, month: string) {
  await requirePermission("duty.read");

  const [year, mon] = month.split("-").map(Number);
  const startDate = new Date(Date.UTC(year, mon - 1, 1));
  const endDate = new Date(Date.UTC(year, mon, 0));

  return prisma.dutyAssignment.findMany({
    where: {
      staffId,
      date: { gte: startDate, lte: endDate },
    },
    orderBy: [{ date: "asc" }, { slotTime: "asc" }],
  });
}

// ============================================================
// getSlotDutyStaff — 查某天某時段的值班人員
// ============================================================

export async function getSlotDutyStaff(date: string, slotTime: string) {
  await requirePermission("duty.read");
  const dateObj = new Date(date + "T00:00:00Z");

  return prisma.dutyAssignment.findMany({
    where: { date: dateObj, slotTime },
    include: {
      staff: {
        select: {
          id: true,
          displayName: true,
          colorCode: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

// ============================================================
// getDutyCountByDate — 查某天是否有值班安排（輕量查詢）
// ============================================================

export async function getDutyCountByDate(date: string): Promise<number> {
  const dateObj = new Date(date + "T00:00:00Z");
  return prisma.dutyAssignment.count({ where: { date: dateObj } });
}
