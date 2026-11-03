import { courseDisplayName } from "@/lib/course-template-presentation";
import "server-only";
import { coursePrisma } from "@/lib/course-db";
import {courseSessionAdjustmentRecords} from '@/server/services/course-session-adjustment-records';
import {activeSessionAdjustments} from '@/lib/plan-session-adjustment';
import {dayRange} from '@/lib/date-utils';

// History belongs to the authorized member's cards, across all calendar months.
export async function getCoursePlanHistory(storeId: string, customerId: string, cardIds: string[], now: Date) {
  if (!cardIds.length) return [];
  const where = { storeId, session: { startsAt: { lte: now } } };
  const cards = await coursePrisma.coursePointCard.findMany({
    where: { storeId, id: { in: cardIds }, members: { some: { customerId } } },
    select: {
      id: true, createdAt: true,
      _count: { select: { bookings: { where } } },
      bookings: {
        where,
        orderBy: [{ session: { startsAt: "desc" } }, { id: "asc" }],
        take: 100,
        select: {
          id: true, customerId: true, customerName: true, status: true, absenceKind: true, pointCost: true,
          session: { select: { startsAt: true, nameSnapshot: true } },
        },
      },
    },
  });
  const manual=activeSessionAdjustments(await courseSessionAdjustmentRecords(coursePrisma,storeId,cards.map(c=>c.id))).filter(r=>r.customerId===customerId&&r.operation==='BACKFILL');
  return cards.map(card => ({
    cardId: card.id,
    createdAt: card.createdAt.toISOString(),
    count: card._count.bookings+manual.filter(r=>r.cardId===card.id).length,
    lessons: [...card.bookings.map(booking => ({
      id: booking.id,
      name: courseDisplayName(booking.session.nameSnapshot),
      startsAt: booking.session.startsAt.toISOString(),
      customerName: booking.customerName,
      customerId: booking.customerId,
      status: booking.absenceKind === "GROUP_LEAVE_FORFEITED" || booking.absenceKind === "STUDENT_LEAVE" ? "請假"
        : booking.absenceKind === "TEACHER_ABSENT" ? "教師未授課"
        : ({ ATTENDED: "已出席", NO_SHOW: "未到", CANCELLED: "已取消", RESERVED: "待確認出席" }[booking.status] ?? "待確認"),
      // Matches the existing attendance/leave rules; no new debit is performed.
      used: booking.status === "ATTENDED" || booking.status === "NO_SHOW" || booking.absenceKind === "GROUP_LEAVE_FORFEITED" ? booking.pointCost : 0,
    })),...manual.filter(r=>r.cardId===card.id).map(r=>({id:r.id,name:'補登已上課',startsAt:dayRange(r.occurredOn!).start.toISOString(),customerName:r.customerName,customerId:r.customerId,status:'已出席（補登）',used:r.quantity}))].sort((a,b)=>b.startsAt.localeCompare(a.startsAt)).slice(0,100),
  }));
}
