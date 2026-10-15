import "server-only";
import { coursePrisma } from "@/lib/course-db";
import { prisma } from "@/lib/db";
import { dayRange } from "@/lib/date-utils";

/** Called only by the permission-gated music home; no roster/contact data leaves this projection. */
export async function getMusicHomeSchedule(storeId: string, date: string, now = new Date()) {
  const range = dayRange(date);
  const sessions = await coursePrisma.courseSession.findMany({
    where: { storeId, startsAt: { gte: range.start, lte: range.end }, cancelledAt: null, releasedAt: null },
    select: { id: true, nameSnapshot: true, coachId: true, startsAt: true, endsAt: true, teacherAttendance: true, room: { select: { name: true } },
      bookings: { where: { storeId, status: { not: "CANCELLED" } }, select: { status: true } } },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }], take: 201,
  });
  const teachers = await prisma.staff.findMany({ where: { storeId, id: { in: [...new Set(sessions.map(s=>s.coachId))] } }, select: { id: true, displayName: true } });
  const names = new Map(teachers.map(t=>[t.id,t.displayName]));
  return { truncated: sessions.length > 200, rows: sessions.slice(0,200).map(s=>({
    id:s.id, name:s.nameSnapshot, teacher:names.get(s.coachId) ?? "教師待核對", room:s.room.name,
    startsAt:s.startsAt.toISOString(), endsAt:s.endsAt.toISOString(), people:s.bookings.length,
    pending:s.bookings.filter(b=>b.status === "RESERVED").length,
    status: musicSessionStatus(s,now),
  })) };
}

export function musicSessionStatus(session: { startsAt: Date; endsAt: Date; teacherAttendance: string; bookings: { status: string }[] }, now: Date) {
  if (["LEAVE","NO_SHOW"].includes(session.teacherAttendance)) return "教師缺席／待處理";
  if (!session.bookings.length) return "尚無預約";
  if (session.endsAt <= now) return session.bookings.some(b=>b.status === "RESERVED") ? "課後待點名" : "點名完成";
  return session.startsAt <= now ? "上課中" : "未開始";
}
