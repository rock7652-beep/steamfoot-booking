import { BrandOverviewContent } from "@/components/hq-brand-overview";
import { CourseHome } from "./courses/home";
import { SpaHome } from "./spa-home";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { getCurrentUser } from "@/lib/session";
import { getActiveStoreForRead } from "@/lib/store";
import { getStoreFilter } from "@/lib/manager-visibility";
import {
  bookingDateToday,
  toLocalDateStr,
  toLocalMonthStr,
} from "@/lib/date-utils";
import { ACTIVE_BOOKING_STATUSES, STATUS_LABEL } from "@/lib/booking-constants";
import { checkPermission } from "@/lib/permissions";
import { getEffectiveStoreRole } from "@/lib/hq-store-view";
import { getHqStoreViewContext, registerHqStoreViewContext } from "@/lib/hq-store-view-context";
import { getStoreFeaturePresentation, hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import {
  resolveStoreViewContext,
  type StoreViewContext,
} from "@/lib/store-organization";
import { isStoreSubscriptionWriteBlocked } from "@/lib/subscription-guard";
import { prisma } from "@/lib/db";
import { getDashboardTodaySummaryForUser } from "@/server/queries/dashboard-summary";
import { getLatestResolvedRequest } from "@/server/queries/upgrade-request";
import { getLatestReconciliationRun } from "@/server/queries/reconciliation";
import { getStoreTodosForUser } from "@/server/queries/store-todos";
import {
  getCustomerCareSummary,
  type CustomerCareSummary,
} from "@/server/queries/customer-care";
import { getMonthlyUnconvertedCustomers } from "@/server/queries/conversion-metrics";
import { countPendingCentralMemberLinkReviews } from "@/server/queries/central-member-link-review";
import { getBirthdayCustomersForMonth } from "@/server/queries/customer-birthday";
import { ReconciliationBanner } from "@/components/reconciliation-banner";
import { UpgradeResultBanner } from "@/components/upgrade-result-banner";
import { StoreTodoCard } from "./store-todo-card";
import {
  CustomerCareSummaryCard,
  type CustomerWorkspaceSummary,
} from "./customer-care-summary-card";
import {
  PageShell,
  PageHeader,
  KpiStrip,
  DataTable,
  EmptyRow,
  type Column,
} from "@/components/desktop";

/** 店家首頁：今日摘要 → 待處理與顧客關懷 → 今日預約。 */

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

  const activeStoreId = await getActiveStoreForRead(user);
  if (user.role === "ADMIN" && !activeStoreId && await checkPermission(user.role, user.staffId, "report.read")) {
    return <BrandOverviewContent />;
  }
  if (activeStoreId && await getStoreIndustryModule(activeStoreId) === "course") {
    return <CourseHome user={user} storeId={activeStoreId} />;
  }
  let storeViewContext: StoreViewContext | null = null;
  if (user.role !== "ADMIN" && user.storeId) {
    storeViewContext = await resolveStoreViewContext(user, { viewedStoreId: activeStoreId });
  }
  const isViewMode = storeViewContext?.isViewMode ?? false;
  const [bookingPermission, createBookingPermission, customerPermission, revenuePermission, planPermission,
    bookingFeature, customerFeature, revenueFeature, planFeature, reconciliationFeature, customerCareState] = await Promise.all([
    checkPermission(user.role, user.staffId, "booking.read"),
    checkPermission(user.role, user.staffId, "booking.create"),
    checkPermission(user.role, user.staffId, "customer.read"),
    checkPermission(user.role, user.staffId, "transaction.read"),
    checkPermission(user.role, user.staffId, "wallet.read"),
    activeStoreId ? hasStoreFeature(activeStoreId, FEATURES.BASIC_BOOKING) : false,
    activeStoreId ? hasStoreFeature(activeStoreId, FEATURES.CUSTOMER_MANAGEMENT) : false,
    activeStoreId ? hasStoreFeature(activeStoreId, FEATURES.TRANSACTION_MANAGEMENT) : false,
    activeStoreId ? hasStoreFeature(activeStoreId, FEATURES.PLAN_MANAGEMENT) : false,
    activeStoreId ? hasStoreFeature(activeStoreId, FEATURES.RECONCILIATION) : false,
    activeStoreId ? getStoreFeaturePresentation(activeStoreId, FEATURES.CUSTOMER_CARE) : "HIDDEN",
  ]);
  const canViewBookings = bookingPermission && bookingFeature;
  const canCreateBooking = canViewBookings && createBookingPermission;
  const canViewCustomers = customerPermission && customerFeature;
  const canViewRevenue = revenuePermission && revenueFeature;
  const canViewPlans = planPermission && planFeature;
  const canViewCustomerCare = canViewCustomers && customerCareState === "ENABLED";
  const showCustomerCare = canViewCustomers && customerCareState !== "HIDDEN";
  if (activeStoreId && await getStoreIndustryModule(activeStoreId) === "spa") {
    return <SpaHome storeId={activeStoreId} canBookings={canViewBookings} canCustomers={canViewCustomers} canRevenue={canViewRevenue} />;
  }

  const dashboardStoreId = activeStoreId;
  const dashboardUser = dashboardStoreId
    ? { ...user, storeId: dashboardStoreId }
    : user;
  const hqStoreViewContext = getHqStoreViewContext(user);
  if (hqStoreViewContext) registerHqStoreViewContext(dashboardUser, hqStoreViewContext.storeId);
  // #307 唯讀模式：到期店家隱藏 / 停用「新增」入口（後端已擋，這裡避免店長白點）
  const subscriptionWriteBlocked = await isStoreSubscriptionWriteBlocked(activeStoreId);
  const isReadOnly = subscriptionWriteBlocked || (isViewMode && !storeViewContext?.canWrite);

  const todayLabel = toLocalDateStr();
  const storeFilter = getStoreFilter(dashboardUser, dashboardStoreId);
  const todayBooking = bookingDateToday();

  // 各區塊獨立 catch — 任一塊失敗（DB 連線不穩、缺 store / config 等）不影響其他區塊
  // fallback 一律保守值（0、空陣列、null），不偽造任何營運數據
  const SUMMARY_FALLBACK = {
    todayBookingCount: 0,
    todayPeople: 0,
    todayCompletedCount: 0,
    todayCompletedPeople: 0,
    noShowCount: 0,
    todayUnassignedCount: 0,
    todayRevenue: null,
    lastWeekBookingCount: 0,
    customerCount: 0,
  } as const;

  // 顧客經營摘要 — 需 customer.read；只讀 count（不讀名單）。
  // 獨立 catch：查詢失敗回 null,卡片降級顯示,不影響首頁其他區塊。
  // Central identity health is HQ-only. OWNER can have identity.rebind for
  // store-level workflows, but must not see or trigger this cross-identity scan.
  const effectiveRole = await getEffectiveStoreRole(user);
  const pendingMemberLinkReviews = effectiveRole === "ADMIN" && dashboardStoreId
    ? await countPendingCentralMemberLinkReviews(dashboardStoreId).catch(() => 0)
    : 0;
  const careSummaryPromise: Promise<CustomerCareSummary | null> = canViewCustomerCare
    ? getCustomerCareSummary(dashboardUser, dashboardStoreId).catch((e) => {
        console.error("[dashboard-home] getCustomerCareSummary failed", {
          activeStoreId: dashboardStoreId,
          userId: user.id,
          error: e instanceof Error ? e.message : String(e),
        });
        return null;
      })
    : Promise.resolve(null);

  // 首頁只取顧客工作台既有資料來源的數量，不另建統計口徑。
  const workspaceMonth = toLocalMonthStr();
  const birthdayCountPromise: Promise<number | null> = canViewCustomerCare && dashboardStoreId
    ? getBirthdayCustomersForMonth(dashboardStoreId, workspaceMonth)
        .then((customers) => customers.length)
        .catch((e) => {
          console.error("[dashboard-home] getBirthdayCustomersForMonth failed", {
            activeStoreId: dashboardStoreId,
            userId: user.id,
            error: e instanceof Error ? e.message : String(e),
          });
          return null;
        })
    : Promise.resolve(canViewCustomerCare ? 0 : null);
  const monthlyUnconvertedCountPromise: Promise<number | null> =
    canViewCustomerCare && dashboardStoreId
      ? getMonthlyUnconvertedCustomers(dashboardStoreId, workspaceMonth)
          .then((customers) => customers.length)
          .catch((e) => {
            console.error("[dashboard-home] getMonthlyUnconvertedCustomers failed", {
              activeStoreId: dashboardStoreId,
              userId: user.id,
              error: e instanceof Error ? e.message : String(e),
            });
            return null;
          })
      : Promise.resolve(canViewCustomerCare ? 0 : null);

  const [
    summary,
    todayBookings,
    resolvedRequest,
    reconciliation,
    todos,
    careSummary,
    birthdayCount,
    monthlyUnconvertedCount,
  ] =
    await Promise.all([
    getDashboardTodaySummaryForUser(dashboardUser, dashboardStoreId).catch((e) => {
      console.error("[dashboard-home] getDashboardTodaySummary failed", {
        activeStoreId: dashboardStoreId,
        userId: user.id,
        error: e instanceof Error ? e.message : String(e),
      });
      return SUMMARY_FALLBACK;
    }),
    canViewBookings ? prisma.booking.findMany({
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
    }).catch((e) => {
      console.error("[dashboard-home] todayBookings query failed", {
        activeStoreId,
        userId: user.id,
        error: e instanceof Error ? e.message : String(e),
      });
      return [] as Array<{
        id: string;
        slotTime: string;
        bookingStatus: string;
        people: number;
        customer: { id: string; name: string };
        revenueStaff: { displayName: string; colorCode: string | null } | null;
      }>;
    }) : Promise.resolve([]),
    dashboardStoreId
      ? getLatestResolvedRequest(dashboardStoreId).catch(() => null)
      : Promise.resolve(null),
    canViewRevenue && reconciliationFeature
      ? getLatestReconciliationRun().catch(() => null)
      : Promise.resolve(null),
    canViewBookings || canViewCustomers || canViewRevenue ? getStoreTodosForUser(dashboardUser, {
      activeStoreId: dashboardStoreId,
      respectDismissed: !isViewMode,
    }).catch(() => ({ items: [], total: 0 })) : Promise.resolve({ items: [], total: 0 }),
    careSummaryPromise,
    birthdayCountPromise,
    monthlyUnconvertedCountPromise,
  ]);

  // Keep shortcuts aligned with the selected store's enabled modules.
  const visibleTodos = todos.items.filter((item) => {
    switch (item.type) {
      case "BOOKING": return canViewBookings && canViewCustomers;
      case "PAYMENT": return canViewRevenue && canViewCustomers;
      case "VIP_INTEREST": return canViewCustomers && canViewPlans;
      case "FOLLOW_UP": return canViewCustomerCare;
      case "LOW_SESSIONS": return canViewCustomerCare && canViewPlans;
    }
  });

  const customerWorkspaceSummary: CustomerWorkspaceSummary | null =
    careSummary !== null && birthdayCount !== null && monthlyUnconvertedCount !== null
      ? {
          birthdayCustomers: birthdayCount,
          monthlyUnconvertedCustomers: monthlyUnconvertedCount,
          inactiveCustomers: careSummary.inactiveCustomers,
          lowSessionCustomers: careSummary.lowSessionCustomers,
          expiringPlanCustomers: careSummary.expiringPlanCustomers,
          totalReminders:
            birthdayCount +
            monthlyUnconvertedCount +
            careSummary.inactiveCustomers +
            careSummary.lowSessionCustomers +
            careSummary.expiringPlanCustomers,
        }
      : null;

  const rows: TodayBookingRow[] = todayBookings.map((b) => ({
    id: b.id,
    slotTime: b.slotTime,
    customerName: canViewCustomers ? b.customer.name : "顧客資料受限",
    customerId: canViewCustomers ? b.customer.id : null,
    bookingStatus: b.bookingStatus,
    people: b.people,
    staffName: b.revenueStaff?.displayName ?? null,
    staffColor: b.revenueStaff?.colorCode ?? null,
  }));

  const kpis = [
    ...(canViewBookings ? [{ label: "今日預約", value: `${summary.todayBookingCount} 筆`, tone: "primary" as const },
    { label: "今日人數", value: `${summary.todayPeople} 人`, tone: "blue" as const },
    { label: "今日完成", value: `${summary.todayCompletedCount} 筆`, tone: "green" as const }] : []),
    ...(canViewRevenue && summary.todayRevenue !== null
      ? [
          {
            label: "今日營收",
            value: `NT$ ${summary.todayRevenue.toLocaleString()}`,
            tone: "amber" as const,
          },
        ]
      : []),
    ...(canViewCustomers ? [{ label: "名下顧客", value: `${summary.customerCount} 位`, tone: "earth" as const }] : []),
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

  return (
    <PageShell compact>
      <PageHeader
        title="首頁"
        subtitle={`${todayLabel} · 今日工作`}
        actions={
          !canCreateBooking ? null : isReadOnly ? (
            <span
              className="inline-flex min-h-11 cursor-not-allowed items-center rounded-lg bg-earth-100 px-3 text-sm font-medium text-earth-400"
              title={isViewMode ? "查看模式下不可新增預約" : "系統已到期，目前為唯讀模式"}
            >
              ＋ 新增預約
            </span>
          ) : (
            <Link
              href="/dashboard/bookings/new"
              className="inline-flex min-h-11 items-center rounded-lg bg-primary-700 px-3 text-sm font-medium text-white hover:bg-primary-800"
            >
              ＋ 新增預約
            </Link>
          )
        }
      />

      <KpiStrip items={kpis} />

      <div className="@container space-y-2">
        {pendingMemberLinkReviews > 0 ? (
          <Link
            href="/dashboard/member-link-reviews"
            className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <span>待處理會員連結申請</span>
            <strong>{pendingMemberLinkReviews} 筆 →</strong>
          </Link>
        ) : null}
        <div className={`grid items-start gap-2 ${showCustomerCare ? "@min-[56rem]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : ""}`}>
          {(canViewBookings || canViewCustomers || canViewRevenue) && <StoreTodoCard items={visibleTodos} defaultVisible={3} readOnly={isViewMode} canCreateBooking={canCreateBooking && !isReadOnly} />}
          {showCustomerCare && (canViewCustomerCare
            ? <CustomerCareSummaryCard summary={customerWorkspaceSummary} />
            : <section className="rounded-xl border border-earth-200 bg-white px-4 py-3"><h2 className="text-sm font-semibold text-earth-800">今日顧客經營</h2><p className="mt-2 text-sm text-earth-500">顧客經營尚未開通。</p></section>)}
        </div>
      </div>

      {!isViewMode && resolvedRequest ? (
        <UpgradeResultBanner
          status={resolvedRequest.status}
          requestedPlan={resolvedRequest.requestedPlan}
          reviewNote={resolvedRequest.reviewNote}
        />
      ) : null}
      {!isViewMode && reconciliation ? (
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

      {canViewBookings && <section className="rounded-xl border border-earth-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold text-earth-800">今日預約</h2>
          <p className="text-sm text-earth-500">
            共 {summary.todayBookingCount} 筆｜上週同日 {summary.lastWeekBookingCount} 筆｜完成 {summary.todayCompletedCount} · 未到 {summary.noShowCount}
            {summary.todayUnassignedCount > 0
              ? `｜未指派 ${summary.todayUnassignedCount}`
              : ""}
          </p>
        </div>
        {isViewMode ? (
          <span className="text-sm text-earth-500">查看模式</span>
        ) : (
          <Link
            href="/dashboard/bookings"
            className="inline-flex min-h-11 items-center text-sm text-primary-700 hover:text-primary-800"
          >
            完整預約管理 →
          </Link>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyRow
          dense
          title="今天還沒有預約"
          hint={
            isReadOnly
              ? isViewMode ? "查看模式下無法新增預約" : "系統已到期，目前為唯讀模式，無法新增預約"
              : canCreateBooking ? "可手動建立或等顧客自助預約" : "新預約會顯示在此處"
          }
          cta={
            isReadOnly || !canCreateBooking
              ? undefined
              : { label: "新增預約", href: "/dashboard/bookings/new" }
          }
        />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(b) => b.id}
          rowHref={isViewMode ? undefined : (b) => `/dashboard/bookings/${b.id}`}
          className="rounded-none border-0 border-t border-earth-100"
        />
      )}
      </section>}
    </PageShell>
  );
}
