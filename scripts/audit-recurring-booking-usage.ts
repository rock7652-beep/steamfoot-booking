/**
 * One-time, read-only audit of weekly recurring booking adoption.
 *
 * This script performs SELECT queries only. It does not create, update, or
 * delete customers, bookings, wallets, recurrence groups, or any other rows.
 */
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const outputPath =
  process.argv.find((value) => value.startsWith("--output="))?.slice(9) ??
  "recurring-booking-usage.json";

type OverallRow = {
  bookedCustomers: bigint;
  recurringCustomers: bigint;
  activeRecurringCustomers: bigint;
  recurrenceGroups: bigint;
  recurringBookings: bigint;
};

type StoreRow = {
  storeName: string;
  bookedCustomers: bigint;
  recurringCustomers: bigint;
  activeRecurringCustomers: bigint;
  recurrenceGroups: bigint;
  recurringBookings: bigint;
};

type CustomerRow = {
  storeName: string;
  customerName: string;
  recurrenceGroups: bigint;
  recurringBookings: bigint;
  upcomingBookings: bigint;
  firstUsedAt: Date;
  lastUsedAt: Date;
};

const eligibility = `
  s."isDemo" = false
  AND c."mergedIntoCustomerId" IS NULL
  AND c."phone" NOT IN ('0900000000', '0900000001')
  AND c."name" !~* '測試|(^|[^a-z])(test|qa)([^a-z]|$)'
`;

function number(value: bigint) {
  return Number(value);
}

function percentage(numerator: number, denominator: number) {
  return denominator === 0
    ? 0
    : Math.round((numerator / denominator) * 10000) / 100;
}

