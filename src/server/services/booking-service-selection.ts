import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseTaiwanDateToDbDate } from "@/lib/date-utils";

type Reader = Pick<Prisma.TransactionClient, "$queryRaw">;
export type SelectedBookingService = {
  service: string;
  status: string;
  arrivedAt: Date | null;
  collectionTransactionId: string | null;
  walletSessionId: string | null;
  sessionStatus: string | null;
  walletStatus: string | null;
  startDate: Date | null;
  expiryDate: Date | null;
};

/** Read only after the caller has authorized the booking and store. The original
 * Booking type is immutable for participant groups; it is not their payment method. */
export async function loadSelectedBookingServices(
  booking: { id: string; storeId: string },
  reader: Reader = prisma,
): Promise<SelectedBookingService[]> {
  if (process.env.BOOKING_PARTICIPANTS_ENABLED !== "true") return [];
  return reader.$queryRaw<SelectedBookingService[]>`
    SELECT p.service, p.status, p."arrivedAt", p."collectionTransactionId", p."walletSessionId",
      ws.status::text AS "sessionStatus", w.status::text AS "walletStatus", w."startDate", w."expiryDate"
    FROM "BookingParticipantGroup" g
    JOIN "BookingParticipant" p ON p."groupId" = g.id AND p."storeId" = g."storeId"
    LEFT JOIN "WalletSession" ws ON ws.id = p."walletSessionId" AND ws."bookingId" = g."bookingId"
    LEFT JOIN "CustomerPlanWallet" w ON w.id = ws."walletId" AND w."storeId" = p."storeId" AND w."customerId" = p."customerId"
    WHERE g."bookingId" = ${booking.id} AND g."storeId" = ${booking.storeId}
    ORDER BY p.position`;
}

export function selectedBookingServiceName(services: SelectedBookingService[], originalType: string): string {
  const types = services.length ? [...new Set(services.filter(p => p.status !== "CANCELLED").map(p => p.service))] : [originalType];
  const labels: Record<string, string> = { FIRST_TRIAL: "首次體驗", PACKAGE_SESSION: "方案預約", SINGLE: "單次預約" };
  return types.map(type => labels[type] ?? "服務待核對").join("＋") || "預約待核對";
}

export function selectedServicesCoverDate(services: SelectedBookingService[], date: string): boolean {
  const target = parseTaiwanDateToDbDate(date);
  return services.every(person => person.status === "PENDING" && !person.arrivedAt && !person.collectionTransactionId &&
    (person.service === "FIRST_TRIAL" || person.service === "SINGLE" ||
      (person.service === "PACKAGE_SESSION" && person.walletSessionId !== null && person.sessionStatus === "RESERVED" &&
        person.walletStatus === "ACTIVE" && person.startDate !== null && person.startDate <= target &&
        (person.expiryDate === null || person.expiryDate >= target))));
}
