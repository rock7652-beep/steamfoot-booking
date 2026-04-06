import { getCurrentUser } from "@/lib/session";
import { getMonthBookingSummary } from "@/server/queries/booking";
import { getLatestReconciliationRun } from "@/server/queries/reconciliation";
import { todayRange, monthRange, toLocalDateStr } from "@/lib/date-utils";
import { getManagerCustomerWhere } from "@/lib/manager-visibility";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { DashboardCalendar } from "./dashboard-calendar";
import { ReconciliationBanner } from "@/components/reconciliation-banner";
import { BookingQuickActions } from "./booking-quick-actions";

interface PageProps {
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user) return null;
  const isOwner = user.role === "OWNER";

  const today = todayRange();
  const todayStart = today.start;
  const todayEnd = today.end;
  const todayDateStr = today.dateStr;
  const todayLabel = new Date(todayStart.getTime() + 8 * 60 * 60 * 1000)
    .toLocaleDateString("zh-TW", { month: "long", day: "numeric", weekday: "short" });

  // Calendar month params
  const now = new Date();
  const year = params.year ? parseInt(params.year) : parseInt(toLocalDateStr().slice(0, 4));
  const month = params.month ? parseInt(params.month) : parseInt(toLocalDateStr().slice(5, 7));

  // P0-3: 「顧客屬於店」— 今日預約 / KPI 全店共享，任一店長看到一致結果
  // 顧客數仍使用 visibility filter（「名下顧客」有意義）
  const staffCustomerWhere = getManagerCustomerWhere(user.role, user.staffId);

  // Parallel queries
  const [stats, todayBookings, monthData, latestRecon] = await Promise.all([
    // KPI stats
    (async () => {
      const currentMonth = monthRange(toLocalDateStr().slice(0, 7));
      const monthStart = currentMonth.start;
      const [customerCount, activeCount, todayAgg, monthRevenue, todayCompleted, todayRevenue] = await Promise.all([
        prisma.customer.count({ where: staffCustomerWhere }),
        prisma.customer.count({ where: { ...staffCustomerWhere, customerStage: "ACTIVE" } }),
        // P0-3: 今日預約不篩 staff，全店共享
        prisma.booking.aggregate({
          where: {
            bookingDate: { gte: todayStart, lte: todayEnd },
            bookingStatus: { in: ["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"] },
          },
          _count: { id: true },
          _sum: { people: true },
        }),
        isOwner
          ? prisma.transaction.aggregate({
              where: {
                createdAt: { gte: monthStart },
                transactionType: { in: ["TRIAL_PURCHASE", "SINGLE_PURCHASE", "PACKAGE_PURCHASE", "SUPPLEMENT"] },
              },
              _sum: { amount: true },
            })
          : null,
        // P0-3: 今日已完成不篩 staff
        prisma.booking.aggregate({
          where: {
            bookingDate: { gte: todayStart, lte: todayEnd },
            bookingStatus: "COMPLETED",
          },
          _count: { id: true },
          _sum: { people: true },
        }),
        isOwner
          ? prisma.transaction.aggregate({
              where: {
                createdAt: { gte: todayStart, lte: todayEnd },
                transactionType: { in: ["TRIAL_PURCHASE", "SINGLE_PURCHASE", "PACKAGE_PURCHASE", "SUPPLEMENT"] },
              },
              _sum: { amount: true },
            })
          : null,
      ]);
      return {
        customerCount,
        activeCount,
        todayBookingCount: todayAgg._count.id,
        todayPeople: todayAgg._sum.people ?? 0,
        monthRevenue: monthRevenue ? Number(monthRevenue._sum.amount ?? 0) : null,
        todayCompletedCount: todayCompleted._count.id,
        todayCompletedPeople: todayCompleted._sum.people ?? 0,
        todayRevenue: todayRevenue ? Number(todayRevenue._sum.amount ?? 0) : null,
      };
    })(),

    // P0-3: Today's booking list — 全店共享，不篩 staff
    prisma.booking.findMany({
      where: {
        bookingDate: { gte: todayStart, lte: todayEnd },
        bookingStatus: { in: ["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"] },
      },
      include: {
        customer: { select: { name: true, phone: true } },
        revenueStaff: { select: { displayName: true, colorCode: true } },
      },
      orderBy: { slotTime: "asc" },
    }),

    // Month calendar data
    getMonthBookingSummary(year, month),

    // Latest reconciliation run
    getLatestReconciliationRun().catch(() => null),
  ]);

  // Busyness level
  const busyLevel = stats.todayPeople === 0 ? "idle" : stats.todayPeople <= 8 ? "normal" : stats.todayPeople <= 15 ? "busy" : "full";
  const busyConfig = {
    idle: { label: "清閒", color: "text-earth-500", bg: "bg-earth-100" },
    normal: { label: "正常", color: "text-green-700", bg: "bg-green-100" },
    busy: { label: "忙碌", color: "text-yellow-700", bg: "bg-yellow-100" },
    full: { label: "爆滿", color: "text-red-700", bg: "bg-red-100" },
  }[busyLevel];

  const STATUS_LABEL: Record<string, string> = {
    PENDING: "待確認",
    CONFIRMED: "已確認",
    COMPLETED: "已完成",
    NO_SHOW: "未到",
  };
  const STATUS_COLOR: Record<string, string> = {
    PENDING: "bg-yellow-100 text-yellow-700",
    CONFIRMED: "bg-blue-100 text-blue-700",
    COMPLETED: "bg-green-100 text-green-700",
    NO_SHOW: "bg-red-100 text-red-600",
  };
  const STATUS_BORDER: Record<string, string> = {
    PENDING: "border-l-yellow-400",
    CONFIRMED: "border-l-blue-400",
    COMPLETED: "border-l-green-400",
    NO_SHOW: "border-l-red-400",
  };
  const STATUS_ROW_BG: Record<string, string> = {
    COMPLETED: "bg-green-50/30",
    NO_SHOW: "bg-red-50/30",
  };
  const STATUS_ICON: Record<string, string> = {
    PENDING: "\u25CB",
    CONFIRMED: "\u25C9",
    COMPLETED: "\u2713",
    NO_SHOW: "\u2717",
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-4">
      {/* ── Reconciliation Alert ── */}
      {isOwner && latestRecon && latestRecon.status !== "pass" && (
        <ReconciliationBanner
          status={latestRecon.status}
          mismatchCount={latestRecon.mismatchCount}
          errorCount={latestRecon.errorCount}
          startedAt={latestRecon.startedAt}
          failedChecks={latestRecon.checks}
        />
      )}

      {/* ── Today Summary ── */}
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

        {/* Today KPIs */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-primary-50 px-3 py-2.5">
            <p className="text-[11px] text-primary-600">今日預約</p>
            <p className="text-xl font-bold text-primary-700">{stats.todayBookingCount}<span className="ml-1 text-xs font-normal text-primary-400">筆</span></p>
          </div>
          <div className="rounded-xl bg-primary-50 px-3 py-2.5">
            <p className="text-[11px] text-primary-600">今日人數</p>
            <p className="text-xl font-bold text-primary-700">{stats.todayPeople}<span className="ml-1 text-xs font-normal text-primary-400">人</span></p>
          </div>
          <div className="rounded-xl bg-green-50 px-3 py-2.5">
            <p className="text-[11px] text-green-600">今日已完成</p>
            <p className="text-xl font-bold text-green-700">{stats.todayCompletedPeople}<span className="ml-1 text-xs font-normal text-green-400">/ {stats.todayPeople}人</span></p>
          </div>
          <div className="rounded-xl bg-earth-50 px-3 py-2.5">
            <p className="text-[11px] text-earth-500">名下顧客</p>
            <p className="text-xl font-bold text-earth-800">{stats.customerCount}<span className="ml-1 text-xs font-normal text-earth-400">位</span></p>
          </div>
          {isOwner && stats.monthRevenue !== null ? (
            <>
              <div className="rounded-xl bg-earth-50 px-3 py-2.5">
                <p className="text-[11px] text-earth-500">本月營收</p>
                <p className="text-xl font-bold text-earth-800">${stats.monthRevenue.toLocaleString()}</p>
              </div>
              <div className="rounded-xl bg-earth-50 px-3 py-2.5">
                <p className="text-[11px] text-earth-500">今日營收</p>
                <p className="text-xl font-bold text-earth-800">${(stats.todayRevenue ?? 0).toLocaleString()}</p>
              </div>
            </>
          ) : (
            <div className="rounded-xl bg-earth-50 px-3 py-2.5">
              <p className="text-[11px] text-earth-500">有效顧客</p>
              <p className="text-xl font-bold text-earth-800">{stats.activeCount}<span className="ml-1 text-xs font-normal text-earth-400">位</span></p>
            </div>
          )}
        </div>
      </div>

      {/* ── Today Bookings List ── */}
      <section className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-earth-800">今日預約</h3>
          <Link
            href={`/dashboard/bookings?view=day&date=${todayDateStr}`}
            className="text-xs text-primary-600 hover:text-primary-700"
          >
            完整時段表 →
          </Link>
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
          <>
            {/* Progress summary */}
            {(() => {
              const totalPeople = todayBookings.reduce((sum, b) => sum + b.people, 0);
              const completedPeople = todayBookings
                .filter((b) => b.bookingStatus === "COMPLETED")
                .reduce((sum, b) => sum + b.people, 0);
              const pct = totalPeople > 0 ? Math.round((completedPeople / totalPeople) * 100) : 0;
              return (
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs text-earth-500">
                    已完成 <span className="font-semibold text-green-700">{completedPeople}</span>/{totalPeople} 人
                  </span>
                  <div className="h-1.5 flex-1 rounded-full bg-earth-100">
                    <div
                      className="h-1.5 rounded-full bg-green-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-earth-400">{pct}%</span>
                </div>
              );
            })()}
            <div className="rounded-xl border border-earth-100 overflow-hidden">
              {todayBookings.map((b, idx) => (
                <div
                  key={b.id}
                  className={`flex items-center gap-2 px-3 py-2 border-l-3 ${
                    STATUS_BORDER[b.bookingStatus] ?? ""
                  } ${STATUS_ROW_BG[b.bookingStatus] ?? ""} ${
                    idx > 0 ? "border-t border-earth-100" : ""
                  }`}
                >
                  {/* 左側：時段 + 人員資訊（可點連結） */}
                  <Link
                    href={`/dashboard/bookings/${b.id}`}
                    className="flex flex-1 items-center gap-2 min-w-0 transition-colors hover:opacity-75"
                  >
                    <span className="w-12 text-sm font-bold text-primary-700 flex-shrink-0">{b.slotTime}</span>
                    {b.revenueStaff && (
                      <span
                        className="h-2 w-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: b.revenueStaff.colorCode }}
                      />
                    )}
                    <span className="flex-1 truncate text-sm text-earth-800">{b.customer.name}</span>
                    {b.people > 1 && (
                      <span className="rounded bg-earth-100 px-1.5 py-0.5 text-[10px] font-medium text-earth-600">
                        {b.people}位
                      </span>
                    )}
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLOR[b.bookingStatus] ?? ""}`}>
                      <span className="mr-0.5">{STATUS_ICON[b.bookingStatus] ?? ""}</span>
                      {STATUS_LABEL[b.bookingStatus] ?? b.bookingStatus}
                    </span>
                  </Link>

                  {/* P1-1: 右側快捷操作鍵 */}
                  <BookingQuickActions
                    bookingId={b.id}
                    status={b.bookingStatus}
                    isCheckedIn={b.isCheckedIn}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ── Quick Actions ── */}
      <div className="flex flex-wrap gap-2">
        <QuickLink href="/dashboard/bookings/new" label="新增預約" primary />
        <QuickLink href="/dashboard/customers" label="顧客管理" />
        <QuickLink href={`/dashboard/bookings?view=day&date=${todayDateStr}`} label="今日時段表" />
        <QuickLink href="/dashboard/transactions" label="交易紀錄" />
        <QuickLink href="/dashboard/cashbook" label="現金帳" />
        {isOwner && <QuickLink href="/dashboard/staff" label="店長管理" />}
        <QuickLink href="/dashboard/reports" label="報表" />
      </div>

      {/* ── Calendar Overview ── */}
      <section className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-earth-800">預約總覽</h3>
          <Link
            href="/dashboard/bookings"
            className="text-xs text-primary-600 hover:text-primary-700"
          >
            預約管理 →
          </Link>
        </div>
        <DashboardCalendar
          year={year}
          month={month}
          monthData={monthData}
        />
      </section>
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
