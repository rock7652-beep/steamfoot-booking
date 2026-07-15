/**
 * Real PostgreSQL concurrency coverage for the slot advisory-lock contract.
 *
 * Run explicitly with an isolated database:
 * BOOKING_CONCURRENCY_TEST_DATABASE_URL=postgresql://... npx vitest run this-file
 *
 * Never point this at production: the suite creates and drops a dedicated
 * test-only table. It is skipped when the explicit test URL is absent.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { acquireBookingSlotLocks } from "@/server/services/booking-slot-lock";
import { resolveBookingConcurrencyTestDatabaseUrl } from "@/__tests__/helpers/booking-concurrency-test-db";

const testDatabaseUrl = resolveBookingConcurrencyTestDatabaseUrl(process.env);
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip;

describeWithPostgres("booking slot lock — real PostgreSQL", () => {
  // Do not even construct a client when the explicit test URL is absent;
  // this prevents Prisma from consulting DATABASE_URL as an implicit fallback.
  const prisma = testDatabaseUrl
    ? new PrismaClient({ datasourceUrl: testDatabaseUrl })
    : null;
  const testDb = () => {
    if (!prisma) throw new Error("Booking concurrency test database is not configured");
    return prisma;
  };
  const schemaName = `booking_concurrency_${randomUUID().replaceAll("-", "")}`;
  if (!/^booking_concurrency_[a-f0-9]{32}$/.test(schemaName)) {
    throw new Error("Invalid generated booking concurrency test schema name");
  }
  const schema = `"${schemaName}"`;
  const table = `${schema}."BookingSlotConcurrencyTest"`;
  let schemaCreated = false;

  beforeAll(async () => {
    await testDb().$executeRawUnsafe(`CREATE SCHEMA ${schema}`);
    schemaCreated = true;
    await testDb().$executeRawUnsafe(`
      CREATE TABLE ${table} (
        id TEXT PRIMARY KEY,
        "storeId" TEXT NOT NULL,
        "bookingDate" DATE NOT NULL,
        "slotTime" TEXT NOT NULL,
        people INTEGER NOT NULL
      )
    `);
  });

  afterAll(async () => {
    if (schemaCreated) {
      await testDb().$executeRawUnsafe(`DROP SCHEMA ${schema} CASCADE`);
    }
    await testDb().$disconnect();
  });

  async function clearRows() {
    await testDb().$executeRawUnsafe(`TRUNCATE TABLE ${table}`);
  }

  async function reserve(params: {
    id: string;
    storeId: string;
    date: string;
    slotTime: string;
    people: number;
    capacity: number;
  }): Promise<boolean> {
    return testDb().$transaction(async (tx) => {
      await acquireBookingSlotLocks(tx, [
        {
          storeId: params.storeId,
          bookingDate: params.date,
          slotTime: params.slotTime,
        },
      ]);
      const rows = await tx.$queryRawUnsafe<Array<{ booked: number }>>(
        `SELECT COALESCE(SUM(people), 0)::int AS booked FROM ${table}
         WHERE "storeId" = $1 AND "bookingDate" = $2::date AND "slotTime" IN ($3, $4)`,
        params.storeId,
        params.date,
        params.slotTime,
        `${params.slotTime}:00`,
      );
      if ((rows[0]?.booked ?? 0) + params.people > params.capacity) return false;
      await tx.$executeRawUnsafe(
        `INSERT INTO ${table} (id, "storeId", "bookingDate", "slotTime", people)
         VALUES ($1, $2, $3::date, $4, $5)`,
        params.id,
        params.storeId,
        params.date,
        params.slotTime,
        params.people,
      );
      return true;
    });
  }

  async function move(params: {
    id: string;
    storeId: string;
    fromDate: string;
    fromSlotTime: string;
    toDate: string;
    toSlotTime: string;
    capacity: number;
  }): Promise<boolean> {
    return testDb().$transaction(async (tx) => {
      await acquireBookingSlotLocks(tx, [
        { storeId: params.storeId, bookingDate: params.fromDate, slotTime: params.fromSlotTime },
        { storeId: params.storeId, bookingDate: params.toDate, slotTime: params.toSlotTime },
      ]);
      const source = await tx.$queryRawUnsafe<Array<{ people: number }>>(
        `SELECT people FROM ${table} WHERE id = $1 FOR UPDATE`,
        params.id,
      );
      if (!source[0]) return false;
      const rows = await tx.$queryRawUnsafe<Array<{ booked: number }>>(
        `SELECT COALESCE(SUM(people), 0)::int AS booked FROM ${table}
         WHERE "storeId" = $1 AND "bookingDate" = $2::date
           AND "slotTime" IN ($3, $4) AND id <> $5`,
        params.storeId,
        params.toDate,
        params.toSlotTime,
        `${params.toSlotTime}:00`,
        params.id,
      );
      if ((rows[0]?.booked ?? 0) + source[0].people > params.capacity) return false;
      await tx.$executeRawUnsafe(
        `UPDATE ${table} SET "bookingDate" = $1::date, "slotTime" = $2 WHERE id = $3`,
        params.toDate,
        params.toSlotTime,
        params.id,
      );
      return true;
    });
  }

  it("allows only one of two parallel reservations for the last seat", async () => {
    await clearRows();
    const base = {
      storeId: "store-a",
      date: "2026-08-01",
      slotTime: "10:00",
      people: 1,
      capacity: 1,
    };
    const results = await Promise.all([
      reserve({ ...base, id: "booking-a" }),
      reserve({ ...base, id: "booking-b" }),
    ]);
    expect(results.sort()).toEqual([false, true]);
  });

  it("does not mix capacity across stores or slots", async () => {
    await clearRows();
    const results = await Promise.all([
      reserve({ id: "a", storeId: "store-a", date: "2026-08-01", slotTime: "10:00", people: 1, capacity: 1 }),
      reserve({ id: "b", storeId: "store-b", date: "2026-08-01", slotTime: "10:00", people: 1, capacity: 1 }),
      reserve({ id: "c", storeId: "store-a", date: "2026-08-01", slotTime: "11:00", people: 1, capacity: 1 }),
    ]);
    expect(results).toEqual([true, true, true]);
  });

  it("serializes a new reservation racing a reschedule for the last seat", async () => {
    await clearRows();
    await reserve({ id: "source", storeId: "store-a", date: "2026-08-01", slotTime: "09:00", people: 1, capacity: 1 });
    const results = await Promise.all([
      reserve({ id: "new", storeId: "store-a", date: "2026-08-01", slotTime: "10:00", people: 1, capacity: 1 }),
      move({ id: "source", storeId: "store-a", fromDate: "2026-08-01", fromSlotTime: "09:00", toDate: "2026-08-01", toSlotTime: "10:00", capacity: 1 }),
    ]);
    expect(results.sort()).toEqual([false, true]);
  });

  it("allows only one of two parallel reschedules into the last seat", async () => {
    await clearRows();
    await reserve({ id: "source-a", storeId: "store-a", date: "2026-08-01", slotTime: "09:00", people: 1, capacity: 1 });
    await reserve({ id: "source-b", storeId: "store-a", date: "2026-08-01", slotTime: "11:00", people: 1, capacity: 1 });
    const results = await Promise.all([
      move({ id: "source-a", storeId: "store-a", fromDate: "2026-08-01", fromSlotTime: "09:00", toDate: "2026-08-01", toSlotTime: "10:00", capacity: 1 }),
      move({ id: "source-b", storeId: "store-a", fromDate: "2026-08-01", fromSlotTime: "11:00", toDate: "2026-08-01", toSlotTime: "10:00", capacity: 1 }),
    ]);
    expect(results.sort()).toEqual([false, true]);
  });

  it("rolls back the reservation when a later statement fails", async () => {
    await clearRows();
    await expect(
      testDb().$transaction(async (tx) => {
        await acquireBookingSlotLocks(tx, [
          { storeId: "store-a", bookingDate: "2026-08-01", slotTime: "10:00" },
        ]);
        await tx.$executeRawUnsafe(
          `INSERT INTO ${table} (id, "storeId", "bookingDate", "slotTime", people)
           VALUES ('rollback-me', 'store-a', '2026-08-01', '10:00', 1)`,
        );
        throw new Error("force rollback");
      }),
    ).rejects.toThrow("force rollback");
    const rows = await testDb().$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*)::int AS count FROM ${table}`,
    );
    expect(rows[0]?.count).toBe(0);
  });
});
