import { requireDashboardCoreFeature } from "@/lib/dashboard-core-feature";
import { Suspense } from "react";
import { loadBookingRosterLabels } from "@/server/queries/booking-roster-labels";
import { getMonthBookingSummary } from "@/server/queries/booking";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import {
  parseLocalDate,
  toDateInputValue,
  toLocalDateStr,
} from "@/lib/date-utils";
import { OperationTiming } from "@/lib/operation-timing";
import { ServerTiming, withTiming } from "@/lib/perf";
import { getAccessibleStoreIds, getActiveStoreForRead } from "@/lib/store";
import { resolveStoreViewContextFromCookie } from "@/lib/store-view-context-server";
import { getCachedMonthScheduleSummary } from "@/lib/query-cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { spaPrisma } from "@/lib/spa-db";
import { PageShell, PageHeader } from "@/components/desktop";
import { CashbookShortcut } from "../cashbook/_components/cashbook-shortcut";
import { FormSuccessToast } from "@/components/form-success-toast";
import { SteamBookingDrawer } from "./steam-booking-drawer";
import { BookingMonthWorkspace } from "./booking-month-workspace";
import { BookingWorkspaceLoading } from "./booking-workspace-loading";
import { BookingLoadError } from "./booking-load-error";
import { bookingDashboardPathForStoreModule } from "@/lib/industry-dashboard-routes";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { isOperationGuidePreview } from "@/lib/operation-guide-preview";

/**
 * 預約管理 — 桌機版（Phase 2 desktop family）
 *
 * PageShell + PageHeader 對齊 dashboard / customers / growth / revenue / reports。
 * 主體委由 BookingsManager（client）處理月曆 + 日明細 + booking detail drawer。
 */
interface PageProps {
  searchParams: Promise<{ year?: string; month?: string; date?: string; bookingId?: string }>;
}

export default async function BookingsPage({ searchParams }: PageProps) {
  await requireDashboardCoreFeature("basic_booking");
  const timing = new OperationTiming("steamfoot.page.shell");
  try {
  const user = await timing.measure("session", () => getCurrentUser());
  if (
    !user ||
    !(await timing.measure("permission", () => checkPermission(user.role, user.staffId, "booking.read")))
  ) {
    redirect("/dashboard");
  }
  const operationGuidePreview = isOperationGuidePreview();
  const params = await searchParams;

  // getActiveStoreForRead() already gives an authorized route-first store scope.
  // Reapplying the viewed-store cookie here can replace /s/:slug with a stale store.
  const [activeStoreId, storeViewContext, canManageHours, accessibleStoreIds, canEditBookingNote] = await Promise.all([
    timing.measure("activeStore", () => getActiveStoreForRead(user)),
    timing.measure("viewContext", () => resolveStoreViewContextFromCookie(user)),
    timing.measure("hoursPermission", () => checkPermission(user.role, user.staffId, "business_hours.manage")),
    params.bookingId
      ? timing.measure("accessibleStores", () => getAccessibleStoreIds(user))
      : Promise.resolve([]),
    timing.measure("notePermission", () => checkPermission(user.role, user.staffId, "booking.update")),
  ]);
  const fallbackStoreId = activeStoreId;
  // Booking ids are globally unique. Resolve legacy and current notification
  // links only within stores this user is authorized to read, then let the
  // matched booking determine both data scope and read-only mode.
  const deepLinkedBooking = params.bookingId
    ? (await prisma.booking.findFirst({
        where: { id: params.bookingId, storeId: { in: accessibleStoreIds } },
        select: { id: true, storeId: true, bookingDate: true },
      })) ?? (await spaPrisma.spaBooking.findFirst({
        where: { id: params.bookingId, storeId: { in: accessibleStoreIds } },
        select: { id: true, storeId: true, bookingDate: true },
      }))
    : null;
  const bookingsStoreId = deepLinkedBooking?.storeId ?? fallbackStoreId;
  const storeModule = bookingsStoreId
    ? await getStoreIndustryModule(bookingsStoreId)
    : null;
  const canonicalPath = bookingDashboardPathForStoreModule(storeModule);
  if (canonicalPath !== "/dashboard/bookings") redirect(canonicalPath);
  const isViewMode = deepLinkedBooking
    ? user.role !== "ADMIN" && deepLinkedBooking.storeId !== user.storeId
    : storeViewContext?.isViewMode === true;
  const todayStr = toLocalDateStr();
  const [todayY, todayM] = todayStr.split("-").map(Number);
  const deepLinkedDate = deepLinkedBooking?.bookingDate.toISOString().slice(0, 10);
  const requestedDate = params.date ?? deepLinkedDate;
  const normalizedDate = normalizeRequestedDate(requestedDate, todayStr);
  const [selectedY, selectedM] = normalizedDate.split("-").map(Number);
  const year = requestedDate
    ? selectedY
    : params.year
      ? parseInt(params.year)
      : todayY;
  const month = requestedDate
    ? selectedM
    : params.month
      ? parseInt(params.month)
      : todayM;
  const logCtx = {
    page: "bookings" as const,
    activeStoreId: bookingsStoreId,
    ownStoreId: activeStoreId,
    isViewMode,
    year,
    month,
    userId: user.id,
    sessionRole: user.role,
  };
  return (
    <PageShell compact>
      <FormSuccessToast />
      <PageHeader compact
        title="預約管理"
        actions={
          <div className="flex flex-wrap items-center gap-2">
          {
          isViewMode ? (
            <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
              查看模式不可新增預約
            </span>
          ) : (
            <div className="flex items-center gap-2">
            <CashbookShortcut readOnly={isViewMode} triggerClassName="!min-w-32 !px-3 !py-0 !shadow-none" />
            <SteamBookingDrawer date={normalizedDate} triggerLabel="＋ 新增預約" triggerClassName="inline-flex min-h-11 min-w-32 items-center justify-center rounded-lg border border-earth-200 bg-white px-3 text-sm font-medium text-primary-700 hover:bg-primary-50"/>

            </div>
          )
          }
          </div>
        }
      />
      <Suspense fallback={<BookingWorkspaceLoading year={year} month={month} />}>
        <BookingWorkspaceData
          userId={user.id}
          bookingsStoreId={bookingsStoreId}
          year={year}
          month={month}
          isViewMode={isViewMode}
          canManageHours={canManageHours}
          operationGuidePreview={operationGuidePreview}
          canEditBookingNote={canEditBookingNote}
          initialBookingId={deepLinkedBooking?.id ?? null}
          logCtx={logCtx}
        />
      </Suspense>
    </PageShell>
  );
  } finally { timing.finish(); }
}


