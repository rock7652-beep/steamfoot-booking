import { cookies } from "next/headers";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { getCurrentUser } from "@/lib/session";
import { resolveActiveStoreId } from "@/lib/store";
import { getStoreFilter } from "@/lib/manager-visibility";
import { bookingDateToday, formatTWTime } from "@/lib/date-utils";
import { ACTIVE_BOOKING_STATUSES, STATUS_LABEL } from "@/lib/booking-constants";
import { prisma } from "@/lib/db";
import { getDashboardTodaySummary } from "@/server/queries/dashboard-summary";
import { getLatestResolvedRequest } from "@/server/queries/upgrade-request";
import { getLatestReconciliationRun } from "@/server/queries/reconciliation";
import { ReconciliationBanner } from "@/components/reconciliation-banner";
import { UpgradeResultBanner } from "@/components/upgrade-result-banner";
import {
  PageShell,
  PageHeader,
  KpiStrip,
  SideCard,
  DataTable,
  EmptyRow,
  type Column,
} from "@/components/desktop";

/**
 * 店家後台首頁 — Decision Page（桌機版）
 *
 * 對齊 design/04-phase2-plan.md §3①：
 *   PageHeader → KpiStrip → 8+4 grid（今日預約表 | 快速操作 + 本月小結）
 *
 * 不再使用 components/ui/kpi-card / section-card；一律走 desktop primitives 家族。
 */

interface TodayBookingRow {
  id: string;
  slotTime: string;
  customerName: string;
  customerId: string | null;
  bookingStatus: string;
  people: number;
  staffName: string | null;
  staffColor: string | null;
}

