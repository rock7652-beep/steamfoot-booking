import { Suspense } from "react";
import { cookies } from "next/headers";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { RelativeLink } from "./growth/_components/relative-link";
import { getCurrentUser } from "@/lib/session";
import { resolveActiveStoreId } from "@/lib/store";
import { prisma } from "@/lib/db";
import { getStoreFilter } from "@/lib/manager-visibility";
import { bookingDateToday, toLocalDateStr } from "@/lib/date-utils";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/booking-constants";
import {
  getDashboardTodaySummary,
  getDashboardOverviewSummary,
  getGrowthSummary,
} from "@/server/queries/dashboard-summary";
import { getMonthBookingSummary } from "@/server/queries/booking";
import { getLatestReconciliationRun } from "@/server/queries/reconciliation";
import { getLatestResolvedRequest } from "@/server/queries/upgrade-request";

import { KpiCard } from "@/components/ui/kpi-card";
import { SectionCard } from "@/components/ui/section-card";
import { SectionSkeleton, KpiCardSkeleton } from "@/components/section-skeleton";
import { DashboardAlerts } from "./dashboard-alerts";
import { DashboardCalendar } from "./dashboard-calendar";
import { TodayBookingsList } from "./today-bookings-list";
import { ReconciliationBanner } from "@/components/reconciliation-banner";
import { UpgradeResultBanner } from "@/components/upgrade-result-banner";

type Mode = "today" | "overview";

interface PageProps {
  searchParams: Promise<{ mode?: string; year?: string; month?: string }>;
}

/**
 * 店家後台首頁（v1）— 雙模式單頁
 *
 * Mode A（today，預設）：今日營運 — 今日預約 / 待處理 / 快速操作 / 今日重點名單
 * Mode B（overview）：經營總覽 — 本月營收 / 本月預約 / 回訪率 / 推薦數 / 成長 Top 3
 *
 * 資料策略：
 * - 每個區塊各自 async server component，以 <Suspense> 獨立 stream
 * - 不預抓另一模式的資料（切 mode 才抓）
 * - 大列表不放首頁，只顯示 summary + 快速連結
 */
export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user) return null;

  const mode: Mode = params.mode === "overview" ? "overview" : "today";

  const cookieStore = await cookies();
  const cookieStoreId = cookieStore.get("active-store-id")?.value ?? null;
  const activeStoreId = resolveActiveStoreId(user, cookieStoreId);

  const isOwner = user.role === "ADMIN" || user.role === "OWNER";

  // 今日 label — 純 UI 不需 await query
  const todayLabel = new Date().toLocaleDateString("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  // 升級結果 banner — 輕量 query，首屏同步 resolve
  const resolvedRequest = user.storeId
    ? await getLatestResolvedRequest(user.storeId).catch(() => null)
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-4">
      {/* 1. 標題 */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-earth-500">歡迎回來，{user.name}</p>
            <p className="mt-0.5 text-lg font-bold text-earth-900">今天 {todayLabel}</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="mt-4 flex gap-1 rounded-lg bg-earth-50 p-1">
          <ModeTab mode="today" active={mode === "today"} label="今日營運" />
          <ModeTab mode="overview" active={mode === "overview"} label="經營總覽" />
        </div>
      </div>

      {/* 升級結果 */}
      {resolvedRequest && (
        <UpgradeResultBanner
          status={resolvedRequest.status}
          requestedPlan={resolvedRequest.requestedPlan}
          reviewNote={resolvedRequest.reviewNote}
        />
      )}

      {/* 對帳警示 — 只抓一次，owner 才顯示 */}
      {isOwner && (
        <Suspense fallback={null}>
          <ReconciliationSection />
        </Suspense>
      )}

      {mode === "today" ? (
        <ModeToday activeStoreId={activeStoreId} isOwner={isOwner} params={params} />
      ) : (
        <ModeOverview activeStoreId={activeStoreId} isOwner={isOwner} />
      )}
    </div>
  );
}

// ============================================================
// Tab 連結
// ============================================================

function ModeTab({ mode, active, label }: { mode: Mode; active: boolean; label: string }) {
  // today 省略 query param，overview 帶 ?mode=overview；RelativeLink 以當前 pathname 為 base
  // 保留 route prefix（/hq 或 /s/{slug}/admin），不再硬寫 "/dashboard"
  return (
    <RelativeLink
      params={{ mode: mode === "today" ? null : mode }}
      className={`flex-1 rounded-md px-3 py-1.5 text-center text-sm font-medium transition-colors ${
        active
          ? "bg-white text-earth-900 shadow-sm"
          : "text-earth-500 hover:text-earth-800"
      }`}
    >
      {label}
    </RelativeLink>
  );
}

