import { prisma } from "@/lib/db";
import { requireSession, requireStaffSession } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { getManagerCustomerFilter } from "@/lib/manager-visibility";
import type { BookingStatus } from "@prisma/client";

export interface ListBookingsOptions {
  dateFrom?: string; // "YYYY-MM-DD"
  dateTo?: string;
  status?: BookingStatus;
  customerId?: string;
  page?: number;
  pageSize?: number;
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

  // 後端強制資料隔離（讀取型：受 visibility mode 控制）
  let whereCustomer: Record<string, unknown> = {};
  if (user.role === "CUSTOMER") {
    // Customer 必須有 customerId，否則不回傳任何資料
    if (!user.customerId) return { bookings: [], total: 0, page, pageSize };
    whereCustomer = { id: user.customerId };
  } else if (user.role !== "OWNER" && user.staffId) {
    const customerFilter = getManagerCustomerFilter(user.role, user.staffId);
    // getManagerCustomerFilter 回傳 { customer: { assignedStaffId: ... } } 或 {}
    // 這裡需要取出 customer 層級的 where
    const nested = customerFilter.customer as Record<string, unknown> | undefined;
    whereCustomer = nested ?? {};
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

  // ⚡ Customer 不需要 customer/serviceStaff include（自己看自己的）
  const isCustomer = user.role === "CUSTOMER";
  const includeFields = isCustomer
    ? {
        revenueStaff: { select: { id: true, displayName: true, colorCode: true } },
        servicePlan: { select: { id: true, name: true } },
      }
    : {
        customer: { select: { id: true, name: true, phone: true } },
        revenueStaff: { select: { id: true, displayName: true, colorCode: true } },
        serviceStaff: { select: { id: true, displayName: true } },
        servicePlan: { select: { id: true, name: true } },
      };

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: includeFields,
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

  // 「顧客屬於店」：所有 Manager 可查看任何預約詳情
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
    user.role !== "OWNER" && user.staffId
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
  const endDate = new Date(Date.UTC(year, month, 0));

  // ⚡ 優化：用 groupBy 取每日統計，避免 fetch 整月所有 booking 行
  const [dailyCounts, staffCounts] = await Promise.all([
    prisma.booking.groupBy({
      by: ["bookingDate"],
      where: {
        bookingDate: { gte: startDate, lte: endDate },
        bookingStatus: { in: ["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"] },
      },
      _count: { id: true },
      _sum: { people: true },
    }),
    prisma.booking.groupBy({
      by: ["bookingDate", "revenueStaffId"],
      where: {
        bookingDate: { gte: startDate, lte: endDate },
        bookingStatus: { in: ["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"] },
        revenueStaffId: { not: null },
      },
      _count: { id: true },
    }),
  ]);

  // 取涉及的 staff 名稱
  const staffIds = [...new Set(staffCounts.map((s) => s.revenueStaffId!).filter(Boolean))];
  const staffList = staffIds.length > 0
    ? await prisma.staff.findMany({
        where: { id: { in: staffIds } },
        select: { id: true, displayName: true, colorCode: true },
      })
    : [];
  const staffMap = new Map(staffList.map((s) => [s.id, s]));

  // 組裝每日資料
  const dailyMap = new Map<string, { total: number; totalPeople: number; staffBookings: { staffName: string; colorCode: string; count: number }[] }>();

  for (let day = 1; day <= endDate.getUTCDate(); day++) {
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    dailyMap.set(dateKey, { total: 0, totalPeople: 0, staffBookings: [] });
  }

  for (const row of dailyCounts) {
    const dateKey = row.bookingDate.toISOString().slice(0, 10);
    const entry = dailyMap.get(dateKey);
    if (entry) {
      entry.total = row._count.id;
      entry.totalPeople = row._sum.people ?? 0;
    }
  }

  // 按日期+staff 組裝
  const staffByDate = new Map<string, Map<string, number>>();
  for (const row of staffCounts) {
    const dateKey = row.bookingDate.toISOString().slice(0, 10);
    if (!staffByDate.has(dateKey)) staffByDate.set(dateKey, new Map());
    staffByDate.get(dateKey)!.set(row.revenueStaffId!, row._count.id);
  }

  for (const [dateKey, staffCountMap] of staffByDate) {
    const entry = dailyMap.get(dateKey);
    if (!entry) continue;
    entry.staffBookings = Array.from(staffCountMap.entries()).map(([sid, count]) => {
      const staff = staffMap.get(sid);
      return {
        staffName: staff?.displayName ?? "Unknown",
        colorCode: staff?.colorCode ?? "#999",
        count,
      };
    });
  }

  return Array.from(dailyMap.entries()).map(([dateStr, data]) => ({
    date: dateStr,
    totalBookingCount: data.total,
    totalPeople: data.totalPeople,
    staffBookings: data.staffBookings,
  }));
}
