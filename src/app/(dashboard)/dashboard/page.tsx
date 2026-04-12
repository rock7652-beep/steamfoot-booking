import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { getMonthBookingSummary } from "@/server/queries/booking";
import { getLatestReconciliationRun } from "@/server/queries/reconciliation";
import { getDailyTrend } from "@/server/queries/ops-dashboard";
import { todayRange, monthRange, toLocalDateStr, bookingDateToday } from "@/lib/date-utils";
import { getManagerCustomerWhere, getStoreFilter } from "@/lib/manager-visibility";
import { resolveActiveStoreId } from "@/lib/store";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { DashboardCalendar } from "./dashboard-calendar";
import { ReconciliationBanner } from "@/components/reconciliation-banner";
import { TodayBookingsList } from "./today-bookings-list";
import { DashboardAlerts } from "./dashboard-alerts";
import { KpiCard } from "@/components/ui/kpi-card";
import { SectionCard } from "@/components/ui/section-card";
import {
  ACTIVE_BOOKING_STATUSES,
  REVENUE_TRANSACTION_TYPES,
} from "@/lib/booking-constants";
import { getLatestResolvedRequest } from "@/server/queries/upgrade-request";
import { UpgradeResultBanner } from "@/components/upgrade-result-banner";

// Owner-only: lazy import trend tabs
import { TrendTabs } from "./ops/trend-tabs";