// ============================================================
// 對帳 banner（獨立 Suspense 區塊）
// ============================================================

async function ReconciliationSection() {
  const latest = await getLatestReconciliationRun().catch(() => null);
  if (!latest || latest.status === "pass") return null;
  return (
    <ReconciliationBanner
      status={latest.status}
      mismatchCount={latest.mismatchCount}
      errorCount={latest.errorCount}
      startedAt={latest.startedAt}
      failedChecks={latest.checks}
    />
  );
}

// ============================================================
// Mode A — 今日營運
// ============================================================

async function ModeToday({
  activeStoreId,
  isOwner,
  params,
}: {
  activeStoreId: string | null;
  isOwner: boolean;
  params: { year?: string; month?: string };
}) {
  // 今日重點列表 — 與 summary 平行，同樣獨立 Suspense

  return (
    <>
      {/* Section: 今日 KPI + 待處理（共用一次 summary 查詢） */}
      <Suspense fallback={<TodayKpiFallback />}>
        <TodayKpiBlock activeStoreId={activeStoreId} isOwner={isOwner} />
      </Suspense>

      {/* Section: 快速操作 + 今日重點名單 */}
      <Suspense fallback={<SectionSkeleton heightClass="h-32" />}>
        <TodayBookingsBlock activeStoreId={activeStoreId} isOwner={isOwner} />
      </Suspense>

      {/* Section: 預約月曆 — 獨立 query，延後 stream */}
      <Suspense fallback={<SectionSkeleton heightClass="h-64" />}>
        <CalendarBlock activeStoreId={activeStoreId} params={params} />
      </Suspense>
    </>
  );
}

function TodayKpiFallback() {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <KpiCardSkeleton key={i} />
        ))}
      </div>
    </>
  );
}

async function TodayKpiBlock({
  activeStoreId,
  isOwner,
}: {
  activeStoreId: string | null;
  isOwner: boolean;
}) {
  const s = await getDashboardTodaySummary(activeStoreId);
  const bookingChange = s.todayBookingCount - s.lastWeekBookingCount;

  return (
    <>
      <DashboardAlerts
        todayBookingCount={s.todayBookingCount}
        noShowCount={s.noShowCount}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <KpiCard
          label="今日預約"
          value={s.todayBookingCount}
          unit="筆"
          color="primary"
          change={bookingChange !== 0 ? { value: bookingChange, label: "vs 上週同日" } : null}
        />
        <KpiCard label="今日人數" value={s.todayPeople} unit="人" color="primary" />
        <KpiCard
          label="今日已完成"
          value={s.todayCompletedPeople}
          unit={`/ ${s.todayPeople}人`}
          color="green"
        />
        <KpiCard label="名下顧客" value={s.customerCount} unit="位" color="earth" />
        <KpiCard
          label="待處理"
          value={s.todayUnassignedCount + s.noShowCount}
          unit="筆"
          color="amber"
        />
        {isOwner && s.todayRevenue !== null && (
          <KpiCard
            label="今日營收"
            value={`$${s.todayRevenue.toLocaleString()}`}
            color="amber"
          />
        )}
      </div>
    </>
  );
}

async function TodayBookingsBlock({
  activeStoreId,
  isOwner,
}: {
  activeStoreId: string | null;
  isOwner: boolean;
}) {
  const user = await getCurrentUser();
  if (!user) return null;
  const storeFilter = getStoreFilter(user, activeStoreId);

  // 只抓前 5 筆（今日重點名單）— 其餘請進 /dashboard/bookings
  const todayBookings = await prisma.booking
    .findMany({
      where: {
        bookingDate: bookingDateToday(),
        bookingStatus: { in: [...ACTIVE_BOOKING_STATUSES] },
        ...storeFilter,
      },
      include: {
        customer: { select: { name: true, phone: true } },
        revenueStaff: { select: { displayName: true, colorCode: true } },
      },
      orderBy: { slotTime: "asc" },
      take: 5,
    })
    .catch(() => []);

  return (
    <SectionCard title="今日預約" action={{ label: "預約管理", href: "/dashboard/bookings" }}>
      <div className="mb-3 flex flex-wrap gap-2">
        <QuickLink href="/dashboard/bookings/new" label="新增預約" primary />
        <QuickLink href="/dashboard/customers" label="顧客管理" />
        <QuickLink href="/dashboard/revenue" label="營收" />
        {isOwner && <QuickLink href="/dashboard/settings" label="設定" />}
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
          <TodayBookingsList bookings={todayBookings} />
          <div className="mt-2 text-right text-[11px] text-earth-400">
            只顯示前 5 筆 ·{" "}
            <Link href="/dashboard/bookings" className="text-primary-600 hover:text-primary-700">
              查看全部 →
            </Link>
          </div>
        </>
      )}
    </SectionCard>
  );
}

