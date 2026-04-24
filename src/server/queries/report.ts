/**
 * 報表查詢（唯讀）
 * Round 4 enhanced: staffBreakdown includes customerCount, activeCustomerCount
 * customerConsumptionDetail supports optional month filter
 */

import { prisma } from "@/lib/db";
import { requireStaffSession, requireSession } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { monthRange as sharedMonthRange, dayRange } from "@/lib/date-utils";
import { getManagerReadFilter, getVisibilityMode, getStoreFilter } from "@/lib/manager-visibility";
import { REVENUE_TRANSACTION_TYPES } from "@/lib/booking-constants";

const REVENUE_TYPES = [...REVENUE_TRANSACTION_TYPES];

// TODO(PR-payment-confirm): PR-3/4 上線「轉帳待確認」後，本檔內所有 Transaction 營收查詢
// （groupBy/aggregate with transactionType ∈ REVENUE_TYPES）必須加 paymentStatus filter：
//   where: { paymentStatus: { in: ["SUCCESS", "CONFIRMED"] } }
// 本 PR-1 不加：歷史交易已 backfill=SUCCESS，現行報表語意與上線前完全一致。

// 使用共用日期工具
function monthRange(month: string) {
  const { start, end } = sharedMonthRange(month);
  return { monthStart: start, monthEnd: end };
}

/**
 * 從 startDate / endDate 字串計算 UTC 邊界
 * 支援同日（today preset）和跨日（custom range）
 */
function dateRangeBounds(startDate: string, endDate: string) {
  const startBounds = dayRange(startDate);
  const endBounds = dayRange(endDate);
  return { rangeStart: startBounds.start, rangeEnd: endBounds.end };
}

// ============================================================
// monthlyStaffRevenueSummary
// ============================================================
export async function monthlyStaffRevenueSummary(month: string, activeStoreId?: string | null) {
  const user = await requireStaffSession();
  const { monthStart, monthEnd } = monthRange(month);

  const revenueFilter = getManagerReadFilter(user.role, user.staffId, "revenueStaffId", activeStoreId ?? user.storeId);

  const [rows, completedBookings] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["revenueStaffId"],
      where: {
        ...revenueFilter,
        transactionType: { in: REVENUE_TYPES as never },
        createdAt: { gte: monthStart, lte: monthEnd },
      },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.booking.groupBy({
      by: ["revenueStaffId"],
      where: {
        ...revenueFilter,
        bookingStatus: "COMPLETED",
        bookingDate: { gte: monthStart, lte: monthEnd },
      },
      _count: { id: true },
    }),
  ]);

  const completedMap: Record<string, number> = {};
  for (const b of completedBookings) {
    const cnt = b._count as { id: number };
    const sid = b.revenueStaffId ?? "unassigned";
    completedMap[sid] = cnt.id;
  }

  const staffIds = rows.map((r) => r.revenueStaffId).filter((id): id is string => id !== null);
  const staffList = await prisma.staff.findMany({
    where: { id: { in: staffIds } },
    select: { id: true, displayName: true },
  });
  const staffMap = Object.fromEntries(staffList.map((s) => [s.id, s.displayName]));

  return rows.map((r) => {
    const sum = r._sum as { amount: unknown };
    const cnt = r._count as { id: number };
    const sid = r.revenueStaffId ?? "unassigned";
    return {
      staffId: sid,
      staffName: staffMap[sid] ?? "未指派",
      month,
      totalRevenue: Number(sum.amount ?? 0),
      transactionCount: cnt.id,
      completedBookings: completedMap[sid] ?? 0,
    };
  });
}

// ============================================================
// monthlyStaffNetSummary
// ============================================================
export async function monthlyStaffNetSummary(month: string, activeStoreId?: string | null) {
  const user = await requireStaffSession();
  const { monthStart, monthEnd } = monthRange(month);

  const revenueFilter = getManagerReadFilter(user.role, user.staffId, "revenueStaffId", activeStoreId ?? user.storeId);
  const staffIdFilter = getManagerReadFilter(user.role, user.staffId, "staffId", activeStoreId ?? user.storeId);

  const revenueRows = await prisma.transaction.groupBy({
    by: ["revenueStaffId"],
    where: {
      ...revenueFilter,
      transactionType: { in: REVENUE_TYPES as never },
      createdAt: { gte: monthStart, lte: monthEnd },
    },
    _sum: { amount: true },
  });

  const spaceFeeFilter = staffIdFilter;

  const spaceFees = await prisma.spaceFeeRecord.findMany({
    where: { ...spaceFeeFilter, month },
    select: { staffId: true, feeAmount: true },
  });
  const spaceFeeMap: Record<string, number> = {};
  for (const fee of spaceFees) spaceFeeMap[fee.staffId] = Number(fee.feeAmount);

  const staffIds = revenueRows.map((r) => r.revenueStaffId);
  const staffList = await prisma.staff.findMany({
    where: { id: { in: staffIds } },
    select: { id: true, displayName: true },
  });
  const staffMap = Object.fromEntries(staffList.map((s) => [s.id, s.displayName]));

  return revenueRows.map((r) => {
    const sum = r._sum as { amount: unknown };
    const totalRevenue = Number(sum.amount ?? 0);
    const spaceFee = spaceFeeMap[r.revenueStaffId] ?? 0;
    return {
      staffId: r.revenueStaffId,
      staffName: staffMap[r.revenueStaffId] ?? "未知",
      month,
      totalRevenue,
      spaceFee,
      netRevenue: totalRevenue - spaceFee,
    };
  });
}

