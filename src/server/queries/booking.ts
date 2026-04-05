import { prisma } from "@/lib/db";
import { requireSession, requireStaffSession } from "@/lib/session";
import { AppError } from "@/lib/errors";
import type { BookingStatus } from "@prisma/client";
import type { SlotAvailability, DayAvailability } from "@/types";

export interface ListBookingsOptions {
  dateFrom?: string; // "YYYY-MM-DD"
  dateTo?: string;
  status?: BookingStatus;
  customerId?: string;
  page?: number;
  pageSize?: number;
}

// ============================================================
// listAvailableSlots — 查詢某天所有時段可用性
// ============================================================

export async function listAvailableSlots(date: string): Promise<DayAvailability> {
  await requireSession();

  const dateObj = new Date(date + "T00:00:00Z");
  const dayOfWeek = dateObj.getDay();

  // 取該星期幾的所有啟用時段
  const slots = await prisma.bookingSlot.findMany({
    where: { dayOfWeek, isEnabled: true },
    orderBy: { startTime: "asc" },
  });

  if (slots.length === 0) {
    return { date, dayOfWeek, slots: [] };
  }

  // 計算各時段已預約數
  const existingBookings = await prisma.booking.groupBy({
    by: ["slotTime"],
    where: {
      bookingDate: dateObj,
      bookingStatus: { in: ["PENDING", "CONFIRMED"] },
    },
    _count: { slotTime: true },
  });

  const bookedMap = new Map(existingBookings.map((b) => [b.slotTime, b._count.slotTime]));

  const slotAvailability: SlotAvailability[] = slots.map((slot) => {
    const booked = bookedMap.get(slot.startTime) ?? 0;
    return {
      startTime: slot.startTime,
      capacity: slot.capacity,
      bookedCount: booked,
      available: Math.max(0, slot.capacity - booked),
      isEnabled: slot.isEnabled,
    };
  });

  return { date, dayOfWeek, slots: slotAvailability };
}

// ============================================================
// listBookings
// Owner: 所有預約
// Manager: 只有自己名下顧客的預約
// Customer: 只有自己的預約
// ============================================================

export async function listBookings(options: ListBookingsOptions = {}) {
  const user = await requireSession();
  const { dateFrom, dateTo, status, customerId, page = 1, pageSize = 30 } = options;

  // 後端強制資料隔離
  let whereCustomer: Record<string, unknown> = {};
  if (user.role === "CUSTOMER") {
    // Customer 必須有 customerId，否則不回傳任何資料
    if (!user.customerId) return { bookings: [], total: 0, page, pageSize };
    whereCustomer = { id: user.customerId };
  } else if (user.role === "MANAGER" && user.staffId) {
    whereCustomer = { assignedStaffId: user.staffId };
  }

  const where: Record<string, unknown> = {
    ...(Object.keys(whereCustomer).length > 0 && { customer: whereCustomer }),
    ...(customerId ? { customerId } : {}),
    ...(status ? { bookingStatus: status } : {}),
    ...(dateFrom || dateTo
      ? {
          bookingDate: {
            ...(dateFrom ? { gte: new Date(dateFrom + "T00:00:00") } : {}),
            ...(dateTo ? { lte: new Date(dateTo + "T23:59:59") } : {}),
          },
        }
      : {}),
  };

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        revenueStaff: { select: { id: true, displayName: true, colorCode: true } },
        serviceStaff: { select: { id: true, displayName: true } },
        servicePlan: { select: { id: true, name: true } },
      },
      orderBy: [{ bookingDate: "desc" }, { slotTime: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.booking.count({ where }),
  ]);

  return { bookings, total, page, pageSize };
}

// ============================================================
// getBookingDetail
// ============================================================

export async function getBookingDetail(bookingId: string) {
  const user = await requireSession();

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          assignedStaffId: true,
        },
      },
      revenueStaff: { select: { id: true, displayName: true, colorCode: true } },
      serviceStaff: { select: { id: true, displayName: true } },
      servicePlan: true,
      customerPlanWallet: {
        include: { plan: true },
      },
    },
  });
  if (!booking) throw new AppError("NOT_FOUND", "預約不存在");

  // 後端強制權限檢查
  if (user.role === "MANAGER") {
    if (!user.staffId || booking.customer.assignedStaffId !== user.staffId) {
      throw new AppError("FORBIDDEN", "無法查看其他店長名下的預約");
    }
  }
  if (user.role === "CUSTOMER") {
    if (!user.customerId || booking.customerId !== user.customerId) {
      throw new AppError("FORBIDDEN", "只能查看自己的預約");
    }
  }

  return booking;
}