async function CalendarBlock({
  activeStoreId,
  params,
}: {
  activeStoreId: string | null;
  params: { year?: string; month?: string };
}) {
  const year = params.year ? parseInt(params.year) : parseInt(toLocalDateStr().slice(0, 4));
  const month = params.month ? parseInt(params.month) : parseInt(toLocalDateStr().slice(5, 7));

  const monthData = await getMonthBookingSummary(year, month, activeStoreId).catch(() => []);

  return (
    <SectionCard title="預約總覽" action={{ label: "預約管理", href: "/dashboard/bookings" }}>
      <DashboardCalendar year={year} month={month} monthData={monthData} />
    </SectionCard>
  );
}

// ============================================================
// Mode B — 經營總覽
// ============================================================

async function ModeOverview({
  activeStoreId,
  isOwner,
}: {
  activeStoreId: string | null;
  isOwner: boolean;
}) {
  return (
    <>
      <Suspense fallback={<OverviewKpiFallback />}>
        <OverviewKpiBlock activeStoreId={activeStoreId} isOwner={isOwner} />
      </Suspense>

      {isOwner && (
        <Suspense fallback={<SectionSkeleton heightClass="h-40" />}>
          <GrowthSummaryBlock activeStoreId={activeStoreId} />
        </Suspense>
      )}
    </>
  );
}

function OverviewKpiFallback() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <KpiCardSkeleton key={i} />
      ))}
    </div>
  );
}

async function OverviewKpiBlock({
  activeStoreId,
  isOwner,
}: {
  activeStoreId: string | null;
  isOwner: boolean;
}) {
  const s = await getDashboardOverviewSummary(activeStoreId);
  const revenueChange =
    s.monthRevenue != null && s.prevMonthRevenue != null && s.prevMonthRevenue > 0
      ? Math.round(((s.monthRevenue - s.prevMonthRevenue) / s.prevMonthRevenue) * 100)
      : null;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {isOwner && (
        <KpiCard
          label={`本月營收（${s.monthLabel}）`}
          value={s.monthRevenue != null ? `$${s.monthRevenue.toLocaleString()}` : "—"}
          color="earth"
          change={revenueChange != null ? { value: revenueChange, label: "vs 上月 %" } : null}
        />
      )}
      <KpiCard label="本月預約" value={s.monthBookingCount} unit="筆" color="primary" />
      <KpiCard label="本月完成" value={s.monthCompletedCount} unit="筆" color="green" />
      <KpiCard
        label="回訪率"
        value={s.returningRate != null ? `${s.returningRate}%` : "—"}
        color="blue"
      />
      <KpiCard label="推薦成效" value={s.referralThisMonth} unit="件" color="amber" />
    </div>
  );
}

async function GrowthSummaryBlock({ activeStoreId }: { activeStoreId: string | null }) {
  const g = await getGrowthSummary(activeStoreId);

  return (
    <SectionCard
      title="成長系統摘要"
      subtitle={`合作店長 ${g.partnerCount} 位 · 準店長 ${g.futureOwnerCount} 位`}
      action={{ label: "成長系統", href: "/dashboard/growth" }}
    >
      {g.top3.length === 0 ? (
        <div className="rounded-xl bg-earth-50 py-6 text-center">
          <p className="text-sm text-earth-400">目前尚無合作店長或準店長候選</p>
        </div>
      ) : (
        <ol className="space-y-1.5">
          {g.top3.map((c, i) => (
            <Link
              key={c.customerId}
              href={`/dashboard/customers/${c.customerId}`}
              className="flex items-center justify-between rounded-lg border border-earth-100 bg-white px-3 py-2 shadow-sm transition hover:border-primary-200"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                    i === 0
                      ? "bg-amber-100 text-amber-700"
                      : i === 1
                      ? "bg-gray-100 text-gray-600"
                      : "bg-orange-100 text-orange-600"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="text-sm font-medium text-earth-800">{c.name}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-primary-500">{c.totalPoints} 點</span>
                <span className="text-blue-500">{c.referralCount} 轉介</span>
              </div>
            </Link>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

// ============================================================
// 共用小元件
// ============================================================

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