async function main() {
  const [overallRows, storeRows, customerRows] = await Promise.all([
    prisma.$queryRawUnsafe<OverallRow[]>(`
      WITH eligible_booked AS (
        SELECT DISTINCT b."customerId"
        FROM "Booking" b
        JOIN "Customer" c ON c.id = b."customerId"
        JOIN "Store" s ON s.id = b."storeId"
        WHERE ${eligibility}
      ),
      eligible_recurring AS (
        SELECT DISTINCT g."customerId"
        FROM "BookingRecurrenceGroup" g
        JOIN "Customer" c ON c.id = g."customerId"
        JOIN "Store" s ON s.id = g."storeId"
        WHERE ${eligibility}
      ),
      active_recurring AS (
        SELECT DISTINCT g."customerId"
        FROM "BookingRecurrenceGroup" g
        JOIN "Booking" b ON b."recurrenceGroupId" = g.id
        JOIN "Customer" c ON c.id = g."customerId"
        JOIN "Store" s ON s.id = g."storeId"
        WHERE ${eligibility}
          AND b."bookingDate" >= CURRENT_DATE
          AND b."bookingStatus" IN ('PENDING', 'CONFIRMED')
      )
      SELECT
        (SELECT COUNT(*) FROM eligible_booked)::bigint AS "bookedCustomers",
        (SELECT COUNT(*) FROM eligible_recurring)::bigint AS "recurringCustomers",
        (SELECT COUNT(*) FROM active_recurring)::bigint AS "activeRecurringCustomers",
        (
          SELECT COUNT(*) FROM "BookingRecurrenceGroup" g
          JOIN "Customer" c ON c.id = g."customerId"
          JOIN "Store" s ON s.id = g."storeId"
          WHERE ${eligibility}
        )::bigint AS "recurrenceGroups",
        (
          SELECT COUNT(*) FROM "Booking" b
          JOIN "Customer" c ON c.id = b."customerId"
          JOIN "Store" s ON s.id = b."storeId"
          WHERE ${eligibility} AND b."recurrenceGroupId" IS NOT NULL
        )::bigint AS "recurringBookings"
    `),
    prisma.$queryRawUnsafe<StoreRow[]>(`
      SELECT
        s.name AS "storeName",
        COUNT(DISTINCT b."customerId")::bigint AS "bookedCustomers",
        COUNT(DISTINCT CASE WHEN b."recurrenceGroupId" IS NOT NULL THEN b."customerId" END)::bigint AS "recurringCustomers",
        COUNT(DISTINCT CASE
          WHEN b."recurrenceGroupId" IS NOT NULL
            AND b."bookingDate" >= CURRENT_DATE
            AND b."bookingStatus" IN ('PENDING', 'CONFIRMED')
          THEN b."customerId"
        END)::bigint AS "activeRecurringCustomers",
        COUNT(DISTINCT b."recurrenceGroupId")::bigint AS "recurrenceGroups",
        COUNT(*) FILTER (WHERE b."recurrenceGroupId" IS NOT NULL)::bigint AS "recurringBookings"
      FROM "Booking" b
      JOIN "Customer" c ON c.id = b."customerId"
      JOIN "Store" s ON s.id = b."storeId"
      WHERE ${eligibility}
      GROUP BY s.id, s.name
      ORDER BY s.name
    `),
    prisma.$queryRawUnsafe<CustomerRow[]>(`
      SELECT
        s.name AS "storeName",
        c.name AS "customerName",
        COUNT(DISTINCT g.id)::bigint AS "recurrenceGroups",
        COUNT(b.id)::bigint AS "recurringBookings",
        COUNT(b.id) FILTER (
          WHERE b."bookingDate" >= CURRENT_DATE
            AND b."bookingStatus" IN ('PENDING', 'CONFIRMED')
        )::bigint AS "upcomingBookings",
        MIN(g."createdAt") AS "firstUsedAt",
        MAX(g."createdAt") AS "lastUsedAt"
      FROM "BookingRecurrenceGroup" g
      JOIN "Customer" c ON c.id = g."customerId"
      JOIN "Store" s ON s.id = g."storeId"
      LEFT JOIN "Booking" b ON b."recurrenceGroupId" = g.id
      WHERE ${eligibility}
      GROUP BY s.id, s.name, c.id, c.name
      ORDER BY s.name, c.name
    `),
  ]);

  const overall = overallRows[0];
  if (!overall) throw new Error("Recurring booking audit returned no summary row.");

  const bookedCustomers = number(overall.bookedCustomers);
  const recurringCustomers = number(overall.recurringCustomers);
  const result = {
    generatedAt: new Date().toISOString(),
    definition: {
      numerator: "曾建立循環預約的不重複顧客",
      denominator: "曾建立任何預約的不重複顧客",
      excluded: [
        "Demo 店",
        "已合併至其他顧客的舊資料",
        "名稱含 test、qa、測試的測試顧客",
        "已知測試電話 0900000000、0900000001",
      ],
      activeDefinition: "截至查詢日仍有 PENDING 或 CONFIRMED 未來循環預約",
    },
    overall: {
      bookedCustomers,
      recurringCustomers,
      usageRatePercent: percentage(recurringCustomers, bookedCustomers),
      activeRecurringCustomers: number(overall.activeRecurringCustomers),
      recurrenceGroups: number(overall.recurrenceGroups),
      recurringBookings: number(overall.recurringBookings),
    },
    stores: storeRows.map((row) => {
      const storeBooked = number(row.bookedCustomers);
      const storeRecurring = number(row.recurringCustomers);
      return {
        storeName: row.storeName,
        bookedCustomers: storeBooked,
        recurringCustomers: storeRecurring,
        usageRatePercent: percentage(storeRecurring, storeBooked),
        activeRecurringCustomers: number(row.activeRecurringCustomers),
        recurrenceGroups: number(row.recurrenceGroups),
        recurringBookings: number(row.recurringBookings),
      };
    }),
    customers: customerRows.map((row) => ({
      storeName: row.storeName,
      customerName: row.customerName,
      recurrenceGroups: number(row.recurrenceGroups),
      recurringBookings: number(row.recurringBookings),
      upcomingBookings: number(row.upcomingBookings),
      firstUsedAt: row.firstUsedAt.toISOString(),
      lastUsedAt: row.lastUsedAt.toISOString(),
    })),
  };

  writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify({
    bookedCustomers: result.overall.bookedCustomers,
    recurringCustomers: result.overall.recurringCustomers,
    usageRatePercent: result.overall.usageRatePercent,
    activeRecurringCustomers: result.overall.activeRecurringCustomers,
    recurrenceGroups: result.overall.recurrenceGroups,
    recurringBookings: result.overall.recurringBookings,
    storeCount: result.stores.length,
  }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Recurring booking audit failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
