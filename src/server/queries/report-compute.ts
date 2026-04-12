/**
 * Report compute — session-free versions of report queries for cron pre-compute.
 * These compute store-wide data (OWNER perspective) without session checks.
 */
import { prisma } from "@/lib/db";
import { monthRange as sharedMonthRange } from "@/lib/date-utils";
import { REVENUE_TRANSACTION_TYPES } from "@/lib/booking-constants";

import { DEFAULT_STORE_ID } from "@/lib/store";

const REVENUE_TYPES = [...REVENUE_TRANSACTION_TYPES];

function monthRange(month: string) {
  const { start, end } = sharedMonthRange(month);
  return { monthStart: start, monthEnd: end };
}

export async function computeStoreSummary(month: string, storeId?: string) {
  const { monthStart, monthEnd } = monthRange(month);
  const storeFilter = { storeId: storeId || DEFAULT_STORE_ID };

  const allStaff = await prisma.staff.findMany({
    where: { status: "ACTIVE", ...storeFilter },
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
    prisma.transaction.groupBy({
      by: ["revenueStaffId"],
      where: {
        transactionType: { in: REVENUE_TYPES as never },
        createdAt: { gte: monthStart, lte: monthEnd },
        ...storeFilter,
      },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.transaction.aggregate({
      where: {
        transactionType: "REFUND",
        createdAt: { gte: monthStart, lte: monthEnd },
        ...storeFilter,
      },
      _sum: { amount: true },
    }),
    prisma.booking.count({
      where: {
        bookingStatus: "COMPLETED",
        bookingDate: { gte: monthStart, lte: monthEnd },
        ...storeFilter,
      },
    }),
    prisma.cashbookEntry.groupBy({
      by: ["type"],
      where: { entryDate: { gte: monthStart, lte: monthEnd }, ...storeFilter },
      _sum: { amount: true },
    }),
    prisma.spaceFeeRecord.aggregate({
      where: { month, ...storeFilter },
      _sum: { feeAmount: true },
    }),
    prisma.spaceFeeRecord.findMany({
      where: { month, ...storeFilter },
      select: { staffId: true, feeAmount: true },
    }),
    prisma.customer.groupBy({
      by: ["assignedStaffId"],
      where: { ...storeFilter },
      _count: { id: true },
    }),
    prisma.customer.groupBy({
      by: ["assignedStaffId"],
      where: { customerStage: "ACTIVE", ...storeFilter },
      _count: { id: true },
    }),
    prisma.booking.groupBy({
      by: ["revenueStaffId"],
      where: {
        bookingStatus: "COMPLETED",
        bookingDate: { gte: monthStart, lte: monthEnd },
        ...storeFilter,
      },
      _count: { id: true },
    }),
  ]);

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

export async function computeRevenueByCategory(month: string, storeId?: string) {
  const { monthStart, monthEnd } = monthRange(month);
  const storeFilter = { storeId: storeId || DEFAULT_STORE_ID };

  const rows = await prisma.transaction.groupBy({
    by: ["revenueStaffId", "transactionType"],
    where: {
      transactionType: { in: REVENUE_TYPES as never },
      createdAt: { gte: monthStart, lte: monthEnd },
      ...storeFilter,
    },
    _sum: { amount: true },
    _count: { id: true },
  });

  const refunds = await prisma.transaction.groupBy({
    by: ["revenueStaffId"],
    where: {
      transactionType: "REFUND",
      createdAt: { gte: monthStart, lte: monthEnd },
      ...storeFilter,
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

  for (const staffId of Object.keys(byStaff)) {
    byStaff[staffId].refundAmount = refundMap[staffId] ?? 0;
    byStaff[staffId].netRevenue = byStaff[staffId].totalRevenue + (refundMap[staffId] ?? 0);
  }

  return Object.values(byStaff);
}
