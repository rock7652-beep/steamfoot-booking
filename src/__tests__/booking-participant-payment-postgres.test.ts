import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { TrialSettings } from "@/lib/shop-config";

const h = vi.hoisted(() => ({ snapshot: vi.fn(), award: vi.fn(), payment: vi.fn(), capacity: 4 }));
vi.mock("@/lib/transaction-snapshot", () => ({ buildTransactionSnapshot: h.snapshot }));
vi.mock("@/server/services/financial-transaction", () => ({ createFinancialTransaction: h.payment }));
vi.mock("@/server/services/paid-booking-completion", () => ({ awardPaidServiceAttendanceInTransaction: h.award }));
vi.mock("@/lib/business-hours-resolver", () => ({
  loadDayBusinessHoursContext: vi.fn(async () => ({ rule: { closed: false }, slotOverrides: [] })),
  applySlotOverrides: () => [{ startTime: "13:30", isEnabled: true, capacity: h.capacity }],
}));
import { addBookingWalkIn } from "@/server/services/booking-participant-walk-in";
import { computeRefundPlan } from "@/lib/refund-plan";
import { initializeBookingParticipants, linkBookingParticipantCustomer } from "@/server/services/booking-participants";
import { collectParticipantTrialInTransaction, completeParticipantOwnPlan, resolveUnattendedParticipant } from "@/server/services/booking-participant-payment";

