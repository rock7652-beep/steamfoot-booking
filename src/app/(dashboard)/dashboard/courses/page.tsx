import { CourseAnalyticsPage } from "./analytics-page";
import { CourseMemberPage } from "./member-page";
import { redirect } from "next/navigation";
import { PageShell, PageHeader } from "@/components/desktop";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { coursePrisma } from "@/lib/course-db";
import { prisma } from "@/lib/db";
import {
  addTaiwanDuration,
  dayRange,
  parseTaipeiDateTime,
  toLocalDateStr,
} from "@/lib/date-utils";
import { CourseSharedHub } from "./shared-hub";
import { CourseWorkspace } from "./workspace";
import { resolvedCourseHours } from "@/lib/course-business-hours";
import { CashbookShortcut } from "../cashbook/_components/cashbook-shortcut";
import { resolveStoreViewContextFromCookie } from "@/lib/store-view-context-server";
import { resolveCourseBusinessProfile } from "@/lib/store-business-profile";

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined; date?: string; view?: string; month?: string; preset?: string; startDate?: string; endDate?: string }>;
}) {
  const query = await searchParams;
  if (query.view === "analytics") return <CourseAnalyticsPage params={query}/>;
  if (query.view === "customers" || query.view === "plans")
    return <CourseMemberPage view={query.view} query={query} />;
  if (
    query.view === "settings" ||
    query.view === "operations"
  )
    return <CourseSharedHub view={query.view} panel={query.panel} panelQuery={query.panelQuery} />;
  const user = await getCurrentUser();
  if (
    !user ||
    !(await checkPermission(user.role, user.staffId, "booking.read"))
  )
    redirect("/dashboard");
  const storeId = await getActiveStoreForRead(user);
  if (!storeId || (await getStoreIndustryModule(storeId)) !== "course")
    redirect("/dashboard");
  const view =
    query.view === "catalog" || query.view === "rooms"
      ? query.view
      : "schedule";
  const requested = query.date;
  const selected =
    requested && parseTaipeiDateTime(requested, "00:00")
      ? requested
      : toLocalDateStr();
  const firstOfMonth = `${selected.slice(0, 7)}-01`;
  const scheduleStart = dayRange(addTaiwanDuration(firstOfMonth, -6, "DAY")).start;
  const scheduleEnd = dayRange(
    addTaiwanDuration(addTaiwanDuration(firstOfMonth, 1, "MONTH"), 6, "DAY"),
  ).end;
  const cancelledBookings = await coursePrisma.courseBooking.findMany({
    where: { storeId, status: "CANCELLED", session: { cancelledAt: null, startsAt: { gte: scheduleStart, lte: scheduleEnd } } },
    select: { id: true, customerName: true, sessionId: true, absenceKind: true },
    orderBy: { updatedAt: "desc" },
  });
  const [
    rooms,
    templates,
    sessions,
    coaches,
    canCreate,
    canEdit,
    businessHours,
    specialDays,
    businessEntitlements,
    staffAvailability,
    staffAvailabilityExceptions,
  ] = await Promise.all([
      coursePrisma.courseRoom.findMany({
        where: { storeId },
        select: {
          id: true,
          name: true,
          category: true,
          isActive: true,
          capacity: true,
          details: true,
          equipment:true,location:true,
          sessions: {
            where: { cancelledAt: null, endsAt: { gt: new Date() } },
            select: { id:true,nameSnapshot: true, startsAt: true },
            orderBy: { startsAt: "asc" },
            take: 20,
          },
        },
        orderBy: { name: "asc" },
      }),
      coursePrisma.courseTemplate.findMany({
        where: { storeId },
        select: {
          id: true,
          name: true,
          category: true,
          isActive: true,
          visibility:true,classType:true,
          durationMinutes: true,
          capacity: true,
          pointCost: true,
          defaultRoomId: true,
          description: true,
          precautions: true,
        },
        orderBy: { name: "asc" },
      }),
      coursePrisma.courseSession.findMany({
        where: {
          storeId,
          cancelledAt: null,
          OR: [
            { startsAt: { gte: scheduleStart, lte: scheduleEnd } },
            { rescheduledFromStartsAt: { gte: scheduleStart, lte: scheduleEnd } },
          ],
        },
        select: {
          id: true,
          nameSnapshot: true,
          templateId: true,
          startsAt: true,
          endsAt: true,
          coachId: true,
          roomId: true,
          capacity: true,
          pointCost: true,
          requestKey: true,
          rescheduledFromStartsAt: true,
          rescheduledFromEndsAt: true,
          rescheduledFromRoomId: true,
          rescheduledFromCoachId: true,
          rescheduleKind: true,
          rescheduledAt: true,
          bookings: {
            where: { status: { not: "CANCELLED" } },
            select: {
              customerId: true,
              customerName: true,
              status: true,
              bookingKind: true,
            },
          },
        },
        orderBy: { startsAt: "asc" },
      }),
      prisma.staff.findMany({
        where: { storeId },
        select: { id: true, displayName: true, phone: true, status: true,courseCoachEnabled:true,courseQualificationsConfirmed:true,courseQualifiedTemplateIds:true },
        orderBy: { displayName: "asc" },
      }),
      checkPermission(user.role, user.staffId, "booking.create"),
      checkPermission(user.role, user.staffId, "booking.update"),
      prisma.businessHours.findMany({ where: { storeId } }),
      prisma.specialBusinessDay.findMany({ where: { storeId } }),
      prisma.storeFeatureEntitlement.findMany({
        where: { storeId, featureKey: { startsWith: "business." }, status: "ENABLED" },
        select: { featureKey: true },
      }),
      prisma.$queryRaw<{staffId:string;dayOfWeek:number;segments:unknown}[]>`
        SELECT "staffId","dayOfWeek",segments FROM "CourseStaffAvailability" WHERE "storeId"=${storeId}`,
      prisma.$queryRaw<{staffId:string;date:Date;type:string;segments:unknown;reason:string|null}[]>`
        SELECT "staffId",date,type,segments,reason FROM "CourseStaffAvailabilityException"
        WHERE "storeId"=${storeId} AND date>=${scheduleStart}::date AND date<=${scheduleEnd}::date`,
    ]);
  const [calendarYear, calendarMonth] = selected
    .slice(0, 7)
    .split("-")
    .map(Number);
  const calendarDays = Object.fromEntries(
    Array.from(
      { length: new Date(Date.UTC(calendarYear, calendarMonth, 0)).getUTCDate() },
      (_, index) => {
        const date = `${calendarYear}-${String(calendarMonth).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`;
        const resolved = resolvedCourseHours(
          date,
          businessHours as Parameters<typeof resolvedCourseHours>[1],
          specialDays as Parameters<typeof resolvedCourseHours>[2],
        );
        return [
          date,
          {
            status: resolved.status,
            reason: resolved.reason,
            periods: resolved.periods.map((period) => ({ openTime: period.openTime, closeTime: period.closeTime })),
          },
        ];
      },
    ),
  );
  const businessProfile = resolveCourseBusinessProfile(businessEntitlements.map((item) => item.featureKey));
  const recurringKeys = businessProfile === "MUSIC" && sessions.length
    ? new Set((await coursePrisma.courseSession.groupBy({
        by: ["requestKey"],
        where: { storeId, cancelledAt: null, requestKey: { in: [...new Set(sessions.map((session) => session.requestKey))] } },
        _count: { id: true },
        having: { id: { _count: { gt: 1 } } },
      })).map((row) => row.requestKey))
    : new Set<string>();
  const biweeklyKeys = new Set<string>();
  if (recurringKeys.size) {
    const recurringDates = await coursePrisma.courseSession.findMany({
      where: { storeId, cancelledAt: null, requestKey: { in: [...recurringKeys] } },
      select: { requestKey: true, startsAt: true },
      orderBy: { startsAt: "asc" },
    });
    const datesByKey = new Map<string, number[]>();
    for (const row of recurringDates) {
      const dates = datesByKey.get(row.requestKey) ?? [];
      dates.push(row.startsAt.getTime());
      datesByKey.set(row.requestKey, dates);
    }
    for (const [key, dates] of datesByKey) {
      if (dates.length >= 2 && dates.every((date, index) =>
        index === 0 || Math.round((date - dates[index - 1]) / 86400000) === 14,
      )) biweeklyKeys.add(key);
    }
  }
  if (businessProfile === "MUSIC" && businessHours.length > 0 && businessHours.every((row) => row.segments == null)) {
    redirect("/dashboard/courses/hours?tab=weekly&setup=1");
  }
  const writable =
    canCreate && (user.role === "ADMIN" || user.storeId === storeId);
  const viewContext = await resolveStoreViewContextFromCookie(user);
  return (
    <PageShell
      className={
        view === "schedule"
          ? "course-workspace mx-auto flex max-w-[1600px] flex-col gap-2 px-4 py-3"
          : "course-workspace mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6"
      }
    >
      {view !== "schedule" && (
        <PageHeader
          title={view === "catalog" ? "課程管理" : "教室管理"}
          subtitle={
            view === "catalog"
              ? "管理課程名稱、人數與排課預設"
              : "管理上課教室"
          }
        />
      )}
      <CourseWorkspace canDelete={user.role==="OWNER"}
        key={`${storeId}:${view}`}
        view={view}
        selectedDate={selected}
        today={toLocalDateStr()}
        nowIso={new Date().toISOString()}
        calendarDays={calendarDays}
        rooms={rooms.map(({ sessions: uses, ...room }) => ({
          ...room,
          uses: uses.map((u) => ({ ...u, startsAt: u.startsAt.toISOString() })),
        }))}
        templates={templates}
        coaches={coaches}
        canCreate={writable}
        canEdit={canEdit && (user.role === "ADMIN" || user.storeId === storeId)}
        cashbookShortcut={<CashbookShortcut readOnly={!!viewContext?.isViewMode} />}
        businessProfile={businessProfile}
        staffAvailability={staffAvailability}
        staffAvailabilityExceptions={staffAvailabilityExceptions.map((item)=>({...item,date:item.date.toISOString().slice(0,10)}))}
        sessions={sessions.map((s) => ({
          ...s,
          isFixed: recurringKeys.has(s.requestKey),
          isBiweekly: biweeklyKeys.has(s.requestKey),
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
          rescheduledFromStartsAt: s.rescheduledFromStartsAt?.toISOString() ?? null,
          rescheduledFromEndsAt: s.rescheduledFromEndsAt?.toISOString() ?? null,
          rescheduledAt: s.rescheduledAt?.toISOString() ?? null,
        }))}
        cancelledBookings={cancelledBookings}
      />
    </PageShell>
  );
}
