import { getMonthBookingSummary } from "@/server/queries/booking";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { parseLocalDate, parseTaiwanDateToDbDate, toDateInputValue, toLocalDateStr } from "@/lib/date-utils";
import { ServerTiming, withTiming } from "@/lib/perf";
import { getActiveStoreForRead } from "@/lib/store";
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
import { SpaProviderSchedule } from "./spa-provider-schedule";
import {
  assertSpaDemoStoreIdentity,
  SPA_DEMO_STORE,
} from "@/lib/spa-demo-store";
import {
  applySlotOverrides,
  loadDayBusinessHoursContext,
} from "@/lib/business-hours-resolver";
import { calculateSpaProviderStartTimes } from "@/lib/spa-availability";
import { resolveSpaScheduleService } from "@/lib/spa-dashboard-schedule";
import { isSpaOperationalSchemaReady } from "@/lib/spa-schema-readiness";
import { SPA_DEMO_CATALOG } from "@/lib/spa-demo-catalog";

/**
 * 預約管理 — 桌機版（Phase 2 desktop family）
 *
 * PageShell + PageHeader 對齊 dashboard / customers / growth / revenue / reports。
 * 主體委由 BookingsManager（client）處理月曆 + 日明細 + booking detail drawer。
 */
interface PageProps {
  searchParams: Promise<{ year?: string; month?: string; date?: string }>;
}

