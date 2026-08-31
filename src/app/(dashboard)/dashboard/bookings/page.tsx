import { getMonthBookingSummary } from "@/server/queries/booking";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { toLocalDateStr } from "@/lib/date-utils";
import { ServerTiming, withTiming } from "@/lib/perf";
import { getAccessibleStoreIds, getActiveStoreForRead } from "@/lib/store";
import {
  resolveStoreViewContextFromCookie,
  storeIdForViewContext,
} from "@/lib/store-view-context-server";
import { getCachedMonthScheduleSummary } from "@/lib/query-cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageShell, PageHeader } from "@/components/desktop";
import { FormSuccessToast } from "@/components/form-success-toast";
import { BookingsManager } from "./bookings-manager";

/**
 * 預約管理 — 桌機版（Phase 2 desktop family）
 *
 * PageShell + PageHeader 對齊 dashboard / customers / growth / revenue / reports。
 * 主體委由 BookingsManager（client）處理月曆 + 日明細 + booking detail drawer。
 */
interface PageProps {
  searchParams: Promise<{ year?: string; month?: string; bookingId?: string }>;
}

export default async function BookingsPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "booking.read"))) {
    redirect("/dashboard");
  }
  const params = await searchParams;

  const activeStoreId = await getActiveStoreForRead(user);
  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  const fallbackStoreId = storeIdForViewContext(activeStoreId, storeViewContext);
  // Booking ids are globally unique. Resolve legacy and current notification
  // links only within stores this user is authorized to read, then let the
  // matched booking determine both data scope and read-only mode.
  const accessibleStoreIds = params.bookingId
    ? await getAccessibleStoreIds(user)
    : [];
  const deepLinkedBooking = params.bookingId
    ? await prisma.booking.findFirst({
        where: { id: params.bookingId, storeId: { in: accessibleStoreIds } },
        select: { id: true, storeId: true, bookingDate: true },
      })
    : null;
  const bookingsStoreId = deepLinkedBooking?.storeId ?? fallbackStoreId;
  const isViewMode = deepLinkedBooking
    ? user.role !== "ADMIN" && deepLinkedBooking.storeId !== user.storeId
    : storeViewContext?.isViewMode === true;

  const todayStr = toLocalDateStr();
  const [todayY, todayM] = todayStr.split("-").map(Number);
  const deepLinkedDate = deepLinkedBooking?.bookingDate.toISOString().slice(0, 10);
  const year = deepLinkedDate
    ? Number(deepLinkedDate.slice(0, 4))
    : params.year
      ? parseInt(params.year)
      : todayY;
  const month = deepLinkedDate
    ? Number(deepLinkedDate.slice(5, 7))
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
  const timer = new ServerTiming("/dashboard/bookings");
  const [monthData, monthSchedule, servicePlans] = await Promise.all([
    // 月曆主資料失敗時回空陣列 — 月曆 cell 顯示為「無預約」，UI 不會 crash。
    // 各 cell 仍可被點開，僅是當下無資料；保守於假造任何預約。
    withTiming("getMonthBookingSummary", timer, () =>
      getMonthBookingSummary(year, month, bookingsStoreId).catch((e) => {
        console.error("[bookings] getMonthBookingSummary failed", {
          ...logCtx,
          step: "getMonthBookingSummary",
          error: e instanceof Error ? e.message : String(e),
        });
        return [] as Awaited<ReturnType<typeof getMonthBookingSummary>>;
      }),
    ),
    // 月份營業狀態摘要 — 讓月曆可分辨「沒預約」vs「沒營業」。
    // ADMIN 全店視角（無 activeStoreId）跨店無法匯總一份排班 → 給空表
    // 退化為「無法判斷」，UI 端會落到 generic 文案不會誤標公休。
    withTiming("monthSchedule", timer, () =>
      bookingsStoreId
        ? getCachedMonthScheduleSummary(bookingsStoreId, year, month).catch((e) => {
            console.error("[bookings] getCachedMonthScheduleSummary failed", {
              ...logCtx,
              step: "monthSchedule",
              error: e instanceof Error ? e.message : String(e),
            });
            return {} as Awaited<ReturnType<typeof getCachedMonthScheduleSummary>>;
          })
        : Promise.resolve({}),
    ),
    withTiming("servicePlans", timer, () =>
      bookingsStoreId
        ? prisma.servicePlan.findMany({
            where: { storeId: bookingsStoreId, isActive: true },
            select: { id: true, name: true },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          }).catch((e) => {
            console.error("[bookings] servicePlans query failed", {
              ...logCtx,
              step: "servicePlans",
              error: e instanceof Error ? e.message : String(e),
            });
            return [] as Array<{ id: string; name: string }>;
          })
        : Promise.resolve([]),
    ),
  ]);
  timer.finish();

  return (
    <PageShell>
      <FormSuccessToast />
      <PageHeader
        title="預約管理"
        subtitle={`${year} 年 ${month} 月`}
        actions={
          isViewMode ? (
            <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
              查看模式不可新增預約
            </span>
          ) : (
            <Link
              href="/dashboard/bookings/new"
              prefetch={false}
              className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-primary-700"
            >
              ＋ 新增預約
            </Link>
          )
        }
      />
      <BookingsManager
        storeId={bookingsStoreId ?? undefined}
        year={year}
        month={month}
        monthData={monthData}
        monthSchedule={monthSchedule}
        servicePlans={servicePlans}
        readOnly={isViewMode}
        initialBookingId={deepLinkedBooking?.id ?? null}
      />
    </PageShell>
  );
}
