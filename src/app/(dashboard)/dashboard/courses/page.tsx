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
  monthRange,
  parseTaipeiDateTime,
  toLocalDateStr,
  toLocalMonthStr,
} from "@/lib/date-utils";
import { CourseSharedHub } from "./shared-hub";
import { CourseWorkspace } from "./workspace";

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string; month?: string; preset?: string; startDate?: string; endDate?: string }>;
}) {
  const query = await searchParams;
  if (query.view === "analytics") return <CourseAnalyticsPage params={query}/>;
  if (query.view === "customers" || query.view === "plans")
    return <CourseMemberPage view={query.view} />;
  if (
    query.view === "settings" ||
    query.view === "operations"
  )
    return <CourseSharedHub view={query.view} />;
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
  const bounds = monthRange(
    toLocalMonthStr(parseTaipeiDateTime(selected, "12:00")!),
  );
  const [rooms, templates, sessions, coaches, canCreate, canEdit] =
    await Promise.all([
      coursePrisma.courseRoom.findMany({
        where: { storeId },
        select: {
          id: true,
          name: true,
          category: true,
          isActive: true,
          capacity: true,
          details: true,
          sessions: {
            where: { cancelledAt: null, endsAt: { gte: new Date() } },
            select: { nameSnapshot: true, startsAt: true },
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
          startsAt: { gte: bounds.start, lte: bounds.end },
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
          bookings: { where: { status: { not: "CANCELLED" } }, select: { customerId: true } },
        },
        orderBy: { startsAt: "asc" },
      }),
      prisma.staff.findMany({
        where: { storeId },
        select: { id: true, displayName: true, status: true },
        orderBy: { displayName: "asc" },
      }),
      checkPermission(user.role, user.staffId, "booking.create"),
      checkPermission(user.role, user.staffId, "booking.update"),
    ]);
  const writable =
    canCreate && (user.role === "ADMIN" || user.storeId === storeId);
  return (
    <PageShell className="course-workspace mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6">
      <PageHeader
        title={
          view === "catalog"
            ? "課程設定"
            : view === "rooms"
              ? "教室管理"
              : "課表排程"
        }
        subtitle={
          view === "schedule"
            ? "選擇日期查看、安排或複製課程"
            : view === "catalog"
              ? "管理課程名稱、人數與排課預設"
              : "管理上課教室"
        }
      />
      <CourseWorkspace
        key={`${storeId}:${view}`}
        view={view}
        selectedDate={selected}
        today={toLocalDateStr()}
        rooms={rooms.map(({ sessions: uses, ...room }) => ({
          ...room,
          uses: uses.map((u) => ({ ...u, startsAt: u.startsAt.toISOString() })),
        }))}
        templates={templates}
        coaches={coaches}
        canCreate={writable}
        canEdit={canEdit && (user.role === "ADMIN" || user.storeId === storeId)}
        sessions={sessions.map((s) => ({
          ...s,
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
        }))}
      />
    </PageShell>
  );
}
