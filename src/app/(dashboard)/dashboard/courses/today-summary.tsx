import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { coursePrisma } from "@/lib/course-db";
import { prisma } from "@/lib/db";
import { todayRange, formatTWTime } from "@/lib/date-utils";
import { DashboardLink as Link } from "@/components/dashboard-link";

export async function CourseTodaySummary() {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "booking.read"))) return null;
  const storeId = await getActiveStoreForRead(user);
  if (!storeId || await getStoreIndustryModule(storeId) !== "course") return null;
  const { start, end, dateStr } = todayRange();
  const sessions = await coursePrisma.courseSession.findMany({
    where: { storeId, cancelledAt: null, startsAt: { gte: start, lte: end } },
    select: { id: true, nameSnapshot: true, startsAt: true, endsAt: true, coachId: true, capacity: true, room: { select: { name: true } } },
    orderBy: { startsAt: "asc" },
  });
  const coaches = await prisma.staff.findMany({
    where: { storeId, id: { in: [...new Set(sessions.map(s => s.coachId))] } },
    select: { id: true, displayName: true },
  });
  const coachNames = new Map(coaches.map(c => [c.id, c.displayName]));
  return <section className="mb-5 overflow-hidden rounded-xl border border-earth-200 bg-white" aria-labelledby="course-today-title">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-earth-100 px-4 py-3">
      <h2 id="course-today-title" className="font-semibold text-earth-900">今日課程 <span className="ml-2 text-sm font-normal text-earth-500">{dateStr} · {sessions.length} 堂</span></h2>
      <Link href={`/dashboard/courses?date=${dateStr}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-primary-700 hover:bg-primary-50">查看今日課表 →</Link>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-earth-50 text-earth-600"><tr>{["時間", "課程", "教練", "教室", "人數上限"].map(label => <th key={label} className="whitespace-nowrap px-4 py-3 font-medium">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-earth-100">{sessions.map(s => <tr key={s.id}>
          <td className="whitespace-nowrap px-4 py-3">{formatTWTime(s.startsAt)}–{formatTWTime(s.endsAt)}</td>
          <th scope="row" className="px-4 py-3 font-medium text-primary-900">{s.nameSnapshot}</th>
          <td className="px-4 py-3">{coachNames.get(s.coachId) ?? "—"}</td>
          <td className="px-4 py-3">{s.room.name}</td>
          <td className="px-4 py-3">{s.capacity} 人</td>
        </tr>)}</tbody>
      </table>
      {!sessions.length && <p className="px-4 py-6 text-sm text-earth-500">今天尚未安排課程。</p>}
    </div>
  </section>;
}