// ============================================================
// monthlyStoreSummary — Enhanced with per-staff customer counts
// 支援 startDate/endDate 日期範圍查詢
// ============================================================
export async function monthlyStoreSummary(
  month: string,
  options?: { startDate?: string; endDate?: string; activeStoreId?: string | null }
) {
  const user = await requireStaffSession();
  const activeStoreId = options?.activeStoreId;
  // 如果有傳入 startDate/endDate，使用精確日期範圍；否則用月份
  const { monthStart, monthEnd } = options?.startDate && options?.endDate
    ? (() => {
        const { rangeStart, rangeEnd } = dateRangeBounds(options.startDate!, options.endDate!);
        return { monthStart: rangeStart, monthEnd: rangeEnd };
      })()
    : monthRange(month);

  const revenueFilter = getManagerReadFilter(user.role, user.staffId, "revenueStaffId", activeStoreId ?? user.storeId);
  const staffIdFilter = getManagerReadFilter(user.role, user.staffId, "staffId", activeStoreId ?? user.storeId);
  const assignedFilter = getManagerReadFilter(user.role, user.staffId, "assignedStaffId", activeStoreId ?? user.storeId);

  // SpaceFeeRecord now has storeId — use staffIdFilter directly
  const spaceFeeFilter = staffIdFilter;

  // All staff visible to this user
  const allStaff = await prisma.staff.findMany({
    where:
      user.role !== "ADMIN" && user.staffId && Object.keys(revenueFilter).length > 0
        ? { id: user.staffId }
        : { status: "ACTIVE", ...(activeStoreId ? { storeId: activeStoreId } : {}) },
    select: { id: true, displayName: true },
  });
  const allStaffIds = allStaff.map((s) => s.id);
  const staffNameMap = Object.fromEntries(allStaff.map((s) => [s.id, s.displayName]));

  const [
    revenueRows,
    refundAgg,
    completedBookingsAgg,
    cashbookAggs,
    spaceFeeAgg,
    spaceFees,
    customerCounts,
    activeCustomerCounts,
    completedByStaff,
  ] = await Promise.all([
    // Revenue by staff
    prisma.transaction.groupBy({
      by: ["revenueStaffId"],
      where: {
        ...revenueFilter,
        transactionType: { in: REVENUE_TYPES as never },
        createdAt: { gte: monthStart, lte: monthEnd },
      },
      _sum: { amount: true },
      _count: { id: true },
    }),
    // Total refunds
    prisma.transaction.aggregate({
      where: {
        ...revenueFilter,
        transactionType: "REFUND",
        createdAt: { gte: monthStart, lte: monthEnd },
      },
      _sum: { amount: true },
    }),
    // Total completed bookings
    prisma.booking.count({
      where: {
        ...revenueFilter,
        bookingStatus: "COMPLETED",
        bookingDate: { gte: monthStart, lte: monthEnd },
      },
    }),
    // Cashbook
    prisma.cashbookEntry.groupBy({
      by: ["type"],
      where: {
        ...staffIdFilter,
        entryDate: { gte: monthStart, lte: monthEnd },
      },
      _sum: { amount: true },
    }),
    // Space fees total
    prisma.spaceFeeRecord.aggregate({
      where: {
        ...spaceFeeFilter,
        month,
      },
      _sum: { feeAmount: true },
    }),
    // Space fees per staff
    prisma.spaceFeeRecord.findMany({
      where: {
        ...spaceFeeFilter,
        month,
      },
      select: { staffId: true, feeAmount: true },
    }),
    // Customer count per staff — 只計算「該期間有預約」的顧客，避免整張 Customer 表掃描
    prisma.customer.groupBy({
      by: ["assignedStaffId"],
      where: {
        ...assignedFilter,
        bookings: {
          some: {
            bookingDate: { gte: monthStart, lte: monthEnd },
          },
        },
      },
      _count: { id: true },
    }),
    // Active customer count per staff — 同上 + ACTIVE stage
    prisma.customer.groupBy({
      by: ["assignedStaffId"],
      where: {
        ...assignedFilter,
        customerStage: "ACTIVE",
        bookings: {
          some: {
            bookingDate: { gte: monthStart, lte: monthEnd },
          },
        },
      },
      _count: { id: true },
    }),
    // Completed bookings per staff this month
    prisma.booking.groupBy({
      by: ["revenueStaffId"],
      where: {
        ...revenueFilter,
        bookingStatus: "COMPLETED",
        bookingDate: { gte: monthStart, lte: monthEnd },
      },
      _count: { id: true },
    }),
  ]);

  // Build maps
  const revenueMap: Record<string, number> = {};
  const txCountMap: Record<string, number> = {};
  for (const r of revenueRows) {
    const sum = r._sum as { amount: unknown };
    const cnt = r._count as { id: number };
    const sid = r.revenueStaffId ?? "unassigned";
    revenueMap[sid] = Number(sum.amount ?? 0);
    txCountMap[sid] = cnt.id;
  }
  const spaceFeeMap: Record<string, number> = {};
  for (const f of spaceFees) spaceFeeMap[f.staffId] = Number(f.feeAmount);
  const customerCountMap: Record<string, number> = {};
  for (const c of customerCounts) {
    const cnt = c._count as { id: number };
    const sid = c.assignedStaffId ?? "unassigned";
    customerCountMap[sid] = cnt.id;
  }
  const activeCountMap: Record<string, number> = {};
  for (const c of activeCustomerCounts) {
    const cnt = c._count as { id: number };
    const sid = c.assignedStaffId ?? "unassigned";
    activeCountMap[sid] = cnt.id;
  }
  const completedByStaffMap: Record<string, number> = {};
  for (const b of completedByStaff) {
    const cnt = b._count as { id: number };
    const sid = b.revenueStaffId ?? "unassigned";
    completedByStaffMap[sid] = cnt.id;
  }

  const cashbookMap: Record<string, number> = {};
  for (const agg of cashbookAggs) {
    const sum = agg._sum as { amount: unknown };
    cashbookMap[agg.type] = Number(sum.amount ?? 0);
  }

  const totalCourseRevenue = revenueRows.reduce((s, r) => {
    const sum = r._sum as { amount: unknown };
    return s + Number(sum.amount ?? 0);
  }, 0);
  const totalRefund = Number(refundAgg._sum.amount ?? 0);
  const totalSpaceFee = Number(spaceFeeAgg._sum.feeAmount ?? 0);

  // Build per-staff breakdown using allStaff (not just those with revenue)
  const staffBreakdown = allStaffIds.map((staffId) => {
    const totalRevenue = revenueMap[staffId] ?? 0;
    const spaceFee = spaceFeeMap[staffId] ?? 0;
    return {
      staffId,
      staffName: staffNameMap[staffId] ?? "未知",
      customerCount: customerCountMap[staffId] ?? 0,
      activeCustomerCount: activeCountMap[staffId] ?? 0,
      completedBookings: completedByStaffMap[staffId] ?? 0,
      totalRevenue,
      transactionCount: txCountMap[staffId] ?? 0,
      spaceFee,
      netRevenue: totalRevenue - spaceFee,
    };
  });

  return {
    month,
    totalCourseRevenue,
    totalRefund,
    netCourseRevenue: totalCourseRevenue + totalRefund,
    completedBookings: completedBookingsAgg,
    cashbookIncome: cashbookMap["INCOME"] ?? 0,
    cashbookExpense: (cashbookMap["EXPENSE"] ?? 0) + (cashbookMap["WITHDRAW"] ?? 0),
    totalSpaceFee,
    staffBreakdown,
  };
}

