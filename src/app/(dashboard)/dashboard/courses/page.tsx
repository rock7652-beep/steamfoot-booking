import { notFound, redirect } from "next/navigation";
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
import { CourseWorkspace } from "./workspace";

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await getCurrentUser();
  if (
    !user ||
    !(await checkPermission(user.role, user.staffId, "booking.read"))
  )
    redirect("/dashboard");
  const storeId = await getActiveStoreForRead(user);
  if (!storeId || (await getStoreIndustryModule(storeId)) !== "course")
    notFound();
  const requested = (await searchParams).date;
  const selected =
    requested && parseTaipeiDateTime(requested, "00:00")
      ? requested
      : toLocalDateStr();
  const bounds = monthRange(
    toLocalMonthStr(parseTaipeiDateTime(selected, "12:00")!),
  );
  const [rooms, templates, sessions, coaches, canCreate] = await Promise.all([
    coursePrisma.courseRoom.findMany({
      where: { storeId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    coursePrisma.courseTemplate.findMany({
      where: { storeId, isActive: true },
      select: {
        id: true,
        name: true,
        durationMinutes: true,
        capacity: true,
        pointCost: true,
        defaultRoomId: true,
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
        startsAt: true,
        endsAt: true,
        coachId: true,
        roomId: true,
        capacity: true,
        pointCost: true,
      },
      orderBy: { startsAt: "asc" },
    }),
    prisma.staff.findMany({
      where: { storeId, status: "ACTIVE" },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    checkPermission(user.role, user.staffId, "booking.create"),
  ]);
  const writable =
    canCreate && (user.role === "ADMIN" || user.storeId === storeId);
  return (
    <PageShell>
      <PageHeader
        title="課程管理"
        subtitle="月曆總覽 · 選擇日期查看或安排課程"
      />
      <CourseWorkspace
        key={storeId}
        selectedDate={selected}
        today={toLocalDateStr()}
        rooms={rooms}
        templates={templates}
        coaches={coaches}
        canCreate={writable}
        sessions={sessions.map((s) => ({
          ...s,
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
        }))}
      />
    </PageShell>
  );
}
