import { prisma } from "@/lib/db";
import { courseAccount } from "@/server/services/course-access";
import { coursePrisma } from "@/lib/course-db";
import { getCourseCards } from "@/server/queries/course-members";
import { CoursePortalClient } from "./course-portal-client";
import { monthRange, toLocalMonthStr } from "@/lib/date-utils";
export async function CoursePortal({
  month: requestedMonth,
}: {
  month?: string;
}) {
  const month =
    typeof requestedMonth === "string" && /^20\d{2}-(0[1-9]|1[0-2])$/.test(requestedMonth)
      ? requestedMonth
      : toLocalMonthStr();
  const range = monthRange(month);
  const { user, storeId, customer } = await courseAccount();
  const identityLink = await prisma.staffMemberLink.findUnique({
    where: { uq_staff_member_link_user_store: { userId: user.id, storeId } },
    select: { courseMemberEnabled: true },
  });
  const memberEnabled = identityLink?.courseMemberEnabled !== false;
  const cards = memberEnabled ? await getCourseCards(storeId, customer.id) : [];
  const [sessions, bookings] = await Promise.all([
    memberEnabled
      ? coursePrisma.courseSession.findMany({
          where: {
            storeId,
            cancelledAt: null,
            startsAt: {
              gte: range.start,
              lte: range.end,
            },
          },
          include: {
            room: { select: { name: true } },
            _count: {
              select: { bookings: { where: { status: { not: "CANCELLED" } } } },
            },
          },
          orderBy: { startsAt: "asc" },
        })
      : [],
    coursePrisma.courseBooking.findMany({
      where: {
        storeId,
        cardId: { in: cards.map((c) => c.id) },
        session: { startsAt: { gte: range.start, lte: range.end } },
      },
      include: { session: { select: { nameSnapshot: true, startsAt: true } } },
      orderBy: { createdAt: "desc" },
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
          startsAt: { gte: range.start, lte: range.end },
        },
        include: {
          bookings: {
            where: { status: { not: "CANCELLED" } },
            select: {
              id: true,
              customerId: true,
              customerName: true,
              status: true,
              checkedInAt: true,
            },
          },
        },
        orderBy: { startsAt: "asc" },
      })
    : [];
  return (
    <CoursePortalClient
      month={month}
      serverNow={new Date().getTime()}
      hasWork={!!link}
      memberEnabled={memberEnabled}
      work={work.map((s) => ({
        id: s.id,
        name: s.nameSnapshot,
        startsAt: s.startsAt.toISOString(),
        bookings: s.bookings.map((b) => ({
          ...b,
          checkedInAt: b.checkedInAt?.toISOString() ?? null,
        })),
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
        sessionId: b.sessionId,
        name: b.session.nameSnapshot,
        startsAt: b.session.startsAt.toISOString(),
        customerName: b.customerName,
        operatorName: b.operatorName,
        operatorCustomerId: b.operatorCustomerId,
        customerId: b.customerId,
        status: b.status,
        checkedInAt: b.checkedInAt?.toISOString() ?? null,
        notes: b.notes,
        cost: b.pointCost,
      }))}
    />
  );
}