interface PageProps {
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user) return null;
  const isOwner = user.role === "ADMIN";

  // 多店視角：讀取 cookie 解析 activeStoreId
  const cookieStore = await cookies();
  const cookieStoreId = cookieStore.get("active-store-id")?.value ?? null;
  const activeStoreId = resolveActiveStoreId(user, cookieStoreId);
  const storeFilter = getStoreFilter(user, activeStoreId);

  const today = todayRange();
  const todayStart = today.start;
  const todayEnd = today.end;
  const todayBookingDate = bookingDateToday();
  const todayLabel = new Date(todayStart.getTime() + 8 * 60 * 60 * 1000)
    .toLocaleDateString("zh-TW", { month: "long", day: "numeric", weekday: "short" });

  // Calendar month params
  const year = params.year ? parseInt(params.year) : parseInt(toLocalDateStr().slice(0, 4));
  const month = params.month ? parseInt(params.month) : parseInt(toLocalDateStr().slice(5, 7));

  // P0-3: 「顧客屬於店」— 今日預約 / KPI，依 activeStoreId 篩選
  const staffCustomerWhere = getManagerCustomerWhere(user.role, user.staffId, activeStoreId);

  // ── Last week same day for comparison ──
  const lastWeekDate = new Date(todayBookingDate.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Parallel queries
  const [stats, todayBookings, monthData, latestRecon, lastWeekBookings, trend7, trend30] = await Promise.all([
    // KPI stats
    (async () => {
      const currentMonth = monthRange(toLocalDateStr().slice(0, 7));
      const monthStart = currentMonth.start;

      // Previous month revenue for comparison
      const prevMonthStr = (() => {
        const d = new Date(monthStart);
        d.setMonth(d.getMonth() - 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      })();
      const prevMonth = monthRange(prevMonthStr);

      const [customerCount, activeCount, todayAgg, monthRevenue, todayCompleted, todayRevenue, prevMonthRevenue, noShowCount] = await Promise.all([
        prisma.customer.count({ where: staffCustomerWhere }),
        prisma.customer.count({ where: { ...staffCustomerWhere, customerStage: "ACTIVE" } }),
        prisma.booking.aggregate({
          where: {
            bookingDate: todayBookingDate,
            bookingStatus: { in: [...ACTIVE_BOOKING_STATUSES] },
            ...storeFilter,
          },
          _count: { id: true },
          _sum: { people: true },
        }),
        isOwner
          ? prisma.transaction.aggregate({
              where: {
                createdAt: { gte: monthStart },
                transactionType: { in: [...REVENUE_TRANSACTION_TYPES] },
                ...storeFilter,
              },
              _sum: { amount: true },
            })
          : null,
        prisma.booking.aggregate({
          where: {
            bookingDate: todayBookingDate,
            bookingStatus: "COMPLETED",
            ...storeFilter,
          },
          _count: { id: true },
          _sum: { people: true },
        }),
        isOwner
          ? prisma.transaction.aggregate({
              where: {
                createdAt: { gte: todayStart, lte: todayEnd },
                transactionType: { in: [...REVENUE_TRANSACTION_TYPES] },
                ...storeFilter,
              },
              _sum: { amount: true },
            })
          : null,
        isOwner
          ? prisma.transaction.aggregate({
              where: {
                createdAt: { gte: prevMonth.start, lt: monthStart },
                transactionType: { in: [...REVENUE_TRANSACTION_TYPES] },
                ...storeFilter,
              },
              _sum: { amount: true },
            })
          : null,
        prisma.booking.count({
          where: {
            bookingDate: todayBookingDate,
            bookingStatus: "NO_SHOW",
            ...storeFilter,
          },
        }),
      ]);
      return {
        customerCount,
        activeCount,
        todayBookingCount: todayAgg._count.id,
        todayPeople: todayAgg._sum.people ?? 0,
        monthRevenue: monthRevenue ? Number(monthRevenue._sum.amount ?? 0) : null,
        prevMonthRevenue: prevMonthRevenue ? Number(prevMonthRevenue._sum.amount ?? 0) : null,
        todayCompletedCount: todayCompleted._count.id,
        todayCompletedPeople: todayCompleted._sum.people ?? 0,
        todayRevenue: todayRevenue ? Number(todayRevenue._sum.amount ?? 0) : null,
        noShowCount,
      };
    })(),

    // Today's booking list
    prisma.booking.findMany({
      where: {
        bookingDate: todayBookingDate,
        bookingStatus: { in: [...ACTIVE_BOOKING_STATUSES] },
        ...storeFilter,
      },
      include: {
        customer: { select: { name: true, phone: true } },
        revenueStaff: { select: { displayName: true, colorCode: true } },
      },
      orderBy: { slotTime: "asc" },
    }),

    // Month calendar data
    getMonthBookingSummary(year, month, activeStoreId),

    // Latest reconciliation run
    getLatestReconciliationRun().catch(() => null),

    // Last week same day booking count (for comparison)
    prisma.booking.aggregate({
      where: {
        bookingDate: lastWeekDate,
        bookingStatus: { in: [...ACTIVE_BOOKING_STATUSES] },
        ...storeFilter,
      },
      _count: { id: true },
    }),

    // Trend data (owner only — null for staff)
    isOwner ? getDailyTrend(7, activeStoreId).catch(() => []) : Promise.resolve(null),
    isOwner ? getDailyTrend(30, activeStoreId).catch(() => []) : Promise.resolve(null),
  ]);

  // 升級結果 banner（核准 or 拒絕，24hr 內）
  const resolvedRequest = user.storeId
    ? await getLatestResolvedRequest(user.storeId)
    : null;

  // Busyness level
  const busyLevel = stats.todayPeople === 0 ? "idle" : stats.todayPeople <= 8 ? "normal" : stats.todayPeople <= 15 ? "busy" : "full";
  const busyConfig = {
    idle: { label: "清閒", color: "text-earth-500", bg: "bg-earth-100" },
    normal: { label: "正常", color: "text-green-700", bg: "bg-green-100" },
    busy: { label: "忙碌", color: "text-yellow-700", bg: "bg-yellow-100" },
    full: { label: "爆滿", color: "text-red-700", bg: "bg-red-100" },
  }[busyLevel];

  // Comparison: today vs last week same day
  const lastWeekCount = lastWeekBookings._count.id;
  const bookingChange = stats.todayBookingCount - lastWeekCount;

  // Revenue comparison
  const revenueChange = (stats.monthRevenue != null && stats.prevMonthRevenue != null && stats.prevMonthRevenue > 0)
    ? Math.round(((stats.monthRevenue - stats.prevMonthRevenue) / stats.prevMonthRevenue) * 100)
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-4">

      {/* ═══════════════════════════════════════════════ */}
      {/* 1. 頁面標題區                                   */}
      {/* ═══════════════════════════════════════════════ */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-earth-500">歡迎回來，{user.name}</p>
            <p className="mt-0.5 text-lg font-bold text-earth-900">今天 {todayLabel}</p>
          </div>
          <span className={`rounded-md px-2.5 py-1 text-xs font-medium ${busyConfig.bg} ${busyConfig.color}`}>
            {busyConfig.label}
          </span>
        </div>
      </div>

      {/* ── 升級結果提示 ── */}
      {resolvedRequest && (
        <UpgradeResultBanner
          status={resolvedRequest.status}
          requestedPlan={resolvedRequest.requestedPlan}
          reviewNote={resolvedRequest.reviewNote}
        />
      )}

      {/* ═══════════════════════════════════════════════ */}
      {/* 2. 警示區                                       */}
      {/* ═══════════════════════════════════════════════ */}
      {isOwner && latestRecon && latestRecon.status !== "pass" && (
        <ReconciliationBanner
          status={latestRecon.status}
          mismatchCount={latestRecon.mismatchCount}
          errorCount={latestRecon.errorCount}
          startedAt={latestRecon.startedAt}
          failedChecks={latestRecon.checks}
        />
      )}
      <DashboardAlerts
        todayBookingCount={stats.todayBookingCount}
        noShowCount={stats.noShowCount}
      />

      {/* ═══════════════════════════════════════════════ */}
      {/* 3. KPI 摘要列                                   */}
      {/* ═══════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <KpiCard
          label="今日預約"
          value={stats.todayBookingCount}
          unit="筆"
          color="primary"
          change={bookingChange !== 0 ? { value: bookingChange, label: "vs 上週同日" } : null}
        />
        <KpiCard
          label="今日人數"
          value={stats.todayPeople}
          unit="人"
          color="primary"
        />
        <KpiCard
          label="今日已完成"
          value={stats.todayCompletedPeople}
          unit={`/ ${stats.todayPeople}人`}
          color="green"
        />
        <KpiCard
          label="名下顧客"
          value={stats.customerCount}
          unit="位"
          color="earth"
        />
        {isOwner && stats.monthRevenue !== null ? (
          <>
            <KpiCard
              label="本月營收"
              value={`$${stats.monthRevenue.toLocaleString()}`}
              color="earth"
              change={revenueChange != null ? { value: revenueChange, label: "vs 上月同期 %" } : null}
            />
            <KpiCard
              label="今日營收"
              value={`$${(stats.todayRevenue ?? 0).toLocaleString()}`}
              color="amber"
            />
          </>
        ) : (
          <KpiCard
            label="有效顧客"
            value={stats.activeCount}
            unit="位"
            color="earth"
          />
        )}
      </div>

      {/* ═══════════════════════════════════════════════ */}
      {/* 4. 核心工作區 — 今日預約 + Quick Actions         */}
      {/* ═══════════════════════════════════════════════ */}
      <SectionCard
        title="今日預約"
        action={{ label: "預約管理", href: "/dashboard/bookings" }}
      >
        {/* Quick Actions inline */}
        <div className="mb-3 flex flex-wrap gap-2">
          <QuickLink href="/dashboard/bookings/new" label="新增預約" primary />
          <QuickLink href="/dashboard/customers" label="顧客管理" />
          <QuickLink href="/dashboard/transactions" label="交易紀錄" />
          {isOwner && <QuickLink href="/dashboard/staff" label="人員管理" />}
        </div>

        {todayBookings.length === 0 ? (
          <div className="rounded-xl bg-earth-50 py-6 text-center">
            <p className="text-sm text-earth-400">今天沒有預約</p>
            <Link
              href="/dashboard/bookings/new"
              className="mt-2 inline-block text-xs text-primary-600 hover:text-primary-700"
            >
              新增預約 →
            </Link>
          </div>
        ) : (
          <TodayBookingsList bookings={todayBookings} />
        )}
      </SectionCard>

      {/* ═══════════════════════════════════════════════ */}
      {/* 5. 趨勢分析區 — Owner only                     */}
      {/* ═══════════════════════════════════════════════ */}
      {isOwner && trend7 && trend30 && trend7.length > 0 && (
        <SectionCard
          title="趨勢分析"
          subtitle="營收與預約趨勢"
          action={{ label: "營運儀表板", href: "/dashboard/ops" }}
        >
          <TrendTabs data7={trend7} data30={trend30} />
        </SectionCard>
      )}

      {/* ═══════════════════════════════════════════════ */}
      {/* 6. 預約總覽 — 月曆                              */}
      {/* ═══════════════════════════════════════════════ */}
      <SectionCard
        title="預約總覽"
        action={{ label: "預約管理", href: "/dashboard/bookings" }}
      >
        <DashboardCalendar
          year={year}
          month={month}
          monthData={monthData}
        />
      </SectionCard>
    </div>
  );
}

function QuickLink({ href, label, primary }: { href: string; label: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
        primary
          ? "bg-primary-600 text-white shadow-sm hover:bg-primary-700"
          : "border border-earth-200 bg-white text-earth-700 hover:bg-earth-50"
      }`}
    >
      {label}
    </Link>
  );
}
