import "server-only";
import { spaPrisma } from "@/lib/spa-db";
import { Prisma } from "../../../generated/spa-client";
import { toLocalDateStr } from "@/lib/date-utils";

export type SpaCustomerSummary = {
  id: string;
  name: string;
  phone: string | null;
  serviceNote: string | null;
  lastVisit: string | null;
  nextVisit: string | null;
  packages: { name: string; available: number; expiry: string | null }[];
  balance: number | null;
};

// Batch summaries for the visible customers; never query legacy bookings or wallets.
export async function spaCustomerSummaries(
  storeId: string,
  ids: string[],
  canReadBookings: boolean,
  canReadAccounts: boolean,
) {
  if (!ids.length) return { visits: [], credits: [], wallets: [] };
  const today = toLocalDateStr();
  const now = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  const [visits, credits, wallets] = await Promise.all([
    canReadBookings
      ? spaPrisma.$queryRaw<
          {
            customerId: string;
            lastVisit: string | null;
            nextVisit: string | null;
          }[]
        >(Prisma.sql`
      SELECT "customerId",
        MAX(CASE WHEN status='COMPLETED' THEN "bookingDate"::text || ' ' || "startTime" END) AS "lastVisit",
        MIN(CASE WHEN status IN ('PENDING','CONFIRMED') AND ("bookingDate">${today}::date OR ("bookingDate"=${today}::date AND "startTime">=${now})) THEN "bookingDate"::text || ' ' || "startTime" END) AS "nextVisit"
      FROM "SpaBooking" WHERE "storeId"=${storeId} AND "customerId" IN (${Prisma.join(ids)}) GROUP BY "customerId"
    `)
      : [],
    canReadAccounts
      ? spaPrisma.$queryRaw<
          {
            customerId: string;
            name: string;
            available: number;
            expiry: string | null;
          }[]
        >(Prisma.sql`
      SELECT e."customerId", e."nameSnapshot" AS name,
        GREATEST(0,e."remainingUses"-COALESCE((SELECT SUM(u.uses)::int FROM "SpaEntitlementUse" u WHERE u."storeId"=e."storeId" AND u."entitlementId"=e.id AND u.status='RESERVED'),0))::int AS available,
        e."expiryDate"::text AS expiry
      FROM "SpaEntitlement" e WHERE e."storeId"=${storeId} AND e."customerId" IN (${Prisma.join(ids)})
        AND e.status='ACTIVE' AND e."remainingUses">0 AND e."startDate"<=${today}::date AND (e."expiryDate" IS NULL OR e."expiryDate">=${today}::date)
      ORDER BY e."expiryDate" ASC NULLS LAST,e."createdAt" ASC
    `)
      : [],
    canReadAccounts
      ? spaPrisma.spaStoredValueWallet.findMany({
          where: { storeId, customerId: { in: ids } },
          select: { customerId: true, balance: true },
        })
      : [],
  ]);
  return { visits, credits, wallets };
}
