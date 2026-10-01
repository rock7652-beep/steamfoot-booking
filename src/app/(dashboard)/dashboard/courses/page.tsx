import { CustomerLabelsSeed } from "@/components/customer-labels";
import { customerLabelSnapshot } from "@/server/services/customer-label-snapshot";
import { EMPTY_LABELS } from "@/lib/customer-labels";
import {readCourseOrders} from "@/server/services/course-display-order";
import {orderCourseRows} from "@/lib/course-display-order";
import { MusicSubjectCatalog } from "./music-subject-catalog";
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
import { MusicTypesShowcase } from "./showcase/music-types-showcase";
import { LubyRealDayShowcase } from "./showcase/luby-real-day-showcase";
import { resolvedCourseHours } from "@/lib/course-business-hours";
import { CashbookShortcut } from "../cashbook/_components/cashbook-shortcut";
import { resolveStoreViewContextFromCookie } from "@/lib/store-view-context-server";
import { resolveCourseBusinessProfile } from "@/lib/store-business-profile";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";

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
  if (query.showcase === "music-types" && process.env.VERCEL_ENV === "preview") {
    const date = query.date && parseTaipeiDateTime(query.date, "00:00")
      ? query.date
      : "2026-09-26";
    const activeStore = await prisma.store.findUnique({ where: { id: storeId }, select: { slug: true } });
    return (
      <PageShell className="course-workspace flex w-full min-w-0 max-w-none flex-col gap-2 px-3 py-2">
        <MusicTypesShowcase date={date} showLubyReplica={activeStore?.slug === "lubymusic"} />
      </PageShell>
    );
  }
  if (query.showcase === "luby-day" && process.env.VERCEL_ENV === "preview") {
    const activeStore = await prisma.store.findUnique({ where: { id: storeId }, select: { slug: true } });
    if (activeStore?.slug !== "lubymusic") redirect("/dashboard/courses");
    return (
      <PageShell className="course-workspace flex w-full min-w-0 max-w-none flex-col gap-2 px-3 py-2">
        <LubyRealDayShowcase date="2026-09-26" mode={query.scheduleView === "week" ? "week" : "day"} />
      </PageShell>
    );
  }
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
  const rentals = await coursePrisma.courseRental.findMany({where:{storeId,startsAt:{lte:scheduleEnd},endsAt:{gte:scheduleStart}},orderBy:{startsAt:"asc"}});
  const rentalPermissionCodes=["customer.read","customer.create","cashbook.create","cashbook.create","transaction.void"] as const;
  const rentalChecks=await Promise.all(rentalPermissionCodes.map(p=>checkPermission(user.role,user.staffId,p)));
  const rentalPermissions={customerRead:rentalChecks[0],customerCreate:rentalChecks[1],collect:rentalChecks[2],correct:rentalChecks[3]&&rentalChecks[4],edit:false};
  const cancelledBookings = await coursePrisma.courseBooking.findMany({
    where: { storeId, status: "CANCELLED", session: { cancelledAt: null, startsAt: { gte: scheduleStart, lte: scheduleEnd } } },
    select: { id: true, customerName: true, sessionId: true, absenceKind: true, notes: true },
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
          equipment:true,location:true,rentalEnabled:true,rentalHourlyRate:true,rentalBufferMinutes:true,
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
          visibility:true,classType:true,musicSubjectId:true,musicSubject:{select:{id:true,name:true,isActive:true}},
          musicPricePerLesson:true,musicTermLessons:true,musicValidityDaysPerTerm:true,
          musicScheduleMode:true,musicTrialMode:true,musicTeacherFeeBase:true,
          _count:{select:{sessions:true}},
          durationMinutes: true,
          capacity: true,
          pointCost: true,
          waitlistEnabled: true,
          waitlistLimit: true,
          waitlistStopMinutes: true,
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
          isTrial: true,
          nameSnapshot: true,
          templateId: true,
          startsAt: true,
          endsAt: true,
          coachId: true,
          roomId: true,
          capacity: true,
          pointCost: true,
          requestKey: true,
          teacherAttendance: true,
          rescheduledFromStartsAt: true,
          rescheduledFromEndsAt: true,
          rescheduledFromRoomId: true,
          rescheduledFromCoachId: true,
          rescheduleKind: true,
          rescheduledAt: true,
          releasedAt: true,
          bookings: {
            where: { OR: [{ status: { not: "CANCELLED" } }, { absenceKind: { in: ["STUDENT_LEAVE", "GROUP_LEAVE_FORFEITED", "TEACHER_ABSENT"] } }] },
            select: {
              id: true,
              customerId: true,
              customerName: true,
              status: true,
              absenceKind: true,
              checkedInAt: true,
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
  const rosterCustomers = await prisma.customer.findMany({ where: { storeId, id: { in: [...new Set(sessions.flatMap(session => session.bookings.map(booking => booking.customerId)))] } }, select: { id: true, assignedStaffId: true } });
  const assignedByCustomer = new Map(rosterCustomers.map(customer => [customer.id, customer.assignedStaffId]));
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
  const waitlistFeatureAvailable = await hasStoreFeature(storeId, FEATURES.COURSE_WAITLIST);
  const waitlistStoreSetting = waitlistFeatureAvailable
    ? await coursePrisma.courseWaitlistSetting.findUnique({ where: { storeId }, select: { enabled: true, defaultLimit: true, autoPromoteStopMinutes: true } })
    : null;
  const waitlistEnabled = waitlistFeatureAvailable && (waitlistStoreSetting?.enabled ?? false);
  const waitlistDefaultLimit = waitlistStoreSetting?.defaultLimit ?? 5;
  const waitlistDefaultStopMinutes = waitlistStoreSetting?.autoPromoteStopMinutes ?? 240;
  const displayOrders=await readCourseOrders(storeId);
  rooms.splice(0,rooms.length,...orderCourseRows(rooms,displayOrders.room?.ids??[]));
  coaches.splice(0,coaches.length,...orderCourseRows(coaches,displayOrders.staff?.ids??[]));
  const subjectRanks=new Map((displayOrders.subject?.ids??[]).map((id,i)=>[id,i]));
  templates.sort((a,b)=>(subjectRanks.get(a.musicSubjectId??"")??999999)-(subjectRanks.get(b.musicSubjectId??"")??999999));
  if(view === "catalog" && businessProfile === "MUSIC") {
    const subjects=await coursePrisma.musicSubject.findMany({where:{storeId},orderBy:[{isActive:"desc"},{category:"asc"},{name:"asc"}]});
    const writable=user.role==="ADMIN"||user.storeId===storeId;
    return <PageShell className="course-workspace flex w-full flex-col gap-1 px-6 py-1"><PageHeader title="課程管理"/><MusicSubjectCatalog key={storeId} displayOrder={displayOrders.subject} subjects={subjects.map(s=>({...s,updatedAt:s.updatedAt.toISOString()}))} canCreate={canCreate&&writable} canEdit={canEdit&&writable}/></PageShell>;
  }
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
  const showLubyReplica = view === "schedule" && businessProfile === "MUSIC" && process.env.VERCEL_ENV === "preview"
    && (await prisma.store.findUnique({ where: { id: storeId }, select: { slug: true } }))?.slug === "lubymusic";
  const labelSnapshot = await checkPermission(user.role,user.staffId,"customer.read") ? await customerLabelSnapshot(rosterCustomers.map(c=>c.id)) : EMPTY_LABELS;
  return (
    <CustomerLabelsSeed initial={labelSnapshot}>
    <PageShell
      className={
        view === "schedule"
          ? businessProfile === "MUSIC"
            ? "course-workspace flex w-full min-w-0 max-w-none flex-col gap-2 px-3 py-2"
            : "course-workspace mx-auto flex max-w-[1600px] flex-col gap-2 px-4 py-3"
          : "course-workspace mx-auto flex max-w-[1440px] flex-col gap-1 px-6 py-1"
      }
    >
      {view === "schedule" && businessProfile === "MUSIC" && process.env.VERCEL_ENV === "preview" && (
        <details className="text-xs text-earth-600"><summary className="cursor-pointer">測試課表對照</summary><div className="flex flex-wrap gap-2">
          {showLubyReplica && (
            <a href="/dashboard/courses?showcase=luby-day&date=2026-09-26" className="rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-950">
              查看 9/26 陸比原課表對照（9/12 截圖移日）
            </a>
          )}
          <a href="/dashboard/courses?showcase=music-types&date=2026-09-26" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-earth-900">
            查看 9/26 七種班型示意（49 堂）
          </a>
        </div></details>
      )}
      {view !== "schedule" && (
        <PageHeader
          title={view === "catalog" ? "課程管理" : "空間管理"}
          subtitle={
            view === "catalog"
              ? "管理課程名稱、人數與排課預設"
              : "管理上課教室"
          }
        />
      )}
      <CourseWorkspace displayOrder={displayOrders.room} canDelete={user.role==="OWNER"&&!viewContext?.isViewMode}
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
        templates={templates.map(t=>({...t,hasSessions:t._count.sessions>0}))}
        coaches={coaches}
        canCreate={writable}
        canEdit={canEdit && (user.role === "ADMIN" || user.storeId === storeId)}
        rentalPermissions={{...rentalPermissions,collect:rentalPermissions.collect&&writable,correct:rentalPermissions.correct&&writable,customerCreate:rentalPermissions.customerCreate&&writable,edit:canEdit && (user.role === "ADMIN" || user.storeId === storeId) && !viewContext?.isViewMode}}
        cashbookShortcut={<CashbookShortcut readOnly={!!viewContext?.isViewMode} />}
        businessProfile={businessProfile}
        staffAvailability={staffAvailability}
        staffAvailabilityExceptions={staffAvailabilityExceptions.map((item)=>({...item,date:item.date.toISOString().slice(0,10)}))}
        waitlistEnabled={waitlistEnabled}
        waitlistDefaultLimit={waitlistDefaultLimit}
        waitlistDefaultStopMinutes={waitlistDefaultStopMinutes}
        sessions={[...sessions.map((s) => ({
          ...s,
          isFixed: recurringKeys.has(s.requestKey) || templates.find((template) => template.id === s.templateId)?.musicScheduleMode === "FIXED",
          isBiweekly: biweeklyKeys.has(s.requestKey),
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
          bookings: s.bookings.map((booking) => ({
            ...booking,
            assignedCoachId: assignedByCustomer.get(booking.customerId) ?? null,
            checkedInAt: booking.checkedInAt?.toISOString() ?? null,
          })),
          rescheduledFromStartsAt: s.rescheduledFromStartsAt?.toISOString() ?? null,
          rescheduledFromEndsAt: s.rescheduledFromEndsAt?.toISOString() ?? null,
          rescheduledAt: s.rescheduledAt?.toISOString() ?? null,
          previewFaded: s.releasedAt ? "異動／請假" as const : undefined,
          previewStudentNames: s.releasedAt ? cancelledBookings.filter((booking) => booking.sessionId === s.id && ["STUDENT_LEAVE", "GROUP_LEAVE_FORFEITED"].includes(booking.absenceKind ?? "")).map((booking) => booking.customerName) : undefined,
        })),...rentals.map(r=>({id:`rental:${r.id}`,rentalId:r.id,rentalCancelled:!!r.cancelledAt,templateId:"",nameSnapshot:r.customerName,startsAt:r.startsAt.toISOString(),endsAt:r.endsAt.toISOString(),coachId:"",roomId:r.roomId,capacity:0,pointCost:0,bookings:[],previewKind:"RENTAL" as const}))]}
        cancelledBookings={cancelledBookings}
      />
    </PageShell>
    </CustomerLabelsSeed>
  );
}
