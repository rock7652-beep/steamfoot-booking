"use server";

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import {
  todayRange,
  dayRange,
  bookingDateToday,
  toLocalDateStr,
} from "@/lib/date-utils";
import {
  REVENUE_TRANSACTION_TYPES,
  REVENUE_NET_TYPES,
  REVENUE_VALID_STATUS,
} from "@/lib/booking-constants";
import { getStoreFilter } from "@/lib/manager-visibility";

// TODO(PR-payment-confirm): PR-3/4 上線後，本檔 Transaction 營收 aggregate
// 必須加 paymentStatus: { in: ["SUCCESS", "CONFIRMED"] }，否則 Ops 面板會顯示 PENDING 誤差。
// 本 PR-1 不加：歷史 backfill=SUCCESS，現行數字與上線前一致。

// ============================================================
// 1. 今日營運總覽
// ============================================================

export interface TodaySummary {
  bookingCount: number;
  arrivedCount: number;     // COMPLETED
  completedCount: number;   // COMPLETED
  cancelledCount: number;   // CANCELLED
  noShowCount: number;      // NO_SHOW
  pendingCount: number;     // PENDING + CONFIRMED
  todayRevenue: number;
  newCustomerCount: number;
}

export async function getTodaySummary(activeStoreId?: string | null): Promise<TodaySummary> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);
  const today = todayRange();
  const todayBookingDate = bookingDateToday();

  const [bookings, todayRevenueAgg, newCustomerCount] = await Promise.all([
    prisma.booking.groupBy({
      by: ["bookingStatus"],
      where: { bookingDate: todayBookingDate, ...storeFilter },
      _count: { id: true },
    }),
    prisma.transaction.aggregate({
      where: {
        createdAt: { gte: today.start, lte: today.end },
        // v2: 包含 REFUND（負數）→ sum 即為淨營收
        transactionType: { in: [...REVENUE_NET_TYPES] },
        status: REVENUE_VALID_STATUS,
        ...storeFilter,
      },
      _sum: { amount: true },
    }),
    prisma.customer.count({
      where: { createdAt: { gte: today.start, lte: today.end }, ...storeFilter },
    }),
  ]);

  const statusMap = Object.fromEntries(
    bookings.map((b) => [b.bookingStatus, b._count.id])
  );

  return {
    bookingCount:
      (statusMap.PENDING ?? 0) +
      (statusMap.CONFIRMED ?? 0) +
      (statusMap.COMPLETED ?? 0) +
      (statusMap.NO_SHOW ?? 0),
    arrivedCount: statusMap.COMPLETED ?? 0,
    completedCount: statusMap.COMPLETED ?? 0,
    cancelledCount: statusMap.CANCELLED ?? 0,
    noShowCount: statusMap.NO_SHOW ?? 0,
    pendingCount: (statusMap.PENDING ?? 0) + (statusMap.CONFIRMED ?? 0),
    todayRevenue: Number(todayRevenueAgg._sum.amount ?? 0),
    newCustomerCount,
  };
}

// ============================================================
// 2. N 日趨勢 (7日 / 30日)
// ============================================================

export interface DayTrend {
  date: string; // YYYY-MM-DD
  bookingCount: number;
  arrivedCount: number;
  revenue: number;
  newCustomerCount: number;
  returningCustomerCount: number;
}

