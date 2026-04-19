"use server";

/**
 * Dashboard Summary Queries
 *
 * 店家後台 v1：為首頁兩個模式提供輕量聚合 query，**不做 findMany 列表資料**。
 * 首頁呼叫以下三支 summary 即可組完 UI；列表資料各自由列表頁獨立 fetch。
 *
 * - getDashboardTodaySummary  — Mode A（今日營運）
 * - getDashboardOverviewSummary — Mode B（經營總覽）
 * - getGrowthSummary           — Mode B 使用（Top 3 候選人簡化資訊）
 *
 * 所有查詢均透過 requireStaffSession + getStoreFilter 做店隔離，
 * 內部各子 query 獨立 try/catch，單筆失敗回 null/0，不拋錯。
 */

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { getStoreFilter, getManagerCustomerWhere } from "@/lib/manager-visibility";
import {
  todayRange,
  monthRange,
  toLocalDateStr,
  bookingDateToday,
} from "@/lib/date-utils";
import {
  ACTIVE_BOOKING_STATUSES,
  REVENUE_TRANSACTION_TYPES,
} from "@/lib/booking-constants";

// ============================================================
// helpers
// ============================================================

async function safe<T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  const s = performance.now();
  try {
    return await fn();
  } catch (e) {
    const ms = Math.round(performance.now() - s);
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[DASHBOARD_SUMMARY] fail ${name} ${ms}ms msg=${msg}`);
    return fallback;
  }
}

// ============================================================
// types
// ============================================================

export interface DashboardTodaySummary {
  /** 今日預約（PENDING / CONFIRMED / COMPLETED / NO_SHOW 等 active） */
  todayBookingCount: number;
  /** 今日預計總人數（_sum.people） */
  todayPeople: number;
  /** 今日已 COMPLETED */
  todayCompletedCount: number;
  todayCompletedPeople: number;
  /** NO_SHOW 數 — 提示待處理 */
  noShowCount: number;
  /** 今日預約中未指派人員 — 提示待處理 */
  todayUnassignedCount: number;
  /** 今日營收（owner 才有，staff null） */
  todayRevenue: number | null;
  /** 上週同日預約數（對比用） */
  lastWeekBookingCount: number;
  /** 名下顧客數（受 manager visibility 影響） */
  customerCount: number;
}

export interface DashboardOverviewSummary {
  /** 本月營收（owner 才有） */
  monthRevenue: number | null;
  /** 上月營收（對比用） */
  prevMonthRevenue: number | null;
  /** 本月預約（active） */
  monthBookingCount: number;
  /** 本月已完成 */
  monthCompletedCount: number;
  /** 回訪率 = 本月產生 2 次以上預約的顧客 / 本月有預約的顧客 */
  returningRate: number | null;
  /** 本月推薦事件數（BOOKING_COMPLETED 類型） */
  referralThisMonth: number;
  /** 月份字串 YYYY-MM */
  monthLabel: string;
}

export interface GrowthSummaryTop3 {
  customerId: string;
  name: string;
  readinessScore: number;
  totalPoints: number;
  referralCount: number;
}

export interface GrowthSummary {
  /** PARTNER 總數 */
  partnerCount: number;
  /** FUTURE_OWNER 總數 */
  futureOwnerCount: number;
  /** Top 3 候選（簡化資訊） */
  top3: GrowthSummaryTop3[];
}

// ============================================================
// Mode A — 今日營運
// ============================================================

export async function getDashboardTodaySummary(
  activeStoreId?: string | null,
): Promise<DashboardTodaySummary> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);
  const staffCustomerWhere = getManagerCustomerWhere(user.role, user.staffId, activeStoreId);
  const isOwner = user.role === "ADMIN" || user.role === "OWNER";

  const today = todayRange();
  const todayStart = today.start;
  const todayEnd = today.end;
  const todayBooking = bookingDateToday();
  const lastWeekDate = new Date(todayBooking.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    todayAgg,
    todayCompleted,
    noShow,
    todayUnassigned,
    todayRevenueAgg,
    lastWeekAgg,
    customerCount,
  ] = await Promise.all([
    safe(
      "todayAgg",
      () =>
        prisma.booking.aggregate({
          where: {
            bookingDate: todayBooking,
            bookingStatus: { in: [...ACTIVE_BOOKING_STATUSES] },
            ...storeFilter,
          },
          _count: { id: true },
          _sum: { people: true },
        }),
      { _count: { id: 0 }, _sum: { people: 0 } },
    ),
    safe(
      "todayCompleted",
      () =>
        prisma.booking.aggregate({
          where: {
            bookingDate: todayBooking,
            bookingStatus: "COMPLETED",
            ...storeFilter,
          },
          _count: { id: true },
          _sum: { people: true },
        }),
      { _count: { id: 0 }, _sum: { people: 0 } },
    ),
    safe(
      "noShow",
      () =>
        prisma.booking.count({
          where: {
            bookingDate: todayBooking,
            bookingStatus: "NO_SHOW",
            ...storeFilter,
          },
        }),
      0,
    ),
    safe(
      "todayUnassigned",
      () =>
        prisma.booking.count({
          where: {
            bookingDate: todayBooking,
            bookingStatus: { in: [...ACTIVE_BOOKING_STATUSES] },
            revenueStaffId: null,
            ...storeFilter,
          },
        }),
      0,
    ),
    isOwner
      ? safe<{ _sum: { amount: unknown } } | null>(
          "todayRevenue",
          () =>
            prisma.transaction.aggregate({
              where: {
                createdAt: { gte: todayStart, lte: todayEnd },
                transactionType: { in: [...REVENUE_TRANSACTION_TYPES] },
                ...storeFilter,
              },
              _sum: { amount: true },
            }),
          null,
        )
      : Promise.resolve(null),
    safe(
      "lastWeekAgg",
      () =>
        prisma.booking.aggregate({
          where: {
            bookingDate: lastWeekDate,
            bookingStatus: { in: [...ACTIVE_BOOKING_STATUSES] },
            ...storeFilter,
          },
          _count: { id: true },
        }),
      { _count: { id: 0 } },
    ),
    safe("customerCount", () => prisma.customer.count({ where: staffCustomerWhere }), 0),
  ]);

  return {
    todayBookingCount: todayAgg._count.id,
    todayPeople: todayAgg._sum.people ?? 0,
    todayCompletedCount: todayCompleted._count.id,
    todayCompletedPeople: todayCompleted._sum.people ?? 0,
    noShowCount: noShow,
    todayUnassignedCount: todayUnassigned,
    todayRevenue: todayRevenueAgg
      ? Number((todayRevenueAgg._sum.amount ?? 0) as number)
      : null,
    lastWeekBookingCount: lastWeekAgg._count.id,
    customerCount,
  };
}

// ============================================================
// Mode B — 經營總覽
// ============================================================

export async function getDashboardOverviewSummary(
  activeStoreId?: string | null,
): Promise<DashboardOverviewSummary> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);
  const isOwner = user.role === "ADMIN" || user.role === "OWNER";

  const monthLabel = toLocalDateStr().slice(0, 7);
  const currentMonth = monthRange(monthLabel);
  const monthStart = currentMonth.start;
  const monthEnd = currentMonth.end;

  const prevMonthStr = (() => {
    const d = new Date(monthStart);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();
  const prevMonth = monthRange(prevMonthStr);

  const [
    monthRevenue,
    prevMonthRevenue,
    monthBookingCount,
    monthCompletedCount,
    returningRate,
    referralThisMonth,
  ] = await Promise.all([
    isOwner
      ? safe<{ _sum: { amount: unknown } } | null>(
          "monthRevenue",
          () =>
            prisma.transaction.aggregate({
              where: {
                createdAt: { gte: monthStart },
                transactionType: { in: [...REVENUE_TRANSACTION_TYPES] },
                ...storeFilter,
              },
              _sum: { amount: true },
            }),
          null,
        )
      : Promise.resolve(null),
    isOwner
      ? safe<{ _sum: { amount: unknown } } | null>(
          "prevMonthRevenue",
          () =>
            prisma.transaction.aggregate({
              where: {
                createdAt: { gte: prevMonth.start, lt: monthStart },
                transactionType: { in: [...REVENUE_TRANSACTION_TYPES] },
                ...storeFilter,
              },
              _sum: { amount: true },
            }),
          null,
        )
      : Promise.resolve(null),
    safe(
      "monthBookingCount",
      () =>
        prisma.booking.count({
          where: {
            bookingDate: { gte: monthStart, lte: monthEnd },
            bookingStatus: { in: [...ACTIVE_BOOKING_STATUSES] },
            ...storeFilter,
          },
        }),
      0,
    ),
    safe(
      "monthCompletedCount",
      () =>
        prisma.booking.count({
          where: {
            bookingDate: { gte: monthStart, lte: monthEnd },
            bookingStatus: "COMPLETED",
            ...storeFilter,
          },
        }),
      0,
    ),
    // 回訪率：本月有預約的顧客中，本月 >= 2 次預約者佔比
    safe<number | null>(
      "returningRate",
      async () => {
        const grouped = await prisma.booking.groupBy({
          by: ["customerId"],
          where: {
            bookingDate: { gte: monthStart, lte: monthEnd },
            bookingStatus: { in: [...ACTIVE_BOOKING_STATUSES] },
            ...storeFilter,
          },
          _count: { id: true },
        });
        const active = grouped.length;
        if (active === 0) return null;
        const returning = grouped.filter((g) => g._count.id >= 2).length;
        return Math.round((returning / active) * 100);
      },
      null,
    ),
    safe(
      "referralThisMonth",
      () =>
        prisma.referralEvent.count({
          where: {
            type: "BOOKING_COMPLETED",
            createdAt: { gte: monthStart },
            ...storeFilter,
          },
        }),
      0,
    ),
  ]);

  return {
    monthRevenue: monthRevenue ? Number((monthRevenue._sum.amount ?? 0) as number) : null,
    prevMonthRevenue: prevMonthRevenue
      ? Number((prevMonthRevenue._sum.amount ?? 0) as number)
      : null,
    monthBookingCount,
    monthCompletedCount,
    returningRate,
    referralThisMonth,
    monthLabel,
  };
}

// ============================================================
// Growth Summary — 僅 Top 3 簡化（首頁用）
// ============================================================

export async function getGrowthSummary(
  activeStoreId?: string | null,
): Promise<GrowthSummary> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);

  const [stages, top3Raw] = await Promise.all([
    safe(
      "talent.groupBy",
      () =>
        prisma.customer.groupBy({
          by: ["talentStage"],
          where: storeFilter,
          _count: { id: true },
        }),
      [] as Array<{ talentStage: string; _count: { id: number } }>,
    ),
    // 直接挑 totalPoints 高的 PARTNER/FUTURE_OWNER，不做完整 readiness 運算
    safe(
      "top3Candidates",
      () =>
        prisma.customer.findMany({
          where: {
            ...storeFilter,
            talentStage: { in: ["PARTNER", "FUTURE_OWNER"] },
          },
          select: { id: true, name: true, totalPoints: true },
          orderBy: { totalPoints: "desc" },
          take: 3,
        }),
      [] as Array<{ id: string; name: string; totalPoints: number }>,
    ),
  ]);

  const stageMap = new Map<string, number>();
  for (const s of stages) stageMap.set(s.talentStage, s._count.id);

  // 為 top3 補 referral count（各自單獨 query，限 3 筆不致成為 N+1 瓶頸）
  const top3: GrowthSummaryTop3[] = await Promise.all(
    top3Raw.map(async (c) => {
      const refCount = await safe(
        `top3.ref.${c.id}`,
        () =>
          prisma.referral.count({
            where: {
              referrerId: c.id,
              status: { in: ["VISITED", "CONVERTED"] },
              ...storeFilter,
            },
          }),
        0,
      );
      return {
        customerId: c.id,
        name: c.name,
        readinessScore: 0, // 首頁 summary 不做完整 readiness 計算；要完整請進 /dashboard/growth/top-candidates
        totalPoints: c.totalPoints,
        referralCount: refCount,
      };
    }),
  );

  return {
    partnerCount: stageMap.get("PARTNER") ?? 0,
    futureOwnerCount: stageMap.get("FUTURE_OWNER") ?? 0,
    top3,
  };
}
