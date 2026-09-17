import "server-only";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { addTaiwanDuration, dayRange, toLocalDateStr } from "@/lib/date-utils";

/** Store-scoped course signals; never aggregate unlike cards or read Steamfoot wallets. */
export async function getCourseCustomerCare(storeId: string, now = new Date()) {
  const expiryEnd = dayRange(addTaiwanDuration(toLocalDateStr(now), 14, "DAY")).end;
  const inactiveBefore = dayRange(addTaiwanDuration(toLocalDateStr(now), -30, "DAY")).start;
  const [customers, cards, attendance] = await Promise.all([
    prisma.customer.findMany({
      where: { storeId, mergedIntoCustomerId: null, NOT: { user: { is: { status: "SUSPENDED" } } } },
      select: { id: true, name: true, phone: true, assignedStaff: { select: { displayName: true } }, followUps: { where: { storeId }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, createdBy: { select: { name: true } } } } },
      orderBy: { name: "asc" },
    }),
    coursePrisma.coursePointCard.findMany({
      where: { storeId, closedAt: null, expiresAt: { gt: now } },
      include: { plan: { select: { lowBalanceEnabled: true, lowBalanceThreshold: true } }, members: { where: { storeId } }, bookings: { where: { storeId, status: "RESERVED" }, select: { pointCost: true } } },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
    }),
    coursePrisma.$queryRaw<Array<{ customerId: string; lastVisitAt: Date }>>`
      SELECT b."customerId", MAX(s."startsAt") AS "lastVisitAt"
      FROM "CourseBooking" b JOIN "CourseSession" s ON s.id=b."sessionId" AND s."storeId"=b."storeId"
      WHERE b."storeId"=${storeId} AND b.status='ATTENDED' GROUP BY b."customerId"`,
  ]);
  const lastVisit = new Map(attendance.map(row => [row.customerId, row.lastVisitAt]));
  const byMember = new Map<string, Array<{ id: string; name: string; unit: string; remaining: number; held: number; available: number; expiresAt: Date; low: boolean; expiring: boolean }>>();
  for (const card of cards) {
    const held = card.bookings.reduce((sum, booking) => sum + booking.pointCost, 0);
    const available = Math.max(0, card.remaining - held);
    const summary = { id: card.id, name: card.nameSnapshot, unit: card.unit === "SESSION" ? "堂" : "點", remaining: card.remaining, held, available, expiresAt: card.expiresAt, low: card.plan.lowBalanceEnabled && card.plan.lowBalanceThreshold !== null && available <= card.plan.lowBalanceThreshold, expiring: card.remaining > 0 && card.expiresAt <= expiryEnd };
    for (const member of card.members) byMember.set(member.customerId, [...(byMember.get(member.customerId) ?? []), summary]);
  }
  const rows = customers.map(customer => ({ ...customer, cards: byMember.get(customer.id) ?? [], lastVisitAt: lastVisit.get(customer.id) ?? null }));
  return {
    low: rows.filter(row => row.cards.some(card => card.low)),
    expiring: rows.filter(row => row.cards.some(card => card.expiring)),
    inactive: rows.filter(row => row.lastVisitAt && row.lastVisitAt < inactiveBefore && row.cards.some(card => card.remaining > 0)),
  };
}
