import "server-only";
import { coursePrisma } from "@/lib/course-db";

// History belongs to the authorized member's cards, across all calendar months.
export async function getCoursePlanHistory(storeId: string, customerId: string, cardIds: string[], now: Date) {
  if (!cardIds.length) return [];
  const where = { storeId, session: { startsAt: { lte: now } } };
  const cards = await coursePrisma.coursePointCard.findMany({
    where: { storeId, id: { in: cardIds }, members: { some: { customerId } } },
    select: {
      id: true,
      _count: { select: { bookings: { where } } },
      bookings: {
        where,
        orderBy: [{ session: { startsAt: "desc" } }, { id: "asc" }],
        take: 100,
        select: {
          id: true, customerName: true, status: true, absenceKind: true, pointCost: true,
          session: { select: { startsAt: true, nameSnapshot: true } },
        },
      },
    },
  });
  return cards.map(card => ({
    cardId: card.id,
    count: card._count.bookings,
    lessons: card.bookings.map(booking => ({
      id: booking.id,
      name: booking.session.nameSnapshot,
      startsAt: booking.session.startsAt.toISOString(),
      customerName: booking.customerName,
      status: booking.absenceKind === "GROUP_LEAVE_FORFEITED" || booking.absenceKind === "STUDENT_LEAVE" ? "請假"
        : booking.absenceKind === "TEACHER_ABSENT" ? "教師未授課"
        : ({ ATTENDED: "已出席", NO_SHOW: "未到", CANCELLED: "已取消", RESERVED: "待確認出席" }[booking.status] ?? "待確認"),
      // Matches the existing attendance/leave rules; no new debit is performed.
      used: booking.status === "ATTENDED" || booking.status === "NO_SHOW" || booking.absenceKind === "GROUP_LEAVE_FORFEITED" ? booking.pointCost : 0,
    })),
  }));
}
