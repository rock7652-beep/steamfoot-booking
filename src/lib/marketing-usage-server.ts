import "server-only";
import { unstable_cache } from "next/cache";
import { subDays } from "date-fns";
import { prisma } from "@/lib/db";
import { dayRange, toLocalDateStr } from "@/lib/date-utils";
import { verifiedMarketingUsageSnapshot, type MarketingUsageSnapshot } from "@/lib/marketing-usage-snapshot";

export const MARKETING_USAGE_TAG = "marketing-usage-v3";

// One read-only statement produces a consistent snapshot across all modules.
export async function calculateMarketingUsage(now = new Date()): Promise<MarketingUsageSnapshot> {
  const cutoff = toLocalDateStr(now);
  const timestampCutoff = dayRange(cutoff).start;
  const rows = await prisma.$queryRaw<{ stores: bigint; customers: bigint; completed_people: bigint }[]>`
    WITH eligible AS (
      SELECT id FROM "Store"
      WHERE NOT "isDemo" AND (
        ("operatingStatus" = 'ACTIVE' AND plan <> 'EXPERIENCE') OR (
          "operatingStatus" IN ('ACTIVE','TRIAL') AND plan = 'EXPERIENCE'
          AND "planStatus" = 'TRIAL' AND "planEffectiveAt" IS NOT NULL
          AND "planEffectiveAt" <= ${timestampCutoff}
          AND "planExpiresAt" >= ${cutoff}::date
        ))
    ), served AS (
      SELECT b."storeId", b."customerId", COALESCE(b."attendedPeople", b.people)::bigint AS people
      FROM "Booking" b JOIN eligible s ON s.id = b."storeId"
      JOIN "Customer" c ON c.id = b."customerId" AND c."storeId" = b."storeId"
      WHERE b."bookingStatus" = 'COMPLETED' AND b."bookingDate" < ${cutoff}::date
        AND c.name !~* '測試|驗收|test|demo'
        AND COALESCE(b.notes, '') !~* '驗收|測試預約|test booking|demo'
      UNION ALL
      SELECT b."storeId", b."customerId", 1::bigint
      FROM "CourseBooking" b JOIN eligible s ON s.id = b."storeId"
      JOIN "CourseSession" session ON session.id = b."sessionId" AND session."storeId" = b."storeId"
      JOIN "Customer" c ON c.id = b."customerId" AND c."storeId" = b."storeId"
      WHERE b.status = 'ATTENDED' AND session."endsAt" < ${timestampCutoff}
        AND session."cancelledAt" IS NULL
        AND c.name !~* '測試|驗收|test|demo'
        AND COALESCE(b.notes, '') !~* '驗收|測試預約|test booking|demo'
      UNION ALL
      SELECT b."storeId", b."customerId", b.people::bigint
      FROM "SpaBooking" b JOIN eligible s ON s.id = b."storeId"
      JOIN "Customer" c ON c.id = b."customerId" AND c."storeId" = b."storeId"
      WHERE b.status = 'COMPLETED' AND b."bookingDate" < ${cutoff}::date
        AND c.name !~* '測試|驗收|test|demo'
        AND COALESCE(b.notes, '') !~* '驗收|測試預約|test booking|demo'
    )
    SELECT (SELECT count(*) FROM eligible) AS stores,
      count(DISTINCT ("storeId", "customerId")) AS customers,
      COALESCE(sum(people), 0)::bigint AS completed_people FROM served
  `;
  const row = rows[0];
  if (!row) throw new Error("Missing marketing usage aggregate");
  const counts = [row.stores, row.customers, row.completed_people].map(Number);
  if (counts.some(value => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error("Invalid marketing usage aggregate");
  }
  return { stores: counts[0], customers: counts[1], completedPeople: counts[2], asOf: toLocalDateStr(subDays(now, 1)) };
}

const readCachedMarketingUsage = unstable_cache(
  () => calculateMarketingUsage(),
  [MARKETING_USAGE_TAG],
  { revalidate: 86400, tags: [MARKETING_USAGE_TAG] },
);

export async function getMarketingUsage(): Promise<MarketingUsageSnapshot> {
  // Preview databases contain test records. Keep the verified production snapshot.
  if (process.env.VERCEL_ENV !== "production") return verifiedMarketingUsageSnapshot;
  try {
    return await readCachedMarketingUsage();
  } catch {
    // Never attach today's date to old numbers, or cache a failed query as zero.
    console.error("[MarketingUsage] Unable to load aggregate; retaining verified snapshot");
    return verifiedMarketingUsageSnapshot;
  }
}
