import { CourseTodayList } from "./today-list";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { coursePrisma } from "@/lib/course-db";
import { prisma } from "@/lib/db";
import { todayRange } from "@/lib/date-utils";
import { DashboardLink as Link } from "@/components/dashboard-link";

export async function CourseTodaySummary() {
  const user = await getCurrentUser();
  if (
    !user ||
    !(await checkPermission(user.role, user.staffId, "booking.read"))
  )
    return null;
  const storeId = await getActiveStoreForRead(user);
  if (!storeId || (await getStoreIndustryModule(storeId)) !== "course")
    return null;
  const { start, end, dateStr } = todayRange();
  const sessions = await coursePrisma.courseSession.findMany({
    where: { storeId, cancelledAt: null, startsAt: { gte: start, lte: end } },
    select: {
      id: true,
      nameSnapshot: true,
      startsAt: true,
      endsAt: true,
      coachId: true,
      capacity: true,
      room: { select: { name: true } },
      bookings: { select: { status: true, customerId: true } },
    },
    orderBy: { startsAt: "asc" },
  });
  const coaches = await prisma.staff.findMany({
    where: {
      storeId,
      id: { in: [...new Set(sessions.map((s) => s.coachId))] },
    },
    select: { id: true, displayName: true },
  });
  const [canCreate, canEdit] = await Promise.all([
    checkPermission(user.role, user.staffId, "booking.create"),
    checkPermission(user.role, user.staffId, "booking.update"),
  ]);
  const coachNames = new Map(coaches.map((c) => [c.id, c.displayName]));
  return (
    <section
      className="mb-5 overflow-hidden rounded-xl border border-earth-200 bg-white"
      aria-labelledby="course-today-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-earth-100 px-4 py-3">
        <h2 id="course-today-title" className="font-semibold text-earth-900">
          今日課程{" "}
          <span className="ml-2 text-sm font-normal text-earth-500">
            {dateStr} · {sessions.length} 堂
          </span>
        </h2>
        <Link
          href={`/dashboard/courses?date=${dateStr}`}
          className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-primary-700 hover:bg-primary-50"
        >
          查看今日課表 →
        </Link>
      </div>
      <CourseTodayList
        canCreate={canCreate}
        canEdit={canEdit}
        sessions={sessions.map((s) => ({
          id: s.id,
          nameSnapshot: s.nameSnapshot,
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
          capacity: s.capacity,
          coach: coachNames.get(s.coachId) ?? "—",
          room: s.room.name,
          customerIds: s.bookings.filter((b) => b.status !== "CANCELLED").map((b) => b.customerId),
          booked: s.bookings.filter((b) => b.status !== "CANCELLED").length,
          unmarked: s.bookings.filter((b) => b.status === "RESERVED").length,
        }))}
      />
      <nav className="flex flex-wrap gap-2 border-t p-3">
        <Link
          href={`/dashboard/courses?date=${dateStr}`}
          className="min-h-11 rounded-lg border px-3 py-2"
        >
          新增預約／排課
        </Link>
        <Link
          href="/dashboard/courses?view=customers"
          className="min-h-11 rounded-lg border px-3 py-2"
        >
          新增顧客
        </Link>
      </nav>
    </section>
  );
}
