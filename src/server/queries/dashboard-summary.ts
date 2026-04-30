"use server";

/**
 * Dashboard Summary Queries
 *
 * 店家後台 v1：為首頁兩個模式提供輕量聚合 query，**不做 findMany 列表資料**。
 * 首頁呼叫以下兩支 summary 即可組完 UI；列表資料各自由列表頁獨立 fetch。
 *
 * - getDashboardTodaySummary  — Mode A（今日營運）
 * - getDashboardOverviewSummary — Mode B（經營總覽）
 *
 * 所有查詢均透過 requireStaffSession + getStoreFilter 做店隔離，
 * 內部各子 query 獨立 try/catch，單筆失敗回 null/0，不拋錯。
 *
 * Today summary 走 unstable_cache（30s TTL，tag: bookings-summary + report-store）。
 * 第一個進來的人付出 7 個 aggregate 的 DB 成本，30s 內後續所有 admin/owner 看
 * 同一店都從 cache 拿，不打 DB。Mutation 失效路徑沿用 revalidateBookings /
 * revalidateTransactions 已在跑的 tag 系統。
 */

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { requireStaffSession } from "@/lib/session";
import {
  getStoreFilter,
  getVisibilityMode,
} from "@/lib/manager-visibility";
import {
  todayRange,
  monthRange,
  toLocalDateStr,
  bookingDateToday,
} from "@/lib/date-utils";
import {
  ACTIVE_BOOKING_STATUSES,
  REVENUE_NET_TYPES,
  REVENUE_VALID_STATUS,
} from "@/lib/booking-constants";

// TODO(PR-payment-confirm): PR-3/4 上線後，本檔今日/本月營收 aggregate
// （transactionType ∈ REVENUE_TRANSACTION_TYPES）必須加 paymentStatus: { in: ["SUCCESS", "CONFIRMED"] }
// 否則首頁卡片會把 PENDING 轉帳誤算進營收。
// 本 PR-1 不加：歷史交易 backfill=SUCCESS，現行語意與上線前一致。

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

// ============================================================
// Mode A — 今日營運
// ============================================================

/**
 * Pure compute — 不做 session check，由 caller 負責把 scope 已解析過的
 * effectiveStoreId / scopeStaffId 傳進來。供 unstable_cache 包裹用。
 *
 * Revenue 永遠計算（不再以 isOwner gate），讓 cache 結果可跨 viewer 共享；
 * action 層遇到非 owner 再把 todayRevenue 罩成 null。
 */
async function computeDashboardTodaySummary(
  effectiveStoreId: string | null,
  scopeStaffId: string | null,
): Promise<DashboardTodaySummary> {
  const storeFilter: Record<string, unknown> = effectiveStoreId
    ? { storeId: effectiveStoreId }
    : {};
  // 名下顧客：STORE_SHARED 模式所有 viewer 看到一樣（沿用 storeFilter）；
  // SELF_ONLY 模式 PARTNER 才會帶 assignedStaffId（caller 已決定 scopeStaffId）。
  const customerWhere: Record<string, unknown> = scopeStaffId
    ? { ...storeFilter, assignedStaffId: scopeStaffId }
    : storeFilter;

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
    safe<{ _sum: { amount: unknown } } | null>(
      "todayRevenue",
      () =>
        prisma.transaction.aggregate({
          where: {
            createdAt: { gte: todayStart, lte: todayEnd },
            transactionType: { in: [...REVENUE_NET_TYPES] },
            status: REVENUE_VALID_STATUS,
            ...storeFilter,
          },
          _sum: { amount: true },
        }),
      null,
    ),
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
    safe("customerCount", () => prisma.customer.count({ where: customerWhere }), 0),
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

/**
 * Cross-request cache: 30s TTL，tag: bookings-summary + report-store。
 * Key 含 (effectiveStoreId, scopeStaffId)：
 *   - STORE_SHARED 預設模式 scopeStaffId=null → 同店所有 owner / partner 共用
 *   - SELF_ONLY 模式 scopeStaffId=staffId → per-staff entry
 * Revenue 永遠在 cache 裡，action 層按 viewer 罩 null。
 */
const _cachedDashboardTodaySummary = unstable_cache(
  async (
    effectiveStoreId: string | null,
    scopeStaffId: string | null,
  ): Promise<DashboardTodaySummary> => {
    return computeDashboardTodaySummary(effectiveStoreId, scopeStaffId);
  },
  ["dashboard-today-summary"],
  {
    revalidate: 30,
    tags: [CACHE_TAGS.bookingsSummary, CACHE_TAGS.reportStore],
  },
);

export async function getDashboardTodaySummary(
  activeStoreId?: string | null,
): Promise<DashboardTodaySummary> {
  const user = await requireStaffSession();
  const storeFilter = getStoreFilter(user, activeStoreId);
  const effectiveStoreId =
    (storeFilter.storeId as string | undefined) ?? null;
  const isOwner = user.role === "ADMIN" || user.role === "OWNER";
  const visibilityMode = getVisibilityMode();
  // SELF_ONLY 模式下，非 owner 員工的「名下顧客數」需 per-staff cache；
  // STORE_SHARED 預設則大家共用 (scopeStaffId=null)，cache 命中率最大化。
  const scopeStaffId =
    !isOwner && visibilityMode === "SELF_ONLY" ? user.staffId : null;

  const raw = await _cachedDashboardTodaySummary(effectiveStoreId, scopeStaffId);

  // Cache 永遠算 revenue；只 owner / admin 看得到，其餘 viewer 罩 null。
  if (!isOwner) {
    return { ...raw, todayRevenue: null };
  }
  return raw;
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
                transactionType: { in: [...REVENUE_NET_TYPES] },
                status: REVENUE_VALID_STATUS,
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
                transactionType: { in: [...REVENUE_NET_TYPES] },
                status: REVENUE_VALID_STATUS,
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