let db: PGlite;
function client(connection: { query: PGlite["query"] }): Prisma.TransactionClient {
  const query = async (input: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => {
    const sql = Array.isArray(input) ? Prisma.sql(input as TemplateStringsArray, ...values) : input as Prisma.Sql;
    return connection.query(sql.text, sql.values);
  };
  return {
    $queryRaw: async (input: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => (await query(input, ...values)).rows,
    $executeRaw: async (input: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => (await query(input, ...values)).affectedRows,
    booking: {
      findFirst: async ({ where }: { where: { id: string; storeId: string } }) => {
        const row = (await connection.query<{ bookingDate: string } & Record<string, unknown>>('SELECT * FROM "Booking" WHERE id=$1 AND "storeId"=$2', [where.id, where.storeId])).rows[0];
        return row ? { ...row, bookingDate: new Date(row.bookingDate) } : null;
      },
      aggregate: async ({ where }: { where: { storeId: string; bookingDate: Date; slotTime: { in: string[] } } }) => ({ _sum: { people:
        (await connection.query<{ people: number }>(`SELECT COALESCE(sum(people),0)::int AS people FROM "Booking" WHERE "storeId"=$1 AND "bookingDate"=$2 AND "slotTime"=ANY($3) AND "bookingStatus" IN ('PENDING','CONFIRMED')`, [where.storeId, where.bookingDate.toISOString().slice(0,10), where.slotTime.in])).rows[0].people } }),
    },
    walletSession: {
      findFirst: async ({ where }: { where: { id: string; walletId: string; bookingId: string; wallet: { customerId: string; storeId: string } } }) =>
        (await connection.query(`SELECT s.id FROM "WalletSession" s JOIN "CustomerPlanWallet" w ON w.id=s."walletId" WHERE s.id=$1 AND s."walletId"=$2 AND s."bookingId"=$3 AND s.status='COMPLETED' AND w."customerId"=$4 AND w."storeId"=$5`, [where.id, where.walletId, where.bookingId, where.wallet.customerId, where.wallet.storeId])).rows[0] ?? null,
      updateMany: async ({ where, data }: { where: { id: string; walletId: string }; data: { bookingId: string; completedAt: Date } }) => ({ count:
        (await connection.query(`UPDATE "WalletSession" SET status='COMPLETED', "bookingId"=$1, "completedAt"=$2 WHERE id=$3 AND "walletId"=$4 AND status='AVAILABLE'`, [data.bookingId, data.completedAt, where.id, where.walletId])).affectedRows }),
      groupBy: async ({ where }: { where: { walletId: string } }) =>
        (await connection.query<{ status: string; count: number }>('SELECT status, count(*)::int AS count FROM "WalletSession" WHERE "walletId"=$1 GROUP BY status', [where.walletId])).rows.map(row => ({ status: row.status, _count: { _all: row.count } })),
    },
    customerPlanWallet: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        (await connection.query('SELECT status FROM "CustomerPlanWallet" WHERE id=$1', [where.id])).rows[0] ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { status: string; remainingSessions: number } }) => {
        await connection.query('UPDATE "CustomerPlanWallet" SET status=$1,"remainingSessions"=$2 WHERE id=$3', [data.status, data.remainingSessions, where.id]);
      },
    },
    customer: { findFirst: async ({ where }: { where: { id: string; storeId: string } }) =>
      (await connection.query('SELECT "assignedStaffId" FROM "Customer" WHERE id=$1 AND "storeId"=$2 AND "mergedIntoCustomerId" IS NULL', [where.id, where.storeId])).rows[0] ?? null },
    staff: { findFirst: async ({ where }: { where: { id: string; storeId: string } }) =>
      (await connection.query('SELECT id FROM "Staff" WHERE id=$1 AND "storeId"=$2', [where.id, where.storeId])).rows[0] ?? null },
    transaction: { findFirst: async ({ where }: { where: { id: string; storeId: string; customerId: string } }) =>
      (await connection.query(`SELECT id, amount, "paymentMethod", note FROM "Transaction" WHERE id=$1 AND "storeId"=$2 AND "customerId"=$3
        AND status='SUCCESS' AND "paymentStatus"='SUCCESS'`, [where.id, where.storeId, where.customerId])).rows[0] ?? null },
  } as unknown as Prisma.TransactionClient;
}
const settings = { trialAllowPriceEdit: true, trialDefaultPrice: 499, trialMinPrice: 0, trialMaxPrice: 3000 } as TrialSettings;
const init = () => db.transaction(tx => initializeBookingParticipants(client(tx), { storeId: "a", bookingId: "booking" }));
const collect = (id: string, revision = 1, amount = 499) => db.transaction(tx => collectParticipantTrialInTransaction(client(tx), {
  storeId: "a", participantId: id, revision, amount, paymentMethod: "TRANSFER", serviceStaffId: "staff", settings,
}));
const booking = async () => (await db.query<{ bookingStatus: string; attendedPeople: number }>('SELECT "bookingStatus", "attendedPeople" FROM "Booking"')).rows[0];
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TYPE "BookingStatus" AS ENUM ('PENDING','CONFIRMED','COMPLETED','NO_SHOW','CANCELLED');
    CREATE TABLE "Customer" (id TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "assignedStaffId" TEXT, "mergedIntoCustomerId" TEXT, UNIQUE(id,"storeId"));
    CREATE TABLE "Staff" (id TEXT PRIMARY KEY, "storeId" TEXT);
    CREATE TABLE "Booking" (id TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "customerId" TEXT NOT NULL, people INT,
      "bookingType" TEXT, "bookingStatus" "BookingStatus", "isMakeup" BOOLEAN DEFAULT false,
      "bookingDate" DATE DEFAULT '2026-10-09', "slotTime" TEXT DEFAULT '13:30', "servicePlanId" TEXT,
      "attendedPeople" INT, "isCheckedIn" BOOLEAN DEFAULT false, "updatedAt" TIMESTAMP DEFAULT now());
    CREATE TABLE "Transaction" (id TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "bookingId" TEXT, "customerId" TEXT,
      "transactionType" TEXT, amount INT, "paymentMethod" TEXT, status TEXT DEFAULT 'SUCCESS', "paymentStatus" TEXT DEFAULT 'SUCCESS', note TEXT);`);
  await db.exec(`CREATE TABLE "CustomerPlanWallet" (id TEXT PRIMARY KEY, "storeId" TEXT, "customerId" TEXT, status TEXT DEFAULT 'ACTIVE', "remainingSessions" INT DEFAULT 2, "startDate" DATE DEFAULT '2026-10-01', "expiryDate" DATE DEFAULT '2026-12-31');
    CREATE TABLE "WalletSession" (id TEXT PRIMARY KEY, "walletId" TEXT REFERENCES "CustomerPlanWallet"(id), "sessionNo" INT, status TEXT DEFAULT 'AVAILABLE', "bookingId" TEXT, "completedAt" TIMESTAMP);`);
  await db.exec(readFileSync("docs/sql/booking-participants-draft.sql", "utf8"));
});
beforeEach(async () => {
  vi.resetAllMocks(); h.capacity = 4;
  h.snapshot.mockResolvedValue({}); h.award.mockResolvedValue(undefined);
  h.payment.mockImplementation(async (tx: Prisma.TransactionClient, { data }: Prisma.TransactionCreateArgs) => {
    const id = randomUUID();
    await tx.$executeRaw`INSERT INTO "Transaction" (id,"storeId","bookingId","customerId","transactionType",amount,"paymentMethod",note)
      VALUES (${id},${data.storeId},${data.bookingId},${data.customerId},${data.transactionType},${Number(data.amount)},${data.paymentMethod},${data.note})`;
    return { id };
  });
  await db.exec(`TRUNCATE "WalletSession", "CustomerPlanWallet", "BookingParticipant", "BookingParticipantGroup", "Transaction", "Booking", "Customer", "Staff" CASCADE;
    INSERT INTO "Customer" (id,"storeId","assignedStaffId") VALUES ('primary','a','staff'),('guest','a','staff'),('foreign','b','staff'),('third','a','staff');
    INSERT INTO "Staff" VALUES ('staff','a');
    INSERT INTO "Booking" (id,"storeId","customerId",people,"bookingType","bookingStatus") VALUES ('booking','a','primary',2,'FIRST_TRIAL','PENDING');`);
});
afterAll(async () => { await db.close(); });

describe("individual trial payment against PostgreSQL", () => {
  it("adds within the same booking up to four, retries safely, and preserves original positions", async () => {
    const first = await init();
    const add = (requestId: string) => db.transaction(tx => addBookingWalkIn(client(tx), { storeId: "a", bookingId: "booking", requestId }));
    const third = await add("request-3");
    expect(await add("request-3")).toMatchObject({ id: third.id, position: 3 });
    await add("request-4");
    await expect(add("request-5")).rejects.toThrow(/最多 4/);
    expect((await db.query<{ people: number; originalPeople: number }>(`SELECT b.people,g."originalPeople" FROM "Booking" b JOIN "BookingParticipantGroup" g ON g."bookingId"=b.id`)).rows[0]).toEqual({ people: 4, originalPeople: 2 });
    expect((await init()).slice(0,2)).toEqual(first);
  });
  it("rejects full slot and foreign store without adding a person", async () => {
    await init(); h.capacity = 2;
    await expect(db.transaction(tx => addBookingWalkIn(client(tx), { storeId: "a", bookingId: "booking", requestId: "full" }))).rejects.toThrow(/已滿/);
    await expect(db.transaction(tx => addBookingWalkIn(client(tx), { storeId: "b", bookingId: "booking", requestId: "foreign" }))).rejects.toThrow(/不屬於本店/);
    expect(await init()).toHaveLength(2);
    await expect(db.query(`UPDATE "Booking" SET people=3 WHERE id='booking'`)).rejects.toThrow(/capacity-checked/);
  });
  it("one cardholder consumes their own session, the trial companion pays independently, and retry never debits twice", async () => {
    const [primary, guest] = await init();
    await db.exec(`INSERT INTO "CustomerPlanWallet" (id,"storeId","customerId") VALUES ('own','a','primary'),('friend','a','guest');
      INSERT INTO "WalletSession" (id,"walletId","sessionNo") VALUES ('own1','own',1),('own2','own',2),('friend1','friend',1);`);
    const complete = (walletId: string, revision = 1) => db.transaction(tx => completeParticipantOwnPlan(client(tx), { storeId: "a", participantId: primary.id, revision, walletId }));
    await expect(complete("friend")).rejects.toThrow(/不屬於/);
    await complete("own");
    expect(await complete("own")).toMatchObject({ created: false });
    expect((await db.query<{ remainingSessions: number }>(`SELECT "remainingSessions" FROM "CustomerPlanWallet" WHERE id='own'`)).rows[0].remainingSessions).toBe(1);
    expect((await init())[1]).toMatchObject({ status: "PENDING", service: "FIRST_TRIAL" });
    await db.transaction(tx => linkBookingParticipantCustomer(client(tx), { storeId: "a", participantId: guest.id, customerId: "guest", revision: 1 }));
    await collect(guest.id, 2);
    expect(await booking()).toMatchObject({ bookingStatus: "COMPLETED", attendedPeople: 2 });
    expect((await db.query(`SELECT "customerId",amount FROM "Transaction" WHERE "transactionType"='TRIAL_PURCHASE'`)).rows).toEqual([{ customerId: "guest", amount: 499 }]);
    expect((await db.query(`SELECT status FROM "WalletSession" WHERE id='friend1'`)).rows[0]).toEqual({ status: "AVAILABLE" });
    const sessions = (await db.query<{ id: string; status: "AVAILABLE" | "COMPLETED" }>(`SELECT id,status FROM "WalletSession" WHERE "walletId"='own'`)).rows;
    expect(computeRefundPlan({ originalAmount: 1000, totalSessions: 2, mode: "FULL_UNUSED", sessions }).ok).toBe(false);
    expect(computeRefundPlan({ originalAmount: 1000, totalSessions: 2, mode: "REMAINING_SESSIONS", sessions })).toMatchObject({ ok: true, refundAmount: 500, sessionIdsToVoid: ["own2"] });
  });
  it("failed completion rolls back the person's session and permits retry", async () => {
    const [primary] = await init();
    await db.exec(`INSERT INTO "CustomerPlanWallet" (id,"storeId","customerId") VALUES ('own','a','primary');
      INSERT INTO "WalletSession" (id,"walletId","sessionNo") VALUES ('own1','own',1);`);
    h.award.mockRejectedValue(new Error("completion failure"));
    await expect(db.transaction(tx => completeParticipantOwnPlan(client(tx), { storeId: "a", participantId: primary.id, revision: 1, walletId: "own" }))).rejects.toThrow(/completion failure/);
    expect((await db.query(`SELECT status,"bookingId" FROM "WalletSession" WHERE id='own1'`)).rows[0]).toEqual({ status: "AVAILABLE", bookingId: null });
    expect((await init())[0].status).toBe("PENDING");
  });

  it("allows a pending group to move, but never moves paid or resolved individual history", async () => {
    const [primary] = await init();
    await db.query(`UPDATE "Booking" SET "bookingDate"='2026-10-10', "slotTime"='14:30' WHERE id='booking'`);
    await collect(primary.id);
    await expect(db.query(`UPDATE "Booking" SET "bookingDate"='2026-11-01' WHERE id='booking'`)).rejects.toThrow(/history cannot be moved/);
    await expect(db.query(`UPDATE "Booking" SET "slotTime"='15:30' WHERE id='booking'`)).rejects.toThrow(/history cannot be moved/);
    // Operational metadata remains writable without rewriting attendance.
    await db.query(`UPDATE "Booking" SET "updatedAt"=now() WHERE id='booking'`);
    expect((await db.query<{ slotTime: string }>('SELECT "slotTime" FROM "Booking"')).rows[0].slotTime).toBe("14:30");
  });
  it("retains a no-show's scheduled date even while the other person is pending", async () => {
    const [, guest] = await init();
    await db.transaction(tx => resolveUnattendedParticipant(client(tx), { storeId: "a", participantId: guest.id, revision: 1, status: "NO_SHOW" }));
    await expect(db.query(`UPDATE "Booking" SET "bookingDate"='2026-11-01' WHERE id='booking'`)).rejects.toThrow(/history cannot be moved/);
  });
  it("first receipt completes only the first person; two receipts complete the group and belong to each person", async () => {
    const [primary, guest] = await init();
    await collect(primary.id);
    expect(await booking()).toMatchObject({ bookingStatus: "PENDING", attendedPeople: 1 });
    // A cashier may fill the other identity after collecting the first receipt.
    await db.transaction(tx => linkBookingParticipantCustomer(client(tx), { storeId: "a", participantId: guest.id, customerId: "guest", revision: 1 }));
    await collect(guest.id, 2);
    expect(await booking()).toMatchObject({ bookingStatus: "COMPLETED", attendedPeople: 2 });
    const receipts = (await db.query<{ customerId: string; amount: number }>('SELECT "customerId", amount FROM "Transaction" ORDER BY "customerId"')).rows;
    expect(receipts).toEqual([{ customerId: "guest", amount: 499 }, { customerId: "primary", amount: 499 }]);
    expect(h.award.mock.calls.map(call => call[1].customerId)).toEqual(["primary", "guest"]);
  });
  it("same successful receipt retry creates no revenue or attendance twice, including after group completion", async () => {
    const [primary, guest] = await init();
    const first = await collect(primary.id);
    expect(await collect(primary.id)).toMatchObject({ transactionId: first.transactionId, created: false });
    await db.transaction(tx => resolveUnattendedParticipant(client(tx), { storeId: "a", participantId: guest.id, revision: 1, status: "NO_SHOW" }));
    expect(await collect(primary.id)).toMatchObject({ created: false });
    expect(h.payment).toHaveBeenCalledTimes(1); expect(h.award).toHaveBeenCalledTimes(1);
  });
  it("one no-show resolves without charging, does not change the original two reserved places", async () => {
    const [primary, guest] = await init(); await collect(primary.id);
    await db.transaction(tx => resolveUnattendedParticipant(client(tx), { storeId: "a", participantId: guest.id, revision: 1, status: "NO_SHOW" }));
    expect(await booking()).toMatchObject({ bookingStatus: "COMPLETED", attendedPeople: 1 });
    expect((await db.query<{ people: number }>('SELECT people FROM "Booking"')).rows[0].people).toBe(2);
    expect(h.payment).toHaveBeenCalledTimes(1);
  });
  it("both no-shows do not become completed and have no revenue", async () => {
    for (const person of await init()) await db.transaction(tx => resolveUnattendedParticipant(client(tx), { storeId: "a", participantId: person.id, revision: 1, status: "NO_SHOW" }));
    expect(await booking()).toMatchObject({ bookingStatus: "NO_SHOW", attendedPeople: 0 });
    expect(h.payment).not.toHaveBeenCalled();
  });
  it("unknown identity, stale revision and attempted 11980 package money cannot be collected as trial fee", async () => {
    const [primary, guest] = await init();
    await expect(collect(guest.id)).rejects.toThrow(/姓名與電話/);
    await expect(collect(primary.id, 99)).rejects.toThrow(/狀態已變更/);
    await expect(collect(primary.id, 1, 11980)).rejects.toThrow();
    expect(h.payment).not.toHaveBeenCalled();
  });
  it("payment failure rolls back the participant completion and all inserted receipt data", async () => {
    const [primary] = await init(); h.award.mockRejectedValue(new Error("failure after receipt insert"));
    await expect(collect(primary.id)).rejects.toThrow(/failure/);
    expect((await db.query('SELECT id FROM "Transaction"')).rows).toHaveLength(0);
    expect((await init())[0].status).toBe("PENDING");
  });
  it("database rejects a receipt belonging to the booker for the friend's slot", async () => {
    const [primary, guest] = await init(); await collect(primary.id);
    await db.transaction(tx => linkBookingParticipantCustomer(client(tx), { storeId: "a", participantId: guest.id, customerId: "guest", revision: 1 }));
    const [{ id }] = (await db.query<{ id: string }>('SELECT id FROM "Transaction"')).rows;
    await expect(db.query('UPDATE "BookingParticipant" SET "collectionTransactionId"=$1 WHERE id=$2', [id, guest.id])).rejects.toThrow();
  });
  it("collected people cannot be changed into no-show or charged with a different amount on retry", async () => {
    const [primary] = await init(); await collect(primary.id);
    await expect(collect(primary.id, 1, 599)).rejects.toThrow(/已有收款/);
    await expect(db.transaction(tx => resolveUnattendedParticipant(client(tx), { storeId: "a", participantId: primary.id, revision: 2, status: "NO_SHOW" }))).rejects.toThrow();
    await expect(db.query('UPDATE "BookingParticipant" SET status=\'NO_SHOW\' WHERE id=$1', [primary.id])).rejects.toThrow(/audited correction/);
    await expect(db.query('UPDATE "BookingParticipant" SET "arrivedAt"=NULL WHERE id=$1', [primary.id])).rejects.toThrow(/audited correction/);
  });
});
