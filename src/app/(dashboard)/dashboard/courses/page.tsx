import {sportsNativePreview} from "@/lib/sports-native-preview";
import {loadSportsStaging} from "@/server/actions/sports-staging";
import { presentCourseTemplates, sportsCourseName, courseDisplayName } from "@/lib/course-template-presentation";
import { CourseRoomsPage } from "./rooms-page";
import { MUSIC_DEFAULT_DURATION_MINUTES } from "@/lib/music-teaching-item";
import { musicSessionWhere, musicDataScope } from "@/server/services/music-data-scope";
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
import { resolvedCourseHours } from "@/lib/course-business-hours";
import { CashbookShortcut } from "../cashbook/_components/cashbook-shortcut";
import { resolveStoreViewContextFromCookie } from "@/lib/store-view-context-server";
import { resolveCourseBusinessProfile } from "@/lib/store-business-profile";
import { hasStoreFeature, requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined; date?: string; view?: string; month?: string; preset?: string; startDate?: string; endDate?: string }>;
}) {
  const query = await searchParams;
  const routeUser = await getCurrentUser();
  if (!routeUser) redirect("/dashboard");
  const routeStoreId = await getActiveStoreForRead(routeUser);
  if (routeStoreId) {
    const routeFeature = query.view === "customers" ? FEATURES.CUSTOMER_MANAGEMENT
      : query.view === "plans" ? FEATURES.PLAN_MANAGEMENT
      : ["analytics", "settings", "operations"].includes(query.view ?? "") ? undefined : FEATURES.BASIC_BOOKING;
    if (routeFeature) await requireStoreFeature(routeStoreId, routeFeature);
  }
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
  // Native sports uses the existing schedule, catalog and fee interfaces.
  // View-only store contexts must never load writable forms or expand series.
  const viewContext = await resolveStoreViewContextFromCookie(user);
  const writableStore = !viewContext?.isViewMode && (user.role === "ADMIN" || user.storeId === storeId);
  if (query.showcase === "music-types" && process.env.VERCEL_ENV === "preview") {
    const date = query.date && parseTaipeiDateTime(query.date, "00:00")
      ? query.date
      : "2026-09-26";
    return (
      <PageShell className="course-workspace flex w-full min-w-0 max-w-none flex-col gap-2 px-3 py-2">
        <MusicTypesShowcase date={date} showLubyReplica={false} />
      </PageShell>
    );
  }
  if (query.showcase === "luby-day") redirect("/dashboard/courses");
  const view =
    query.view === "catalog" || query.view === "rooms"
      ? query.view
      : "schedule";
  if (view === "rooms") return <CourseRoomsPage storeId={storeId} user={user} />;
  const businessEntitlements = await prisma.storeFeatureEntitlement.findMany({
    where: { storeId, featureKey: { startsWith: "business." }, status: "ENABLED" },
    select: { featureKey: true },
  });
  const businessProfile = resolveCourseBusinessProfile(businessEntitlements.map(item => item.featureKey));
  // Catalog saves must not wait for the monthly schedule, rental or customer reads.
  const sportsNative = businessProfile === "FITNESS" && sportsNativePreview(storeId);
  if(sportsNative&&process.env.VERCEL_ENV==="production")await coursePrisma.$transaction(tx=>import("@/server/services/sports-production-readiness").then(m=>m.assertSportsProductionReady(tx,storeId)));

  if (view === "catalog" && (businessProfile === "MUSIC" || sportsNative)) {
    const [subjects, displayOrders, canCreate, canEdit] = await Promise.all([
      coursePrisma.musicSubject.findMany({
        where: { storeId },
        select: { id: true, name: true, category: true, description: true, isActive: true, updatedAt: true },
        orderBy: [{ isActive: "desc" }, { category: "asc" }, { name: "asc" }],
      }),
      readCourseOrders(storeId),
      checkPermission(user.role, user.staffId, "booking.create"),
      checkPermission(user.role, user.staffId, "booking.update"),
    ]);
    const writable = writableStore;
    const canManageSportsRules=sportsNative&&writable&&["OWNER","ADMIN"].includes(user.role)&&(await Promise.all((["staff.view","staff.manage","teacher.compensation.manage","teacher.compensation.read"] as const).map(p=>checkPermission(user.role,user.staffId,p)))).every(Boolean);
    const sportsCoaches=canManageSportsRules?await prisma.staff.findMany({where:{storeId,status:"ACTIVE",courseCoachEnabled:true},select:{id:true,displayName:true}}):undefined;
    const enrichedSubjects=canManageSportsRules?await coursePrisma.$transaction(async tx=>{const {readSportsTeachingRule}=await import("@/server/services/sports-teaching-rule");return Promise.all(subjects.map(async s=>({...s,sportsRule:await readSportsTeachingRule(tx,storeId,s.id)})));}):subjects;
    return <PageShell className="course-workspace flex w-full flex-col gap-1 px-6 py-1"><PageHeader title="教學項目"/><MusicSubjectCatalog sportsNative={sportsNative} sportsCoaches={sportsCoaches?.map(c=>({id:c.id,name:c.displayName}))} storeId={storeId} initialCreate={query.action === "create"} key={storeId} displayOrder={displayOrders.subject} subjects={enrichedSubjects.map(s=>({...s,updatedAt:s.updatedAt.toISOString()}))} canCreate={canCreate&&writable} canEdit={canEdit&&writable}/></PageShell>;
  }
  const sportsFormPromise=sportsNative ? Promise.all((["plans.edit","customer.read","wallet.read","transaction.read"] as const).map(p=>checkPermission(user.role,user.staffId,p))).then(grants=>grants.every(Boolean)&&writableStore?loadSportsStaging(true):null).then(r=>r?.success?r.data:undefined) : Promise.resolve(undefined);
  const requested = query.date;
  const selected =
    requested && parseTaipeiDateTime(requested, "00:00")
      ? requested
      : toLocalDateStr();
  const firstOfMonth = `${selected.slice(0, 7)}-01`;
  let sportsCalendarWarning:string|undefined;
  if(sportsNative&&writableStore&&await checkPermission(user.role,user.staffId,"booking.create")){
    const {ensureSportsMonth}=await import("@/server/services/sports-permanent-series");
    sportsCalendarWarning=await ensureSportsMonth({storeId,userId:user.id,name:user.name??"門市人員"},addTaiwanDuration(firstOfMonth,-6,"DAY"),addTaiwanDuration(addTaiwanDuration(firstOfMonth,1,"MONTH"),5,"DAY"));
  }

  const scheduleStart = dayRange(addTaiwanDuration(firstOfMonth, -6, "DAY")).start;
  const scheduleEnd = dayRange(
    addTaiwanDuration(addTaiwanDuration(firstOfMonth, 1, "MONTH"), 6, "DAY"),
  ).end;
  const rentals = musicDataScope(storeId,query.dataScope)==="legacy" ? [] : await coursePrisma.courseRental.findMany({where:{storeId,startsAt:{lte:scheduleEnd},endsAt:{gte:scheduleStart}},orderBy:{startsAt:"asc"}});
  const rentalPermissionCodes=["customer.read","customer.create","cashbook.create","cashbook.create","transaction.void"] as const;
  const rentalChecks=await Promise.all(rentalPermissionCodes.map(p=>checkPermission(user.role,user.staffId,p)));
  const rentalPermissions={customerRead:rentalChecks[0],customerCreate:rentalChecks[1],collect:rentalChecks[2],correct:rentalChecks[3]&&rentalChecks[4],edit:false};
  const rentalCustomers=rentalPermissions.customerRead?await prisma.customer.findMany({where:{storeId,mergedIntoCustomerId:null,NOT:{user:{is:{status:"SUSPENDED"}}}},select:{id:true,name:true,phone:true},orderBy:{name:"asc"}}):[];
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
          musicPricePerLesson:true,musicTermLessons:true,musicValidityDaysPerTerm:true,musicTeacherShare:true,
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
          ...musicSessionWhere(storeId,query.dataScope),
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
          bookingAudience: true, scheduleType:true, scheduleFrequency:true, enrollmentMode:true,
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
      prisma.$queryRaw<{staffId:string;dayOfWeek:number;segments:unknown}[]>`
        SELECT "staffId","dayOfWeek",segments FROM "CourseStaffAvailability" WHERE "storeId"=${storeId}`,
      prisma.$queryRaw<{staffId:string;date:Date;type:string;segments:unknown;reason:string|null}[]>`
        SELECT "staffId",date,type,segments,reason FROM "CourseStaffAvailabilityException"
        WHERE "storeId"=${storeId} AND date>=${scheduleStart}::date AND date<=${scheduleEnd}::date`,
    ]);
  const rosterCustomers = await prisma.customer.findMany({ where: { storeId, id: { in: [...new Set(sessions.flatMap(session => session.bookings.map(booking => booking.customerId).filter((id): id is string => !!id)))] } }, select: { id: true, assignedStaffId: true } });
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
  const sportsFixedRows=sportsNative?await coursePrisma.$queryRaw<Array<{sessionId:string;frequency:string}>>`SELECT "sessionId",frequency FROM "SportsStagingSessionRule" WHERE "storeId"=${storeId}`:[];
  if(view === "catalog" && businessProfile === "MUSIC") {
    const subjects=await coursePrisma.musicSubject.findMany({where:{storeId},orderBy:[{isActive:"desc"},{category:"asc"},{name:"asc"}]});
    const writable=user.role==="ADMIN"||user.storeId===storeId;
    return <PageShell className="course-workspace flex w-full flex-col gap-1 px-6 py-1"><PageHeader title="教學項目"/><MusicSubjectCatalog storeId={storeId} key={storeId} displayOrder={displayOrders.subject} subjects={subjects.map(s=>{const t=templates.find(t=>t.musicSubjectId===s.id);return {...s,classType:t?.classType??"PRIVATE",musicTeacherShare:Number(t?.musicTeacherShare??0.6),musicScheduleMode:t?.musicScheduleMode??"FIXED",durationMinutes:t?.durationMinutes??MUSIC_DEFAULT_DURATION_MINUTES,capacity:t?.capacity??1,visibility:t?.visibility??"PUBLIC",precautions:t?.precautions??"",updatedAt:s.updatedAt.toISOString()};})} canCreate={canCreate&&writable} canEdit={canEdit&&writable}/></PageShell>;
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
    canCreate && writableStore;
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

      {view !== "schedule" && (
        <PageHeader
          title={view === "catalog" ? "課程管理" : "空間管理"}
          subtitle={businessProfile === "MUSIC" ? (
            view === "catalog"
              ? "管理課程名稱、人數與排課預設"
              : "管理上課教室"
          ) : undefined}
        />
      )}
      <CourseWorkspace displayOrder={displayOrders.room} canDelete={user.role==="OWNER"&&writableStore}
        storeId={storeId}
        key={`${storeId}:${view}`}
        view={view}
        initialSportsCalendarWarning={sportsCalendarWarning}
        selectedDate={selected}
        today={toLocalDateStr()}
        nowIso={new Date().toISOString()}
        calendarDays={calendarDays}
        rooms={rooms.map(({ sessions: uses, ...room }) => ({
          ...room,
          uses: uses.map((u) => ({ ...u, nameSnapshot: courseDisplayName(u.nameSnapshot), startsAt: u.startsAt.toISOString() })),
        }))}
        templates={presentCourseTemplates(templates,await coursePrisma.coursePointPlan.findMany({where:{storeId,isActive:true},select:{name:true,isActive:true,templateIds:true}}),businessProfile==="MUSIC").map(t=>({...t,hasSessions:t._count.sessions>0}))}
        coaches={coaches}
        canCreate={writable}
        canEdit={canEdit && writableStore}
        rentalCustomers={rentalCustomers}
        rentalPermissions={{...rentalPermissions,collect:rentalPermissions.collect&&writable,correct:rentalPermissions.correct&&writable,customerCreate:rentalPermissions.customerCreate&&writable,edit:canEdit && writableStore}}
        cashbookShortcut={<CashbookShortcut readOnly={!writableStore} />}
        sportsNative={sportsNative}
        schedulingModes={await coursePrisma.courseBookingRule.findUnique({where:{storeId},select:{selfBookingEnabled:true,assignedSchedulingEnabled:true}})??undefined}
        sportsData={await sportsFormPromise}
        businessProfile={businessProfile}
        staffAvailability={staffAvailability}
        staffAvailabilityExceptions={staffAvailabilityExceptions.map((item)=>({...item,date:item.date.toISOString().slice(0,10)}))}
        waitlistEnabled={waitlistEnabled}
        waitlistDefaultLimit={waitlistDefaultLimit}
        waitlistDefaultStopMinutes={waitlistDefaultStopMinutes}
        sessions={[...sessions.map((s) => ({
          ...s,
          nameSnapshot: sportsCourseName(s.nameSnapshot, s.templateId),
          sportsPalette:sportsNative,
          isFixed: sportsNative ? sportsFixedRows.some(r=>r.sessionId===s.id&&r.frequency!=="SINGLE") : s.scheduleType === "FIXED" || s.scheduleType === "LEGACY" && (recurringKeys.has(s.requestKey) || templates.find((template) => template.id === s.templateId)?.musicScheduleMode === "FIXED"),
          isBiweekly: sportsNative?sportsFixedRows.some(r=>r.sessionId===s.id&&r.frequency==="BIWEEKLY"):s.scheduleFrequency === "BIWEEKLY" || s.scheduleType === "LEGACY" && biweeklyKeys.has(s.requestKey),
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
          bookings: s.bookings.map((booking) => ({
            ...booking,
            assignedCoachId: assignedByCustomer.get(booking.customerId ?? "") ?? null,
            checkedInAt: booking.checkedInAt?.toISOString() ?? null,
          })),
          rescheduledFromStartsAt: sportsNative&&!sportsFixedRows.some(r=>r.sessionId===s.id&&r.frequency!=="SINGLE")?null:s.rescheduledFromStartsAt?.toISOString() ?? null,
          rescheduledFromEndsAt: s.rescheduledFromEndsAt?.toISOString() ?? null,
          rescheduledAt: s.rescheduledAt?.toISOString() ?? null,
          previewFaded: s.releasedAt ? "異動／請假" as const : undefined,
          previewStudentNames: s.releasedAt ? cancelledBookings.filter((booking) => booking.sessionId === s.id && ["STUDENT_LEAVE", "GROUP_LEAVE_FORFEITED"].includes(booking.absenceKind ?? "")).map((booking) => booking.customerName) : undefined,
        })),...rentals.map(r=>({id:`rental:${r.id}`,rentalId:r.id,sportsPalette:sportsNative,rentalCancelled:!!r.cancelledAt,templateId:"",nameSnapshot:r.customerName,startsAt:r.startsAt.toISOString(),endsAt:r.endsAt.toISOString(),coachId:"",roomId:r.roomId,capacity:0,pointCost:0,bookings:[],previewKind:"RENTAL" as const}))]}
        cancelledBookings={cancelledBookings}
      />
    </PageShell>
    </CustomerLabelsSeed>
  );
}
