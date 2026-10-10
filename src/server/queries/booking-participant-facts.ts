import "server-only";
import { prisma } from "@/lib/db";

export type IndividualVisit = { bookingId: string; customerId: string; bookingDate: Date; bookingType: string; source?: string; people: number; attendedPeople: number };

/** Completed people are visible before the rest of their group is resolved.
 * Voiding/refunding money does not delete the fact that service happened.
 */
export async function loadIndividualBookingFacts(storeId: string, latestDate: Date) {
  if (process.env.BOOKING_PARTICIPANTS_ENABLED !== "true") return { groupIds: new Set<string>(), visits: [] as IndividualVisit[] };
  const [groups, visits] = await Promise.all([
    prisma.$queryRaw<{ bookingId: string }[]>`SELECT "bookingId" FROM "BookingParticipantGroup" WHERE "storeId" = ${storeId}`,
    prisma.$queryRaw<IndividualVisit[]>`
      SELECT g."bookingId", p."customerId", b."bookingDate", p.service AS "bookingType", p.source, 1 AS people, 1 AS "attendedPeople"
      FROM "BookingParticipant" p JOIN "BookingParticipantGroup" g ON g.id = p."groupId" AND g."storeId" = p."storeId"
      JOIN "Booking" b ON b.id = g."bookingId" AND b."storeId" = g."storeId"
      WHERE p."storeId" = ${storeId} AND p.status = 'COMPLETED' AND p."customerId" IS NOT NULL AND b."bookingDate" <= ${latestDate}`,
  ]);
  return { groupIds: new Set(groups.map(group => group.bookingId)), visits };
}

/** Remove a converted group's old aggregate before adding its individual facts. */
export function replaceGroupedBookingFacts<T extends { id?: string; bookingId?: string }>(rows: T[], groupIds: Set<string>) {
  return rows.filter(row => !groupIds.has(row.bookingId ?? row.id ?? ""));
}
