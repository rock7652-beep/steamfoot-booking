import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { getManagerReadFilter } from "@/lib/manager-visibility";
import type { CashbookEntryType } from "@prisma/client";

export interface ListCashbookOptions {
  dateFrom?: string; // "YYYY-MM-DD"
  dateTo?: string;
  type?: CashbookEntryType;
  staffId?: string;
  page?: number;
  pageSize?: number;
}

// ============================================================
// listCashbookEntries
// Owner: 全部；Manager: 只有自己的
// ============================================================

export async function listCashbookEntries(options: ListCashbookOptions & { activeStoreId?: string | null } = {}) {
  const user = await requireStaffSession();
  const { dateFrom, dateTo, type, staffId, activeStoreId, page = 1, pageSize = 30 } = options;

  // Manager 篩選（讀取型：受 visibility mode 控制）
  const visibilityFilter = getManagerReadFilter(user.role, user.staffId, "staffId", activeStoreId ?? user.storeId);
  const staffFilter = Object.keys(visibilityFilter).length > 0
    ? visibilityFilter
    : staffId
    ? { staffId }
    : {};

  const where = {
    ...staffFilter,
    ...(type ? { type } : {}),
    ...(dateFrom || dateTo
      ? {
          entryDate: {
            ...(dateFrom ? { gte: new Date(dateFrom + "T00:00:00Z") } : {}),
            ...(dateTo ? { lte: new Date(dateTo + "T23:59:59Z") } : {}),
          },
        }
      : {}),
  };

  const [entries, total] = await Promise.all([
    prisma.cashbookEntry.findMany({
      where,
      include: {
        staff: { select: { id: true, displayName: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.cashbookEntry.count({ where }),
  ]);

  return { entries, total, page, pageSize };
}

// ============================================================
// getDailySummary — 某天的收支匯總
// ============================================================

export async function getDailySummary(date: string, activeStoreId?: string | null) {
  const user = await requireStaffSession();

  const staffFilter = getManagerReadFilter(user.role, user.staffId, "staffId", activeStoreId ?? user.storeId);

  const dayStart = new Date(date + "T00:00:00Z");
  const dayEnd = new Date(date + "T23:59:59Z");

  const entries = await prisma.cashbookEntry.findMany({
    where: {
      ...staffFilter,
      entryDate: { gte: dayStart, lte: dayEnd },
    },
    include: {
      staff: { select: { displayName: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const income = entries
    .filter((e) => e.type === "INCOME")
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const expense = entries
    .filter((e) => e.type === "EXPENSE" || e.type === "WITHDRAW")
    .reduce((sum, e) => sum + Number(e.amount), 0);

  return {
    date,
    income,
    expense,
    net: income - expense,
    entries,
  };
}

// ============================================================
// getMonthlySummary — 月度收支匯總
// ============================================================

export async function getMonthlySummary(month: string, activeStoreId?: string | null) {
  // month: "YYYY-MM"
  const user = await requireStaffSession();

  const staffFilter = getManagerReadFilter(user.role, user.staffId, "staffId", activeStoreId ?? user.storeId);

  const [year, mon] = month.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, mon - 1, 1));
  const monthEnd = new Date(Date.UTC(year, mon, 0, 23, 59, 59)); // last day of month

  const aggregates = await prisma.cashbookEntry.groupBy({
    by: ["type"],
    where: {
      ...staffFilter,
      entryDate: { gte: monthStart, lte: monthEnd },
    },
    _sum: { amount: true },
    _count: { id: true },
  });

  const summary: Record<string, { total: number; count: number }> = {};
  for (const agg of aggregates) {
    summary[agg.type] = {
      total: Number(agg._sum.amount ?? 0),
      count: agg._count.id,
    };
  }

  const income = summary["INCOME"]?.total ?? 0;
  const expense = (summary["EXPENSE"]?.total ?? 0) + (summary["WITHDRAW"]?.total ?? 0);

  return {
    month,
    income,
    expense,
    net: income - expense,
    breakdown: summary,
  };
}
