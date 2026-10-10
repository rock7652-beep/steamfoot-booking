import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { initializeBookingParticipants, linkBookingParticipantCustomer } from "@/server/services/booking-participants";

let db: PGlite;
function client(connection: { query: PGlite["query"] }): Prisma.TransactionClient {
  function sql(input: TemplateStringsArray | Prisma.Sql, values: unknown[]) {
    return Array.isArray(input) ? Prisma.sql(input as TemplateStringsArray, ...values) : input as Prisma.Sql;
  }
  return {
    $queryRaw: async (input: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => {
      const statement = sql(input, values);
      return (await connection.query(statement.text, statement.values)).rows;
    },
    $executeRaw: async (input: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => {
      const statement = sql(input, values);
      return (await connection.query(statement.text, statement.values)).affectedRows;
    },
  } as unknown as Prisma.TransactionClient;
}
const init = () => db.transaction(tx => initializeBookingParticipants(client(tx), { storeId: "a", bookingId: "booking" }));
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE "Customer" (id TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "mergedIntoCustomerId" TEXT, UNIQUE (id,"storeId"));
    CREATE TABLE "Booking" (id TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "customerId" TEXT NOT NULL,
      people INTEGER NOT NULL, "bookingType" TEXT NOT NULL, "bookingStatus" TEXT NOT NULL, "isMakeup" BOOLEAN NOT NULL DEFAULT false,
      "attendedPeople" INTEGER, "isCheckedIn" BOOLEAN DEFAULT false,
      "bookingDate" DATE DEFAULT '2026-10-09', "slotTime" TEXT DEFAULT '13:30');
    CREATE TABLE "Transaction" (id TEXT PRIMARY KEY, "bookingId" TEXT, "storeId" TEXT NOT NULL, "customerId" TEXT, "transactionType" TEXT);
  `);
  await db.exec(readFileSync("docs/sql/booking-participants-draft.sql", "utf8"));
});
beforeEach(async () => {
  await db.exec(`TRUNCATE "BookingParticipant", "BookingParticipantGroup", "Booking", "Customer", "Transaction" CASCADE;
    INSERT INTO "Customer" (id,"storeId") VALUES ('primary','a'),('guest','a'),('foreign','b');
    INSERT INTO "Booking" (id,"storeId","customerId",people,"bookingType","bookingStatus") VALUES ('booking','a','primary',2,'FIRST_TRIAL','PENDING');`);
});
afterAll(async () => { await db.close(); });

describe("participant service against local PostgreSQL", () => {
  it("cannot attach an identity after legacy checkout or group completion", async () => {
    const [, guest] = await init();
    const input = { storeId: "a", participantId: guest.id, customerId: "guest", revision: 1 };
    await expect(db.exec(`INSERT INTO "Transaction" (id,"bookingId","storeId","transactionType") VALUES ('legacy','booking','a','TRIAL_PURCHASE')`)).rejects.toThrow(/individual participant/);
    await expect(db.exec(`UPDATE "Booking" SET "bookingStatus" = 'COMPLETED' WHERE id = 'booking'`)).rejects.toThrow(/actual participants/);
    await db.transaction(tx => linkBookingParticipantCustomer(client(tx), input));
    expect((await init())[1].customerId).toBe("guest");
  });
  it("creates exactly two stable slots and retry creates no extra customers or slots", async () => {
    const first = await init(); const second = await init();
    expect(first).toHaveLength(2); expect(second).toEqual(first);
    expect(first.map(p => p.customerId)).toEqual(["primary", null]);
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM "Customer"')).rows[0].count).toBe(3);
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM "Transaction"')).rows[0].count).toBe(0);
  });
  it("links the guest to the same slot and preserves reserved count", async () => {
    const [, guest] = await init();
    const input = { storeId: "a", participantId: guest.id, customerId: "guest", revision: 1 };
    await db.transaction(tx => linkBookingParticipantCustomer(client(tx), input));
    await db.transaction(tx => linkBookingParticipantCustomer(client(tx), input));
    const slots = await init();
    expect(slots[1]).toMatchObject({ id: guest.id, customerId: "guest", revision: 2 });
    expect(slots).toHaveLength(2);
    expect((await db.query<{ originalPeople: number }>('SELECT "originalPeople" FROM "BookingParticipantGroup"')).rows[0].originalPeople).toBe(2);
  });
  it("refuses a cross-store booking and member without modifying the guest", async () => {
    await expect(db.transaction(tx => initializeBookingParticipants(client(tx), { storeId: "b", bookingId: "booking" }))).rejects.toThrow(/不屬於本店/);
    const [, guest] = await init();
    await expect(db.transaction(tx => linkBookingParticipantCustomer(client(tx), { storeId: "a", participantId: guest.id, customerId: "foreign", revision: 1 }))).rejects.toThrow(/不屬於本店/);
    expect((await init())[1].customerId).toBeNull();
  });
  it("refuses the same customer twice and a stale cashier revision", async () => {
    const [, guest] = await init();
    await expect(db.transaction(tx => linkBookingParticipantCustomer(client(tx), { storeId: "a", participantId: guest.id, customerId: "primary", revision: 1 }))).rejects.toThrow(/已在本次預約/);
    await expect(db.transaction(tx => linkBookingParticipantCustomer(client(tx), { storeId: "a", participantId: guest.id, customerId: "guest", revision: 99 }))).rejects.toThrow(/資料已變更/);
  });
  it("does not split any historical group transaction or a completed booking", async () => {
    await db.exec(`INSERT INTO "Transaction" (id,"bookingId","storeId") VALUES ('old','booking','a');`);
    await expect(init()).rejects.toThrow(/不能自動拆款/);
    await db.exec(`DELETE FROM "Transaction"; UPDATE "Booking" SET "bookingStatus"='COMPLETED';`);
    await expect(init()).rejects.toThrow(/不可自動拆分/);
    expect((await db.query('SELECT * FROM "BookingParticipantGroup"')).rows).toHaveLength(0);
  });
  it("does not initialize package allocations until per-person deduction is integrated", async () => {
    await db.exec(`UPDATE "Booking" SET "bookingType"='PACKAGE_SESSION';`);
    await expect(init()).rejects.toThrow(/核對每位使用方式/);
  });
  it("database rejects cross-store identity, duplicate slot and rewritten source count", async () => {
    const [primary, guest] = await init();
    await expect(db.query('UPDATE "BookingParticipant" SET "customerId"=$1 WHERE id=$2', ["foreign", guest.id])).rejects.toThrow();
    await expect(db.query('UPDATE "BookingParticipantGroup" SET "originalPeople"=3 WHERE id=$1', [primary.groupId])).rejects.toThrow(/immutable/);
    await expect(db.query(`INSERT INTO "BookingParticipant" (id,"groupId","storeId",position,source,service) VALUES ('duplicate',$1,'a',1,'RESERVATION','FIRST_TRIAL')`, [primary.groupId])).rejects.toThrow();
    await expect(db.query(`INSERT INTO "BookingParticipant" (id,"groupId","storeId",position,source,service) VALUES ('fake-original',$1,'a',3,'RESERVATION','FIRST_TRIAL')`, [primary.groupId])).rejects.toThrow(/reserved positions/);
  });
  it("completed identity cannot be silently replaced and a fifth active person is rejected", async () => {
    const [, guest] = await init();
    await db.query(`UPDATE "BookingParticipant" SET service='PACKAGE_SESSION', status='COMPLETED', "arrivedAt"=now(), "completedAt"=now() WHERE id=$1`, [guest.id]);
    await expect(db.query('UPDATE "BookingParticipant" SET "customerId"=$1 WHERE id=$2', ["guest", guest.id])).rejects.toThrow(/cannot be reassigned/);
    await db.query(`INSERT INTO "BookingParticipant" (id,"groupId","storeId",position,source,service) VALUES ('third',$1,'a',3,'WALK_IN','FIRST_TRIAL'), ('fourth',$1,'a',4,'WALK_IN','FIRST_TRIAL')`, [guest.groupId]);
    await expect(db.query(`INSERT INTO "BookingParticipant" (id,"groupId","storeId",position,source,service) VALUES ('fifth',$1,'a',5,'WALK_IN','FIRST_TRIAL')`, [guest.groupId])).rejects.toThrow(/four active/);
    await db.exec(`UPDATE "BookingParticipant" SET status='CANCELLED' WHERE id='third';`);
    await db.query(`INSERT INTO "BookingParticipant" (id,"groupId","storeId",position,source,service) VALUES ('replacement',$1,'a',5,'WALK_IN','FIRST_TRIAL')`, [guest.groupId]);
    expect((await db.query('SELECT id FROM "BookingParticipant"')).rows).toHaveLength(5);
  });
  it.each(["anon", "authenticated"])("%s cannot read or mutate participant tables", async role => {
    await init();
    try {
      await db.exec(`SET ROLE ${role}`);
      await expect(db.query('SELECT * FROM "BookingParticipant"')).rejects.toThrow(/permission denied/);
      await expect(db.query('DELETE FROM "BookingParticipantGroup"')).rejects.toThrow(/permission denied/);
    } finally { await db.exec("RESET ROLE"); }
  });
});