// ============================================================
// monthlyRevenueByCategory — groups revenue by transactionType and revenueStaffId
// 支援 startDate/endDate 日期範圍查詢
// ============================================================
export async function monthlyRevenueByCategory(
  month: string,
  options?: { startDate?: string; endDate?: string; activeStoreId?: string | null }
) {
  const user = await requireStaffSession();
  const activeStoreId = options?.activeStoreId;
  const { monthStart, monthEnd } = options?.startDate && options?.endDate
    ? (() => {
        const { rangeStart, rangeEnd } = dateRangeBounds(options.startDate!, options.endDate!);
        return { monthStart: rangeStart, monthEnd: rangeEnd };
      })()
    : monthRange(month);

  const revenueFilter = getManagerReadFilter(user.role, user.staffId, "revenueStaffId", activeStoreId ?? user.storeId);

  const rows = await prisma.transaction.groupBy({
    by: ["revenueStaffId", "transactionType"],
    where: {
      ...revenueFilter,
      transactionType: { in: REVENUE_TYPES as never },
      createdAt: { gte: monthStart, lte: monthEnd },
    },
    _sum: { amount: true },
    _count: { id: true },
  });

  // Also get refunds by staff
  const refunds = await prisma.transaction.groupBy({
    by: ["revenueStaffId"],
    where: {
      ...revenueFilter,
      transactionType: "REFUND",
      createdAt: { gte: monthStart, lte: monthEnd },
    },
    _sum: { amount: true },
  });

  const staffIds = [...new Set(rows.map((r) => r.revenueStaffId))];
  const staffList = await prisma.staff.findMany({
    where: { id: { in: staffIds } },
    select: { id: true, displayName: true },
  });
  const staffMap = Object.fromEntries(staffList.map((s) => [s.id, s.displayName]));

  const refundMap: Record<string, number> = {};
  for (const r of refunds) refundMap[r.revenueStaffId] = Number((r._sum as { amount: unknown }).amount ?? 0);

  // Build per-staff breakdown
  const byStaff: Record<string, {
    staffId: string;
    staffName: string;
    trialRevenue: number;
    singleRevenue: number;
    packageRevenue: number;
    supplementRevenue: number;
    refundAmount: number;
    totalRevenue: number;
    netRevenue: number;
  }> = {};

  for (const r of rows) {
    if (!byStaff[r.revenueStaffId]) {
      byStaff[r.revenueStaffId] = {
        staffId: r.revenueStaffId,
        staffName: staffMap[r.revenueStaffId] ?? "未知",
        trialRevenue: 0,
        singleRevenue: 0,
        packageRevenue: 0,
        supplementRevenue: 0,
        refundAmount: 0,
        totalRevenue: 0,
        netRevenue: 0,
      };
    }
    const amount = Number((r._sum as { amount: unknown }).amount ?? 0);
    const entry = byStaff[r.revenueStaffId];
    if (r.transactionType === "TRIAL_PURCHASE") entry.trialRevenue += amount;
    else if (r.transactionType === "SINGLE_PURCHASE") entry.singleRevenue += amount;
    else if (r.transactionType === "PACKAGE_PURCHASE") entry.packageRevenue += amount;
    else if (r.transactionType === "SUPPLEMENT") entry.supplementRevenue += amount;
    entry.totalRevenue += amount;
  }

  // Apply refunds
  for (const staffId of Object.keys(byStaff)) {
    byStaff[staffId].refundAmount = refundMap[staffId] ?? 0; // negative number
    byStaff[staffId].netRevenue = byStaff[staffId].totalRevenue + (refundMap[staffId] ?? 0);
  }

  return Object.values(byStaff);
}