export async function getDailyTrend(days: number, activeStoreId?: string | null): Promise<DayTrend[]> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);

  // 計算 N 天前的日期 (UTC+8)
  const now = new Date();
  const todayStr = toLocalDateStr(now);
  const startDate = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const startStr = toLocalDateStr(startDate);

  // 生成所有日期
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    dates.push(toLocalDateStr(d));
  }

  const startRange = dayRange(startStr);
  const endRange = dayRange(todayStr);

  // Parallel queries
  const [bookingsByDay, transactionsByDay, newCustomersByDay, allCustomerBookings] =
    await Promise.all([
      // Bookings grouped by date + status
      prisma.booking.findMany({
        where: {
          bookingDate: {
            gte: new Date(startStr + "T00:00:00.000Z"),
            lte: new Date(todayStr + "T00:00:00.000Z"),
          },
          bookingStatus: { in: ["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"] },
          ...storeFilter,
        },
        select: { bookingDate: true, bookingStatus: true },
      }),

      // Daily revenue（趨勢圖：含退款顯示 net）
      prisma.transaction.findMany({
        where: {
          createdAt: { gte: startRange.start, lte: endRange.end },
          transactionType: { in: [...REVENUE_NET_TYPES] },
          status: REVENUE_VALID_STATUS,
          ...storeFilter,
        },
        select: { createdAt: true, amount: true },
      }),

      // New customers per day
      prisma.customer.findMany({
        where: { createdAt: { gte: startRange.start, lte: endRange.end }, ...storeFilter },
        select: { createdAt: true },
      }),

      // For returning vs new calculation: customers with bookings in this range
      prisma.booking.findMany({
        where: {
          bookingDate: {
            gte: new Date(startStr + "T00:00:00.000Z"),
            lte: new Date(todayStr + "T00:00:00.000Z"),
          },
          bookingStatus: { in: ["COMPLETED"] },
          ...storeFilter,
        },
        select: { bookingDate: true, customerId: true, customer: { select: { firstVisitAt: true } } },
      }),
    ]);

  // Build lookup maps
  const bookingMap = new Map<string, { total: number; arrived: number }>();
  for (const b of bookingsByDay) {
    const dateStr = b.bookingDate.toISOString().slice(0, 10);
    const entry = bookingMap.get(dateStr) ?? { total: 0, arrived: 0 };
    entry.total++;
    if (b.bookingStatus === "COMPLETED") entry.arrived++;
    bookingMap.set(dateStr, entry);
  }

  const revenueMap = new Map<string, number>();
  for (const t of transactionsByDay) {
    const dateStr = toLocalDateStr(t.createdAt);
    revenueMap.set(dateStr, (revenueMap.get(dateStr) ?? 0) + Number(t.amount));
  }

  const newCustMap = new Map<string, number>();
  for (const c of newCustomersByDay) {
    const dateStr = toLocalDateStr(c.createdAt);
    newCustMap.set(dateStr, (newCustMap.get(dateStr) ?? 0) + 1);
  }

  // Returning customers: completed booking where firstVisitAt < bookingDate
  const returningMap = new Map<string, number>();
  for (const b of allCustomerBookings) {
    const dateStr = b.bookingDate.toISOString().slice(0, 10);
    if (b.customer.firstVisitAt && b.customer.firstVisitAt < b.bookingDate) {
      returningMap.set(dateStr, (returningMap.get(dateStr) ?? 0) + 1);
    }
  }

  return dates.map((date) => ({
    date,
    bookingCount: bookingMap.get(date)?.total ?? 0,
    arrivedCount: bookingMap.get(date)?.arrived ?? 0,
    revenue: revenueMap.get(date) ?? 0,
    newCustomerCount: newCustMap.get(date) ?? 0,
    returningCustomerCount: returningMap.get(date) ?? 0,
  }));
}

// ============================================================
// 3. 營運漏斗（基於現有資料推算）
// ============================================================

export interface FunnelStep {
  label: string;
  count: number;
  pct: number; // 相對第一步的百分比
}

