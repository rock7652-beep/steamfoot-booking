import { prisma } from "@/lib/db";
import { courseMember } from "@/server/services/course-access";
import { coursePrisma } from "@/lib/course-db";
import { getCourseCards } from "@/server/queries/course-members";
import { CoursePortalClient } from "./course-portal-client";
import { monthRange, toLocalMonthStr } from "@/lib/date-utils";
export async function CoursePortal() {
  const { user, storeId, customer } = await courseMember();
  const cards = await getCourseCards(storeId, customer.id);
  const [sessions, bookings] = await Promise.all([
    coursePrisma.courseSession.findMany({
      where: {
        storeId,
        cancelledAt: null,
        startsAt: {
          gte: new Date(),
          lte: monthRange(
            toLocalMonthStr(new Date(new Date().getTime() + 90 * 86400000)),
          ).end,
        },
      },
      include: {
        room: { select: { name: true } },
        _count: {
          select: { bookings: { where: { status: { not: "CANCELLED" } } } },
        },
      },
      orderBy: { startsAt: "asc" },
    }),
    coursePrisma.courseBooking.findMany({
      where: { storeId, cardId: { in: cards.map((c) => c.id) } },
      include: { session: { select: { nameSnapshot: true, startsAt: true } } },
      orderBy: { createdAt: "desc" },
      take: 150,
    }),
  ]);
  const link = await prisma.staffMemberLink.findFirst({
    where: {
      userId: user.id,
      storeId,
      revokedAt: null,
      staff: { status: "ACTIVE" },
    },
    select: { staffId: true },
  });
  const work = link
    ? await coursePrisma.courseSession.findMany({
        where: {
          storeId,
          coachId: link.staffId,
          cancelledAt: null,
          startsAt: { gte: monthRange(toLocalMonthStr()).start },
        },
        include: {
          bookings: {
            where: { status: { not: "CANCELLED" } },
            select: { id: true, customerName: true, status: true },
          },
        },
        orderBy: { startsAt: "asc" },
        take: 100,
      })
    : [];
  return (
    <CoursePortalClient
      hasWork={!!link}
      work={work.map((s) => ({
        id: s.id,
        name: s.nameSnapshot,
        startsAt: s.startsAt.toISOString(),
        bookings: s.bookings,
      }))}
      customerId={customer.id}
      customerName={customer.name}
      cards={cards}
      sessions={sessions.map((s) => ({
        id: s.id,
        name: s.nameSnapshot,
        startsAt: s.startsAt.toISOString(),
        room: s.room.name,
        cost: s.pointCost,
        capacity: s.capacity,
        occupied: s._count.bookings,
      }))}
      bookings={bookings.map((b) => ({
        id: b.id,
        name: b.session.nameSnapshot,
        startsAt: b.session.startsAt.toISOString(),
        customerName: b.customerName,
        operatorName: b.operatorName,
        operatorCustomerId: b.operatorCustomerId,
        customerId: b.customerId,
        status: b.status,
        cost: b.pointCost,
      }))}
    />
  );
}
