import "server-only";
import { unstable_cache } from "next/cache";
import { subDays } from "date-fns";
import { prisma } from "@/lib/db";
import { dayRange, toLocalDateStr } from "@/lib/date-utils";
import { verifiedMarketingUsageSnapshot, type MarketingUsageSnapshot } from "@/lib/marketing-usage-snapshot";

export const MARKETING_USAGE_TAG = "marketing-usage-v4";

// One read-only statement produces a consistent snapshot across all modules.
export async function calculateMarketingUsage(now = new Date()): Promise<MarketingUsageSnapshot> {
  const cutoff = toLocalDateStr(now);
  const timestampCutoff = dayRange(cutoff).start;
  const rows = await prisma.$queryRaw<{ stores: bigint; customers: bigint; completed_people: bigint; reminders_sent: bigint }[]>`
    WITH eligible AS (
      SELECT id FROM "Store"
      WHERE NOT "isDemo" AND "archivedAt" IS NULL
        AND name !~* '測試|驗收|test|demo'
        AND slug !~* '(^|-)(test|demo|qa)(-|$)' AND (
        ("operatingStatus" = 'ACTIVE' AND plan <> 'EXPERIENCE') OR (
          "operatingStatus" IN ('ACTIVE','TRIAL') AND plan = 'EXPERIENCE'
          AND "planStatus" = 'TRIAL' AND "planEffectiveAt" IS NOT NULL
          AND "planEffectiveAt" <= ${cutoff}::date
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
    ), reminder_messages AS (
      SELECT m.id, m."storeId", m."ruleId", m."bookingId", m."triggerAt",
        CASE
          WHEN m."ruleId" IS NOT NULL AND b.id IS NOT NULL AND m."triggerAt" IS NOT NULL
            AND r."triggerType" IN ('CUSTOM', 'BEFORE_BOOKING_1D', 'BEFORE_BOOKING_2H') THEN 'booking'
          WHEN m.id LIKE 'course-reminder:%' AND cb.id IS NOT NULL
            AND m."triggerAt" IS NOT NULL THEN 'course_booking'
          WHEN m.id LIKE 'plan-expiry-14-days:%' OR m.id LIKE 'plan-expiry-7-days:%' THEN 'plan_expiry'
          WHEN m.id LIKE 'course-expiry:%' AND m."courseCardId" IS NOT NULL THEN 'course_expiry'
          WHEN (m.id LIKE 'course-low-balance:%' OR m.id LIKE 'course-used-up:%')
            AND m."courseCardId" IS NOT NULL THEN 'course_balance'
        END AS category
      FROM "MessageLog" m JOIN eligible s ON s.id = m."storeId"
      JOIN "Customer" c ON c.id = m."customerId" AND c."storeId" = m."storeId"
      LEFT JOIN "ReminderRule" r ON r.id = m."ruleId" AND r."storeId" = m."storeId"
      LEFT JOIN "Booking" b ON b.id = m."bookingId" AND b."storeId" = m."storeId"
      LEFT JOIN "CourseBooking" cb ON cb.id = m."courseBookingId" AND cb."storeId" = m."storeId"
      WHERE m.status = 'SENT' AND m."sentAt" IS NOT NULL AND m."sentAt" < ${timestampCutoff}
        AND c.name !~* '測試|驗收|test|demo'
        AND COALESCE(b.notes, '') !~* '驗收|測試預約|test booking|demo'
        AND COALESCE(cb.notes, '') !~* '驗收|測試預約|test booking|demo'
    ), reminder_deliveries AS (
      -- Booking retries share the scheduled intent; newer producers persist a stable id.
      SELECT DISTINCT category, CASE WHEN category = 'booking'
        THEN jsonb_build_array("storeId", "ruleId", "bookingId", "triggerAt")::text
        ELSE id END AS delivery_key
      FROM reminder_messages WHERE category IS NOT NULL
      UNION ALL
      SELECT DISTINCT 'steam_balance', jsonb_build_array(n."walletId", n.type)::text
      FROM "SessionBalanceNotification" n JOIN eligible s ON s.id = n."storeId"
      JOIN "Customer" c ON c.id = n."customerId" AND c."storeId" = n."storeId"
      WHERE n.status = 'SENT' AND n."sentAt" IS NOT NULL AND n."sentAt" < ${timestampCutoff}
        AND n.type IN ('LAST_SESSION', 'PLAN_USED_UP')
        AND c.name !~* '測試|驗收|test|demo'
    )
    SELECT (SELECT count(*) FROM eligible) AS stores,
      count(DISTINCT ("storeId", "customerId")) AS customers,
      COALESCE(sum(people), 0)::bigint AS completed_people,
      (SELECT count(*) FROM reminder_deliveries) AS reminders_sent FROM served
  `;
  const row = rows[0];
  if (!row) throw new Error("Missing marketing usage aggregate");
  const rawCounts = [row.stores, row.customers, row.completed_people, row.reminders_sent];
  const counts = rawCounts.map(Number);
  if (rawCounts.some(value => typeof value !== "bigint" && typeof value !== "number") ||
      counts.some(value => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error("Invalid marketing usage aggregate");
  }
  return { stores: counts[0], customers: counts[1], completedPeople: counts[2], remindersSent: counts[3], asOf: toLocalDateStr(subDays(now, 1)) };
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