export async function getOperationsFunnel(days: number, activeStoreId?: string | null): Promise<FunnelStep[]> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);

  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const startStr = toLocalDateStr(startDate);
  const todayStr = toLocalDateStr(now);
  const startRange = dayRange(startStr);
  const endRange = dayRange(todayStr);

  const [
    uniqueCustomers,
    bookingCreated,
    bookingConfirmed,
    bookingCompleted,
    transactionCount,
    repeatPurchase,
  ] = await Promise.all([
    // 活躍顧客數（有任何動作的 distinct customer）
    prisma.customer.count({
      where: {
        ...storeFilter,
        OR: [
          { lastVisitAt: { gte: startRange.start } },
          { createdAt: { gte: startRange.start, lte: endRange.end } },
          { bookings: { some: { bookingDate: { gte: new Date(startStr + "T00:00:00.000Z") } } } },
        ],
      },
    }),
    // 已建立預約
    prisma.booking.count({
      where: {
        createdAt: { gte: startRange.start, lte: endRange.end },
        ...storeFilter,
      },
    }),
    // 已確認預約
    prisma.booking.count({
      where: {
        createdAt: { gte: startRange.start, lte: endRange.end },
        bookingStatus: { in: ["CONFIRMED", "COMPLETED"] },
        ...storeFilter,
      },
    }),
    // 已到店完成
    prisma.booking.count({
      where: {
        bookingDate: {
          gte: new Date(startStr + "T00:00:00.000Z"),
          lte: new Date(todayStr + "T00:00:00.000Z"),
        },
        bookingStatus: "COMPLETED",
        ...storeFilter,
      },
    }),
    // 有交易（付款）
    prisma.transaction.count({
      where: {
        createdAt: { gte: startRange.start, lte: endRange.end },
        transactionType: { in: [...REVENUE_TRANSACTION_TYPES] },
        status: REVENUE_VALID_STATUS,
        ...storeFilter,
      },
    }),
    // 回購（有多於 1 筆套票購買的顧客）
    prisma.customer.count({
      where: {
        ...storeFilter,
        transactions: {
          some: {
            createdAt: { gte: startRange.start, lte: endRange.end },
            transactionType: "PACKAGE_PURCHASE",
          },
        },
        planWallets: { some: { status: "ACTIVE" } },
      },
    }),
  ]);

  const base = uniqueCustomers || 1;
  const steps: FunnelStep[] = [
    { label: "活躍顧客", count: uniqueCustomers, pct: 100 },
    { label: "建立預約", count: bookingCreated, pct: Math.round((bookingCreated / base) * 100) },
    { label: "確認預約", count: bookingConfirmed, pct: Math.round((bookingConfirmed / base) * 100) },
    { label: "實際到店", count: bookingCompleted, pct: Math.round((bookingCompleted / base) * 100) },
    { label: "完成付款", count: transactionCount, pct: Math.round((transactionCount / base) * 100) },
    { label: "回購 / 套票", count: repeatPurchase, pct: Math.round((repeatPurchase / base) * 100) },
  ];

  return steps;
}

// ============================================================
// 4. 高價值顧客排行
// ============================================================

export interface TopCustomer {
  id: string;
  name: string;
  phone: string;
  totalSpent: number;
  bookingCount: number;
  lastVisit: string | null;
  activeWallets: number;
  score: number;
}