export default async function BookingsPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "booking.read"))) {
    redirect("/dashboard");
  }
  const params = await searchParams;

  const todayStr = toLocalDateStr();
  const [todayY, todayM] = todayStr.split("-").map(Number);
  const selectedDate = normalizeRequestedDate(params.date, todayStr);
  const [selectedY, selectedM] = selectedDate.split("-").map(Number);
  const year = params.date ? selectedY : params.year ? parseInt(params.year) : todayY;
  const month = params.date ? selectedM : params.month ? parseInt(params.month) : todayM;

  const activeStoreId = await getActiveStoreForRead(user);
  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  const bookingsStoreId = storeIdForViewContext(activeStoreId, storeViewContext);
  const isViewMode = storeViewContext?.isViewMode === true;
  const isSpaDemoStore = bookingsStoreId === SPA_DEMO_STORE.id;
  const spaSchemaReady = isSpaDemoStore ? await isSpaOperationalSchemaReady() : false;
  if (isSpaDemoStore) {
    const identity = await prisma.store.findUnique({
      where: { id: SPA_DEMO_STORE.id },
      select: { id: true, slug: true, isDemo: true },
    });
    // Fail closed: the SPA branch is allowlisted to the one isolated Demo tenant.
    assertSpaDemoStoreIdentity(identity);
  }
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
  const [monthData, monthSchedule, servicePlans, spaProviders, spaTreatments] = await Promise.all([
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
    withTiming("spaProviders", timer, () =>
      isSpaDemoStore && spaSchemaReady
        ? prisma.staff.findMany({
            where: {
              storeId: SPA_DEMO_STORE.id,
              status: "ACTIVE",
              isOwner: false,
            },
            select: {
              id: true,
              displayName: true,
              colorCode: true,
              skills: { select: { skill: { select: { id: true } } } },
              weeklyAvailabilities: { where: { dayOfWeek: parseLocalDate(selectedDate).getDay(), isActive: true }, select: { startTime: true, endTime: true } },
              availabilityExceptions: { where: { date: parseTaiwanDateToDbDate(selectedDate) }, select: { type: true, startTime: true, endTime: true } },
            },
            orderBy: { displayName: "asc" },
          })
        : isSpaDemoStore
          ? prisma.staff.findMany({
              where: { storeId: SPA_DEMO_STORE.id, status: "ACTIVE", isOwner: false },
              select: { id: true, displayName: true, colorCode: true },
              orderBy: { displayName: "asc" },
            }).then((providers) => providers.map((provider) => ({ ...provider, skills: [], weeklyAvailabilities: [], availabilityExceptions: [] })))
          : Promise.resolve([]),
    ),
    withTiming("spaTreatments", timer, () =>
      isSpaDemoStore && spaSchemaReady
        ? prisma.treatment.findMany({ where: { storeId: SPA_DEMO_STORE.id, isActive: true }, select: { serviceMinutes: true, bufferMinutes: true, skills: { select: { skill: { select: { id: true } } } } } })
        : Promise.resolve([]),
    ),
  ]);
  timer.finish();

  if (isSpaDemoStore) {
    const selectedDay = monthData.find((day) => day.date === selectedDate);
    const spaDayContext = await loadDayBusinessHoursContext(
      SPA_DEMO_STORE.id,
      selectedDate,
    );
    const bookableStartTimes = applySlotOverrides(
      spaDayContext.rule,
      spaDayContext.slotOverrides,
    )
      .filter((slot) => slot.isEnabled)
      .map((slot) => slot.startTime);
    const occupiedBookings = spaSchemaReady
      ? await prisma.booking.findMany({
          where: { storeId: SPA_DEMO_STORE.id, bookingDate: parseTaiwanDateToDbDate(selectedDate), bookingStatus: { in: ["PENDING", "CONFIRMED"] }, serviceStaffId: { not: null } },
          select: { id: true, slotTime: true, serviceStaffId: true, treatmentServiceMinutesSnapshot: true, treatmentBufferMinutesSnapshot: true, servicePlan: { select: { name: true } } },
        })
      : await prisma.booking.findMany({
          where: { storeId: SPA_DEMO_STORE.id, bookingDate: parseTaiwanDateToDbDate(selectedDate), bookingStatus: { in: ["PENDING", "CONFIRMED"] }, serviceStaffId: { not: null } },
          select: { id: true, slotTime: true, serviceStaffId: true, servicePlan: { select: { name: true } } },
        }).then((bookings) => bookings.map((booking) => ({ ...booking, treatmentServiceMinutesSnapshot: null, treatmentBufferMinutesSnapshot: null })));
    const availabilityTreatments = spaTreatments.length ? spaTreatments.map((treatment) => ({
      serviceMinutes: treatment.serviceMinutes,
      bufferMinutes: treatment.bufferMinutes,
      skillKeys: treatment.skills.map(({ skill }) => skill.id.replace("spa-demo-skill-", "")),
    })) : [
      { serviceMinutes: 60, bufferMinutes: 15, skillKeys: ["body"] },
      { serviceMinutes: 30, bufferMinutes: 10, skillKeys: ["head"] },
      { serviceMinutes: 30, bufferMinutes: 10, skillKeys: ["foot"] },
      { serviceMinutes: 60, bufferMinutes: 15, skillKeys: ["face"] },
    ];
    const providerBookableStartTimes = Object.fromEntries(spaProviders.map((provider) => {
      const providerSkills = provider.skills.length ? provider.skills.map(({ skill }) => skill.id.replace("spa-demo-skill-", "")) : ["body", "head", "foot", "face"];
      const occupiedRanges = occupiedBookings.filter((booking) => booking.serviceStaffId === provider.id).map((booking) => ({
        startTime: booking.slotTime,
        durationMinutes: (booking.treatmentServiceMinutesSnapshot ?? resolveSpaScheduleService({ bookingId: booking.id, servicePlanName: booking.servicePlan?.name }).durationMinutes) + (booking.treatmentBufferMinutesSnapshot ?? 0),
      }));
      const union = new Set<string>();
      for (const treatment of availabilityTreatments) {
        for (const time of calculateSpaProviderStartTimes({
          candidateStartTimes: bookableStartTimes,
          businessCloseTime: spaDayContext.rule.closeTime ?? "21:00",
          serviceMinutes: treatment.serviceMinutes,
          bufferMinutes: treatment.bufferMinutes,
          requiredSkillKeys: treatment.skillKeys,
          providerSkillKeys: providerSkills,
          weeklyRanges: provider.weeklyAvailabilities.length ? provider.weeklyAvailabilities : [{ startTime: "10:00", endTime: "21:00" }],
          exceptions: provider.availabilityExceptions,
          occupiedRanges,
        })) union.add(time);
      }
      return [provider.id, [...union].sort()];
    }));
    return (
      <PageShell className="flex h-[calc(100dvh-64px)] w-full max-w-none flex-col gap-3 px-4 py-3">
        <FormSuccessToast />
        <SpaProviderSchedule
          key={`${selectedDate}-${selectedDay?.bookings.map((booking) => `${booking.id}:${booking.bookingStatus}`).join("|") ?? "empty"}`}
          date={selectedDate}
          providers={spaProviders.map((provider) => ({
            ...provider,
            colorCode: provider.colorCode ?? "#8fa89b",
            shiftLabel: provider.weeklyAvailabilities.length
              ? provider.weeklyAvailabilities.map((range) => `${range.startTime}–${range.endTime}`).join("、")
              : "今日休假",
            nextAvailableTime: providerBookableStartTimes[provider.id]?.[0] ?? null,
          }))}
          bookableStartTimes={bookableStartTimes}
          providerBookableStartTimes={providerBookableStartTimes}
          timeUnitMinutes={spaDayContext.rule.slotInterval === 15 ? 15 : 30}
          treatments={SPA_DEMO_CATALOG.map((item) => ({ ...item }))}
          initialBookings={selectedDay?.bookings ?? []}
          readOnly={isViewMode}
        />
      </PageShell>
    );
  }

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
        year={year}
        month={month}
        monthData={monthData}
        monthSchedule={monthSchedule}
        servicePlans={servicePlans}
        readOnly={isViewMode}
      />
    </PageShell>
  );
}

function normalizeRequestedDate(value: string | undefined, fallback: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = parseLocalDate(value);
  return toDateInputValue(parsed) === value ? value : fallback;
}