// ============================================================
// getDayBookings — 取某天的完整預約清單（後台日曆用）
// ============================================================

export async function getDayBookings(date: string) {
  const user = await requireStaffSession();

  const dateObj = new Date(date + "T00:00:00Z");

  // 所有店長可看全部預約（共享查看）
  return prisma.booking.findMany({
    where: {
      bookingDate: dateObj,
      bookingStatus: { in: ["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"] },
    },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          assignedStaff: { select: { id: true, displayName: true, colorCode: true } },
        },
      },
      revenueStaff: { select: { id: true, displayName: true, colorCode: true } },
      serviceStaff: { select: { id: true, displayName: true } },
      servicePlan: { select: { name: true } },
    },
    orderBy: { slotTime: "asc" },
  });
}

// ============================================================
// getMonthlyRevenueSummary
// Owner: 全部 / Manager: 自己的
// ============================================================

export async function getMonthlyRevenueSummary(year: number, month: number) {
  const user = await requireStaffSession();

  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0)); // last day of month

  const staffFilter =
    user.role === "MANAGER" && user.staffId
      ? { revenueStaffId: user.staffId }
      : {};

  const result = await prisma.transaction.groupBy({
    by: ["revenueStaffId"],
    where: {
      ...staffFilter,
      createdAt: { gte: startDate, lte: endDate },
      transactionType: {
        in: ["TRIAL_PURCHASE", "SINGLE_PURCHASE", "PACKAGE_PURCHASE", "SUPPLEMENT"],
      },
    },
    _sum: { amount: true },
    _count: { id: true },
  });

  // Enrich with staff names
  const staffIds = result.map((r) => r.revenueStaffId);
  const staffList = await prisma.staff.findMany({
    where: { id: { in: staffIds } },
    select: { id: true, displayName: true },
  });
  const staffMap = new Map(staffList.map((s) => [s.id, s.displayName]));

  return result.map((r) => ({
    staffId: r.revenueStaffId,
    staffName: staffMap.get(r.revenueStaffId) ?? "Unknown",
    totalRevenue: Number(r._sum.amount ?? 0),
    transactionCount: r._count.id,
  }));
}

// ============================================================
// getMonthBookingSummary — 取月份日曆資料（含各日期的預約統計）
// ============================================================

export async function getMonthBookingSummary(year: number, month: number) {
  const user = await requireStaffSession();

  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0)); // last day of month

  // Manager 也能看全部預約（共享查看）
  // 取該月份所有預約
  const bookings = await prisma.booking.findMany({
    where: {
      bookingDate: { gte: startDate, lte: endDate },
      bookingStatus: { in: ["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"] },
    },
    include: {
      revenueStaff: { select: { id: true, displayName: true, colorCode: true } },
      customer: { select: { assignedStaff: { select: { id: true, displayName: true, colorCode: true } } } },
    },
  });

  // 按日期分組統計
  const dailyStats = new Map<
    string,
    { total: number; staffStats: Map<string, { staffName: string; colorCode: string; count: number }> }
  >();

  for (let day = 1; day <= endDate.getDate(); day++) {
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    dailyStats.set(dateKey, { total: 0, staffStats: new Map() });
  }

  for (const booking of bookings) {
    const dateKey = booking.bookingDate.toISOString().slice(0, 10);
    const dayData = dailyStats.get(dateKey);
    if (!dayData) continue;

    // 用 revenueStaff 或 customer.assignedStaff 來識別
    const staff = booking.revenueStaff || booking.customer?.assignedStaff;
    dayData.total++;

    if (staff) {
      let staffStat = dayData.staffStats.get(staff.id);
      if (!staffStat) {
        staffStat = { staffName: staff.displayName, colorCode: staff.colorCode, count: 0 };
        dayData.staffStats.set(staff.id, staffStat);
      }
      staffStat.count++;
    }
  }

  // 轉換為陣列格式
  const result = Array.from(dailyStats.entries()).map(([dateStr, data]) => ({
    date: dateStr,
    totalBookingCount: data.total,
    staffBookings: Array.from(data.staffStats.values()),
  }));

  return result;
}
