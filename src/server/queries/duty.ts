import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import type { DutyRole, ParticipationType } from "@prisma/client";

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
        },
      },
    },
    orderBy: [{ slotTime: "asc" }, { createdAt: "asc" }],
  });
}

// ============================================================
// getDutyByWeek — 查某週的所有值班安排（週檢視用）
// ============================================================

/** 扁平化回傳格式 — 前端可直接使用，不需再做 map 轉換 */
export interface DutyWeekItem {
  id: string;
  date: string;
  slotTime: string;
  staffId: string;
  staffName: string;
  staffColor: string;
  dutyRole: DutyRole;
  participationType: ParticipationType;
}

export async function getDutyByWeek(weekStart: string): Promise<DutyWeekItem[]> {
  await requirePermission("duty.read");
  return getDutyByDateRange(weekStart, 6);
}

/** 查詢指定日期範圍的值班（內部用，不做權限檢查） */
export async function getDutyByDateRange(startDateStr: string, daysSpan: number): Promise<DutyWeekItem[]> {
  const startDate = new Date(startDateStr + "T00:00:00Z");
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + daysSpan);

  const rows = await prisma.dutyAssignment.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
    },
    select: {
      id: true,
      date: true,
      slotTime: true,
      staffId: true,
      dutyRole: true,
      participationType: true,
      staff: {
        select: {
          displayName: true,
          colorCode: true,
        },
      },
    },
    orderBy: [{ date: "asc" }, { slotTime: "asc" }, { createdAt: "asc" }],
  });

  return rows.map((r) => ({
    id: r.id,
    date: r.date.toISOString().slice(0, 10),
    slotTime: r.slotTime,
    staffId: r.staffId,
    staffName: r.staff.displayName,
    staffColor: r.staff.colorCode,
    dutyRole: r.dutyRole,
    participationType: r.participationType,
  }));
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