async function BookingWorkspaceData({
  userId, bookingsStoreId, year, month, isViewMode, canManageHours,
  operationGuidePreview, initialBookingId, logCtx, canEditBookingNote,
}: {
  userId: string;
  bookingsStoreId: string | null;
  year: number;
  month: number;
  isViewMode: boolean;
  canManageHours: boolean;
  canEditBookingNote: boolean;
  operationGuidePreview: boolean;
  initialBookingId: string | null;
  logCtx: Record<string, unknown>;
}) {
  const timing = new OperationTiming("steamfoot.page.data");
  try {
  const timer = new ServerTiming("/dashboard/bookings");
  const [monthData, monthSchedule, servicePlans] =
    await timing.measure("data", () => Promise.all([
      // 查詢失敗與成功但沒有預約必須分開，避免店長誤判空檔。
      withTiming("getMonthBookingSummary", timer, () =>
        getMonthBookingSummary(year, month, bookingsStoreId).catch((e) => {
          console.error("[bookings] getMonthBookingSummary failed", {
            ...logCtx,
            step: "getMonthBookingSummary",
            error: e instanceof Error ? e.message : String(e),
          });
          return null;
        }),
      ),
      // 月份營業狀態摘要 — 讓月曆可分辨「沒預約」vs「沒營業」。
      // ADMIN 全店視角（無 activeStoreId）跨店無法匯總一份排班 → 給空表
      // 退化為「無法判斷」，UI 端會落到 generic 文案不會誤標公休。
      withTiming("monthSchedule", timer, () =>
        bookingsStoreId
          ? getCachedMonthScheduleSummary(bookingsStoreId, year, month).catch(
              (e) => {
                console.error(
                  "[bookings] getCachedMonthScheduleSummary failed",
                  {
                    ...logCtx,
                    step: "monthSchedule",
                    error: e instanceof Error ? e.message : String(e),
                  },
                );
                return {} as Awaited<
                  ReturnType<typeof getCachedMonthScheduleSummary>
                >;
              },
            )
          : Promise.resolve({}),
      ),
      withTiming("servicePlans", timer, () =>
        bookingsStoreId
          ? prisma.servicePlan
              .findMany({
                where: { storeId: bookingsStoreId, isActive: true },
                select: { id: true, name: true },
                orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
              })
              .catch((e) => {
                console.error("[bookings] servicePlans query failed", {
                  ...logCtx,
                  step: "servicePlans",
                  error: e instanceof Error ? e.message : String(e),
                });
                return [] as Array<{ id: string; name: string }>;
              })
          : Promise.resolve([]),
      ),
    ]));
  const customerLabels=monthData===null?undefined:await timing.measure("labels",()=>loadBookingRosterLabels(monthData,bookingsStoreId));
  timer.finish();
  return monthData === null ? <BookingLoadError /> : (
      <BookingMonthWorkspace
        key={`${userId}:${bookingsStoreId ?? "ALL"}:${isViewMode}:${year}:${month}:${initialBookingId ?? ""}`}
        operationGuidePreview={operationGuidePreview}
        storeId={bookingsStoreId ?? undefined}
        year={year}
        month={month}
        monthData={monthData}
        customerLabels={customerLabels}
        monthSchedule={monthSchedule}
        servicePlans={servicePlans}
        readOnly={isViewMode}
        canManageHours={canManageHours}
        canEditBookingNote={canEditBookingNote}
        initialBookingId={initialBookingId}
      />
  );
  } finally { timing.finish(); }
}

function normalizeRequestedDate(
  value: string | undefined,
  fallback: string,
): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = parseLocalDate(value);
  return toDateInputValue(parsed) === value ? value : fallback;
}