export default async function DashboardHomePage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const cookieStore = await cookies();
  const cookieStoreId = cookieStore.get("active-store-id")?.value ?? null;
  const activeStoreId = resolveActiveStoreId(user, cookieStoreId);
  const isOwner = user.role === "ADMIN" || user.role === "OWNER";

  const todayLabel = formatTWTime(new Date(), { dateOnly: true });
  const storeFilter = getStoreFilter(user, activeStoreId);
  const todayBooking = bookingDateToday();

  const [summary, todayBookings, resolvedRequest, reconciliation] = await Promise.all([
    getDashboardTodaySummary(activeStoreId),
    prisma.booking.findMany({
      where: {
        bookingDate: todayBooking,
        bookingStatus: { in: [...ACTIVE_BOOKING_STATUSES] },
        ...storeFilter,
      },
      select: {
        id: true,
        slotTime: true,
        bookingStatus: true,
        people: true,
        customer: { select: { id: true, name: true } },
        revenueStaff: { select: { displayName: true, colorCode: true } },
      },
      orderBy: { slotTime: "asc" },
      take: 10,
    }),
    user.storeId
      ? getLatestResolvedRequest(user.storeId).catch(() => null)
      : Promise.resolve(null),
    getLatestReconciliationRun().catch(() => null),
  ]);

  const rows: TodayBookingRow[] = todayBookings.map((b) => ({
    id: b.id,
    slotTime: b.slotTime,
    customerName: b.customer.name,
    customerId: b.customer.id,
    bookingStatus: b.bookingStatus,
    people: b.people,
    staffName: b.revenueStaff?.displayName ?? null,
    staffColor: b.revenueStaff?.colorCode ?? null,
  }));

  const kpis = [
    { label: "今日預約", value: `${summary.todayBookingCount} 筆`, tone: "primary" as const },
    { label: "今日人數", value: `${summary.todayPeople} 人`, tone: "blue" as const },
    { label: "今日完成", value: `${summary.todayCompletedCount} 筆`, tone: "green" as const },
    ...(summary.todayRevenue !== null
      ? [
          {
            label: "今日營收",
            value: `NT$ ${summary.todayRevenue.toLocaleString()}`,
            tone: "amber" as const,
          },
        ]
      : []),
    { label: "名下顧客", value: `${summary.customerCount} 位`, tone: "earth" as const },
  ];

  const columns: Column<TodayBookingRow>[] = [
    {
      key: "slot",
      header: "時段",
      accessor: (b) => (
        <span className="tabular-nums text-sm font-medium text-earth-900">{b.slotTime}</span>
      ),
      width: "w-20",
    },
    {
      key: "customer",
      header: "顧客",
      accessor: (b) => <span className="text-sm text-earth-800">{b.customerName}</span>,
    },
    {
      key: "people",
      header: "人數",
      align: "right",
      priority: "secondary",
      accessor: (b) => <span className="tabular-nums">{b.people}</span>,
    },
    {
      key: "staff",
      header: "店長",
      priority: "secondary",
      accessor: (b) =>
        b.staffName ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: b.staffColor ?? "#d1d5db" }}
            />
            {b.staffName}
          </span>
        ) : (
          <span className="text-earth-400">未指派</span>
        ),
    },
    {
      key: "status",
      header: "狀態",
      accessor: (b) => {
        const tone =
          b.bookingStatus === "COMPLETED"
            ? "bg-green-50 text-green-700"
            : b.bookingStatus === "NO_SHOW"
              ? "bg-red-50 text-red-700"
              : b.bookingStatus === "CANCELLED"
                ? "bg-earth-100 text-earth-500"
                : "bg-blue-50 text-blue-700";
        return (
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${tone}`}>
            {STATUS_LABEL[b.bookingStatus] ?? b.bookingStatus}
          </span>
        );
      },
    },
  ];

  const quickActions: Array<{ href: string; label: string; hint: string }> = [
    { href: "/dashboard/bookings/new", label: "＋ 新增預約", hint: "快速建立今日或未來預約" },
    { href: "/dashboard/customers", label: "顧客管理", hint: "搜尋、篩選、查看顧客詳情" },
    ...(isOwner
      ? [{ href: "/dashboard/revenue", label: "營收", hint: "今日 / 本月指標 + 交易" }]
      : []),
    { href: "/dashboard/settings", label: "設定", hint: "店舖 / 店長 / 方案" },
  ];

  return (
    <PageShell>
      <PageHeader
        title="儀表板"
        subtitle={`${todayLabel}｜歡迎回來，${user.name ?? "店長"}`}
        actions={
          <Link
            href="/dashboard/bookings/new"
            className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-primary-700"
          >
            ＋ 新增預約
          </Link>
        }
      />

      {resolvedRequest ? (
        <UpgradeResultBanner
          status={resolvedRequest.status}
          requestedPlan={resolvedRequest.requestedPlan}
          reviewNote={resolvedRequest.reviewNote}
        />
      ) : null}
      {reconciliation ? (
        <ReconciliationBanner
          status={reconciliation.status}
          mismatchCount={reconciliation.mismatchCount}
          errorCount={reconciliation.errorCount}
          startedAt={reconciliation.startedAt}
          failedChecks={reconciliation.checks.map((c) => ({
            checkName: c.checkName,
            status: c.status,
          }))}
        />
      ) : null}

      <KpiStrip items={kpis} />

      <div className="grid grid-cols-12 gap-3">
        {/* 左：今日預約表 */}
        <div className="col-span-12 lg:col-span-8">
          <section className="rounded-xl border border-earth-200 bg-white">
            <div className="flex items-center justify-between px-3 py-2">
              <div>
                <h2 className="text-sm font-semibold text-earth-800">今日預約</h2>
                <p className="text-[11px] text-earth-400">
                  共 {summary.todayBookingCount} 筆｜完成 {summary.todayCompletedCount} · 未到 {summary.noShowCount}
                  {summary.todayUnassignedCount > 0
                    ? `｜未指派 ${summary.todayUnassignedCount}`
                    : ""}
                </p>
              </div>
              <Link
                href="/dashboard/bookings"
                className="text-[11px] text-primary-600 hover:text-primary-700"
              >
                完整預約管理 →
              </Link>
            </div>
            {rows.length === 0 ? (
              <EmptyRow
                title="今天還沒有預約"
                hint="可手動建立或等顧客自助預約"
                cta={{ label: "新增預約", href: "/dashboard/bookings/new" }}
              />
            ) : (
              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(b) => b.id}
                rowHref={(b) => `/dashboard/bookings/${b.id}`}
                className="rounded-none border-0 border-t border-earth-100"
              />
            )}
          </section>
        </div>

        {/* 右：快速操作 + 本月小結 */}
        <aside className="col-span-12 space-y-3 lg:col-span-4">
          <SideCard title="快速操作" subtitle="常用入口">
            <div className="flex flex-col gap-1.5">
              {quickActions.map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="flex items-center justify-between rounded-md border border-earth-200 px-3 py-1.5 hover:bg-earth-50"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-earth-800">{a.label}</p>
                    <p className="truncate text-[10px] text-earth-400">{a.hint}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-earth-400">→</span>
                </Link>
              ))}
            </div>
          </SideCard>

          <SideCard title="本週對照" subtitle="今日 vs 上週同日">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-earth-500">今日預約</span>
              <span className="tabular-nums text-sm font-semibold text-earth-900">
                {summary.todayBookingCount}
                <span className="ml-1 text-[10px] font-normal text-earth-400">
                  / 上週 {summary.lastWeekBookingCount}
                </span>
              </span>
            </div>
          </SideCard>
        </aside>
      </div>

      {/* 下方 summary — placeholder bar，後續擴充更多月份概況 */}
      <section className="rounded-xl border border-dashed border-earth-200 bg-earth-50/40 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold text-earth-700">本月概況</h3>
            <p className="text-[11px] text-earth-400">
              想看完整營收 / 完成服務 / 推薦趨勢，請前往營收與報表
            </p>
          </div>
          <div className="flex gap-1.5">
            <Link
              href="/dashboard/revenue"
              className="rounded-md border border-earth-200 bg-white px-3 py-1 text-[11px] font-medium text-earth-700 hover:bg-earth-50"
            >
              營收 →
            </Link>
            <Link
              href="/dashboard/reports"
              className="rounded-md border border-earth-200 bg-white px-3 py-1 text-[11px] font-medium text-earth-700 hover:bg-earth-50"
            >
              報表 →
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
