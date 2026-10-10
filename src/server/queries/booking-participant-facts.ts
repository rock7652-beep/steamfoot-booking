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

/** Personal history must not inherit a companion's completed group status. */
export async function loadIndividualCustomerVisitSummary(storeId: string, customerId: string, excludeBookingId: string) {
  const [summary] = await prisma.$queryRaw<Array<{ totalBookings: number; lastVisit: Date | null }>>`
    WITH visits AS (
      SELECT b.id AS "bookingId", b."bookingDate"
      FROM "Booking" b
      WHERE b."storeId" = ${storeId} AND b."customerId" = ${customerId} AND b."bookingStatus" = 'COMPLETED'
        AND NOT EXISTS (SELECT 1 FROM "BookingParticipantGroup" g WHERE g."bookingId" = b.id AND g."storeId" = b."storeId")
      UNION ALL
      SELECT g."bookingId", b."bookingDate"
      FROM "BookingParticipant" p
      JOIN "BookingParticipantGroup" g ON g.id = p."groupId" AND g."storeId" = p."storeId"
      JOIN "Booking" b ON b.id = g."bookingId" AND b."storeId" = g."storeId"
      WHERE p."storeId" = ${storeId} AND p."customerId" = ${customerId} AND p.status = 'COMPLETED'
    )
    SELECT count(*)::integer AS "totalBookings",
      max("bookingDate") FILTER (WHERE "bookingId" <> ${excludeBookingId}) AS "lastVisit"
    FROM visits`;
  return summary;
}