// ============================================================
// customerConsumptionDetail — with optional month filter
// ============================================================
export async function customerConsumptionDetail(customerId: string, month?: string) {
  const user = await requireSession();

  const storeFilter = user.role !== "CUSTOMER" ? getStoreFilter(user) : {};
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, ...storeFilter },
    select: { id: true, name: true, phone: true, assignedStaffId: true, customerStage: true, selfBookingEnabled: true },
  });
  if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");

  if (user.role === "CUSTOMER") {
    if (!user.customerId || user.customerId !== customerId)
      throw new AppError("FORBIDDEN", "只能查看自己的消費記錄");
  }
  if (user.role !== "ADMIN" && user.role !== "CUSTOMER") {
    const mode = getVisibilityMode();
    if (mode === "SELF_ONLY") {
      if (!user.staffId || customer.assignedStaffId !== user.staffId)
        throw new AppError("FORBIDDEN", "無法查看其他員工名下的顧客");
    }
  }

  // Build date filter if month provided
  let dateFilter: { createdAt?: { gte: Date; lte: Date } } = {};
  if (month) {
    const { monthStart, monthEnd } = monthRange(month);
    dateFilter = { createdAt: { gte: monthStart, lte: monthEnd } };
  }

  const [transactions, wallets] = await Promise.all([
    prisma.transaction.findMany({
      where: { customerId, ...dateFilter },
      include: {
        revenueStaff: { select: { displayName: true } },
        customerPlanWallet: { select: { plan: { select: { name: true } } } },
        booking: { select: { bookingDate: true, slotTime: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.customerPlanWallet.findMany({
      where: { customerId },
      include: { plan: { select: { name: true, category: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const totalPurchased = transactions
    .filter((t) => (REVENUE_TYPES as string[]).includes(t.transactionType))
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const totalRefunded = transactions
    .filter((t) => t.transactionType === "REFUND")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const totalDeductions = transactions.filter((t) => t.transactionType === "SESSION_DEDUCTION").length;
  const totalRemainingSessions = wallets
    .filter((w) => w.status === "ACTIVE")
    .reduce((sum, w) => sum + w.remainingSessions, 0);

  return {
    customer,
    transactions,
    wallets,
    summary: {
      totalPurchased,
      totalRefunded,
      netSpent: totalPurchased + totalRefunded,
      totalDeductions,
      totalRemainingSessions,
    },
  };
}