export async function getTopCustomers(limit = 10, activeStoreId?: string | null): Promise<TopCustomer[]> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const customers = await prisma.customer.findMany({
    where: {
      ...storeFilter,
      OR: [
        { lastVisitAt: { gte: sixMonthsAgo } },
        { transactions: { some: { createdAt: { gte: sixMonthsAgo } } } },
      ],
    },
    select: {
      id: true,
      name: true,
      phone: true,
      lastVisitAt: true,
      _count: {
        select: {
          bookings: { where: { bookingStatus: "COMPLETED" } },
        },
      },
      transactions: {
        where: {
          // v2: 含 REFUND，per-customer revenue sum 取淨值
          transactionType: { in: [...REVENUE_NET_TYPES] },
          status: REVENUE_VALID_STATUS,
        },
        select: { amount: true },
      },
      planWallets: {
        where: { status: "ACTIVE" },
        select: { id: true },
      },
    },
  });

  const scored = customers.map((c) => {
    const totalSpent = c.transactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const bookingCount = c._count.bookings;
    const activeWallets = c.planWallets.length;

    // 分數模型：消費額(40%) + 回訪次數(30%) + 活躍套票(20%) + 最近到店(10%)
    const spendScore = Math.min(totalSpent / 500, 40); // 最高 40 分（$20,000 滿分）
    const visitScore = Math.min(bookingCount * 3, 30); // 最高 30 分（10+ 次滿分）
    const walletScore = activeWallets > 0 ? 20 : 0;
    const recencyDays = c.lastVisitAt
      ? (Date.now() - c.lastVisitAt.getTime()) / (1000 * 60 * 60 * 24)
      : 999;
    const recencyScore = recencyDays <= 7 ? 10 : recencyDays <= 14 ? 7 : recencyDays <= 30 ? 4 : 0;

    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      totalSpent,
      bookingCount,
      lastVisit: c.lastVisitAt?.toISOString().slice(0, 10) ?? null,
      activeWallets,
      score: Math.round(spendScore + visitScore + walletScore + recencyScore),
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

// ============================================================
// 5. 顧客分級
// ============================================================

export interface CustomerSegment {
  label: string;
  count: number;
  color: string;
  description: string;
}

export async function getCustomerSegments(activeStoreId?: string | null): Promise<CustomerSegment[]> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const [
    newCount,
    activeCount,
    returningCount,
    atRiskCount,
    dormantCount,
    highValueCount,
  ] = await Promise.all([
    // 新客：30 天內建立、無完成預約
    prisma.customer.count({
      where: {
        ...storeFilter,
        createdAt: { gte: thirtyDaysAgo },
        bookings: { none: { bookingStatus: "COMPLETED" } },
      },
    }),
    // 活躍客：7 天內有到店
    prisma.customer.count({
      where: { lastVisitAt: { gte: sevenDaysAgo }, ...storeFilter },
    }),
    // 回訪中：7-30 天有到店
    prisma.customer.count({
      where: {
        lastVisitAt: { gte: thirtyDaysAgo, lt: sevenDaysAgo },
        ...storeFilter,
      },
    }),
    // 即將流失：30-60 天無到店
    prisma.customer.count({
      where: {
        lastVisitAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
        ...storeFilter,
      },
    }),
    // 沉睡客：60+ 天無到店
    prisma.customer.count({
      where: {
        ...storeFilter,
        OR: [
          { lastVisitAt: { lt: sixtyDaysAgo } },
          { lastVisitAt: null, createdAt: { lt: sixtyDaysAgo } },
        ],
      },
    }),
    // 高價值客：有活躍套票 + 90 天內到店
    prisma.customer.count({
      where: {
        lastVisitAt: { gte: ninetyDaysAgo },
        planWallets: { some: { status: "ACTIVE" } },
        ...storeFilter,
      },
    }),
  ]);

  return [
    { label: "新客", count: newCount, color: "bg-blue-500", description: "30天內新建、尚未到店" },
    { label: "活躍客", count: activeCount, color: "bg-green-500", description: "7天內有到店" },
    { label: "回訪中", count: returningCount, color: "bg-emerald-400", description: "7-30天內有到店" },
    { label: "即將流失", count: atRiskCount, color: "bg-yellow-500", description: "30-60天未到店" },
    { label: "沉睡客", count: dormantCount, color: "bg-red-400", description: "60天以上未到店" },
    { label: "高價值", count: highValueCount, color: "bg-purple-500", description: "有活躍套票且近期到店" },
  ];
}

// ============================================================
// 6. 店長績效比較
// ============================================================

export interface StaffPerformance {
  staffId: string;
  displayName: string;
  colorCode: string;
  revenue: number;
  bookingCount: number;
  completedCount: number;
  cancelledCount: number;
  newCustomerCount: number;
  avgRevenue: number; // 客單價
  completionRate: number; // 到店率
}

export async function getStaffPerformance(days = 30, activeStoreId?: string | null): Promise<StaffPerformance[]> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);

  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const startStr = toLocalDateStr(startDate);
  const todayStr = toLocalDateStr(now);
  const startRange = dayRange(startStr);
  const endRange = dayRange(todayStr);

  const staff = await prisma.staff.findMany({
    where: { status: "ACTIVE", ...storeFilter },
    select: {
      id: true,
      displayName: true,
      colorCode: true,
      revenueBookings: {
        where: {
          bookingDate: {
            gte: new Date(startStr + "T00:00:00.000Z"),
            lte: new Date(todayStr + "T00:00:00.000Z"),
          },
        },
        select: { bookingStatus: true },
      },
      revenueTransactions: {
        where: {
          createdAt: { gte: startRange.start, lte: endRange.end },
          // v2: 含 REFUND，per-staff KPI sum 取淨值
          transactionType: { in: [...REVENUE_NET_TYPES] },
          status: REVENUE_VALID_STATUS,
        },
        select: { amount: true },
      },
      assignedCustomers: {
        where: { createdAt: { gte: startRange.start, lte: endRange.end } },
        select: { id: true },
      },
    },
  });

  return staff.map((s) => {
    const revenue = s.revenueTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const bookingCount = s.revenueBookings.length;
    const completedCount = s.revenueBookings.filter((b) => b.bookingStatus === "COMPLETED").length;
    const cancelledCount = s.revenueBookings.filter((b) => b.bookingStatus === "CANCELLED").length;
    const txCount = s.revenueTransactions.length;

    return {
      staffId: s.id,
      displayName: s.displayName,
      colorCode: s.colorCode,
      revenue,
      bookingCount,
      completedCount,
      cancelledCount,
      newCustomerCount: s.assignedCustomers.length,
      avgRevenue: txCount > 0 ? Math.round(revenue / txCount) : 0,
      completionRate: bookingCount > 0 ? Math.round((completedCount / bookingCount) * 100) : 0,
    };
  });
}
