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

import { selectParticipantPlan, revertParticipantService, cancelParticipantPlan, completePreviouslyPaidParticipant } from "@/server/services/booking-participant-lifecycle";

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
      updateMany: async ({ where, data }: { where: { id: string; status: string; walletId?: string }; data: { status: string; bookingId?: string; completedAt: Date | null } }) => ({ count:
        (await connection.query(`UPDATE "WalletSession" SET status=$1, "completedAt"=$2, "bookingId"=COALESCE($5,"bookingId") WHERE id=$3 AND status=$4`, [data.status, data.completedAt, where.id, where.status, data.bookingId ?? null])).affectedRows }),
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
    auditLog: { create: async ({ data }: { data: { storeId: string; targetType: string; targetId: string; action: string; beforeJson: unknown; afterJson: unknown } }) => {
      const id = randomUUID(); await connection.query(`INSERT INTO "AuditLog" (id,"storeId","targetType","targetId",action,"beforeJson","afterJson") VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id,data.storeId,data.targetType,data.targetId,data.action,JSON.stringify(data.beforeJson),JSON.stringify(data.afterJson)]); return { id };
    } },
    transactionAuditLog: { create: async () => ({ id: randomUUID() }) },
    transaction: {
      count: async ({ where }: { where: { refundOfTransactionId: string } }) => (await connection.query<{n:number}>(`SELECT count(*)::int AS n FROM "Transaction" WHERE "refundOfTransactionId"=$1 AND status='SUCCESS'`,[where.refundOfTransactionId])).rows[0].n,
      findFirst: async ({ where }: { where: { id: string; storeId: string; customerId: string } }) =>
        (await connection.query(`SELECT id, amount, "paymentMethod", note FROM "Transaction" WHERE id=$1 AND "storeId"=$2 AND "customerId"=$3
        AND status='SUCCESS' AND "paymentStatus"='SUCCESS' AND "refundAmount"=0`, [where.id, where.storeId, where.customerId])).rows[0] ?? null,
      findMany: async ({ where }: { where: { storeId: string; bookingId: string; customerId: string; customerPlanWalletId: string } }) =>
        (await connection.query(`SELECT id,amount FROM "Transaction" WHERE "storeId"=$1 AND "bookingId"=$2 AND "customerId"=$3 AND "customerPlanWalletId"=$4 AND "transactionType"='SESSION_DEDUCTION' AND status='SUCCESS'`,[where.storeId,where.bookingId,where.customerId,where.customerPlanWalletId])).rows,
      updateMany: async ({where}: {where:{id:string}}) => ({count:(await connection.query(`UPDATE "Transaction" SET status='VOIDED' WHERE id=$1 AND status='SUCCESS'`,[where.id])).affectedRows}),
    },
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
      "transactionType" TEXT, amount INT, "paymentMethod" TEXT, status TEXT DEFAULT 'SUCCESS', "paymentStatus" TEXT DEFAULT 'SUCCESS', note TEXT, "refundAmount" INT DEFAULT 0, "customerPlanWalletId" TEXT, "refundOfTransactionId" TEXT);
    CREATE TABLE "AuditLog" (id TEXT PRIMARY KEY,"storeId" TEXT,"targetType" TEXT,"targetId" TEXT,action TEXT,"beforeJson" JSONB,"afterJson" JSONB);`);
  await db.exec(`CREATE TABLE "CustomerPlanWallet" (id TEXT PRIMARY KEY, "storeId" TEXT, "customerId" TEXT, status TEXT DEFAULT 'ACTIVE', "remainingSessions" INT DEFAULT 2, "startDate" DATE DEFAULT '2026-10-01', "expiryDate" DATE DEFAULT '2026-12-31');
    CREATE TABLE "WalletSession" (id TEXT PRIMARY KEY, "walletId" TEXT REFERENCES "CustomerPlanWallet"(id), "sessionNo" INT, status TEXT DEFAULT 'AVAILABLE', "bookingId" TEXT, "completedAt" TIMESTAMP,"reservedAt" TIMESTAMP);`);
  await db.exec(readFileSync("docs/sql/booking-participants-draft.sql", "utf8"));
  await db.exec(readFileSync("docs/sql/booking-participants-lifecycle-upgrade.sql", "utf8"));
});
beforeEach(async () => {
  vi.resetAllMocks(); h.capacity = 4;
  h.snapshot.mockResolvedValue({}); h.award.mockResolvedValue(undefined);
  h.payment.mockImplementation(async (tx: Prisma.TransactionClient, { data }: Prisma.TransactionCreateArgs) => {
    const id = randomUUID();
    await tx.$executeRaw`INSERT INTO "Transaction" (id,"storeId","bookingId","customerId","transactionType",amount,"paymentMethod",note,"customerPlanWalletId")
      VALUES (${id},${data.storeId},${data.bookingId},${data.customerId},${data.transactionType},${Number(data.amount)},${data.paymentMethod},${data.note},${data.customerPlanWalletId ?? null})`;
    return { id };
  });
  await db.exec(`TRUNCATE "AuditLog", "WalletSession", "CustomerPlanWallet", "BookingParticipant", "BookingParticipantGroup", "Transaction", "Booking", "Customer", "Staff" CASCADE;
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

const operation = (person: { id: string; revision: number }) => ({ storeId: "a", participantId: person.id, revision: person.revision, actorUserId: "operator" });
const reserve = (person: { id: string; revision: number }, walletId: string | null = "own") => db.transaction(tx => selectParticipantPlan(client(tx), { ...operation(person), walletId }));
const restore = (person: { id: string; revision: number }) => db.transaction(tx => revertParticipantService(client(tx), operation(person)));
async function ownWallet() { await db.exec(`INSERT INTO "CustomerPlanWallet" (id,"storeId","customerId") VALUES ('own','a','primary'); INSERT INTO "WalletSession" (id,"walletId","sessionNo") VALUES ('own1','own',1),('own2','own',2);`); }

describe("select, complete, restore and cancel are separate participant operations", () => {
  it("selection reserves only, completion debits once, restore keeps the reservation and cancellation releases it", async () => {
    await db.exec(`UPDATE "Booking" SET people=1`); const [person] = await init(); await ownWallet();
    await reserve(person);
    expect(await booking()).toMatchObject({ bookingStatus: "PENDING", attendedPeople: 0 });
    expect((await db.query(`SELECT status FROM "WalletSession" WHERE id='own1'`)).rows[0]).toEqual({status:"RESERVED"});
    expect((await db.query(`SELECT count(*)::int AS n FROM "Transaction"`)).rows[0]).toEqual({n:0});
    expect(h.award).not.toHaveBeenCalled();
    const [selected] = await init();
    await db.transaction(tx=>completeParticipantOwnPlan(client(tx),{...operation(selected),walletId:"own"}));
    expect(await booking()).toMatchObject({bookingStatus:"COMPLETED"});
    const [completed] = await init(); await restore(completed); await restore(completed);
    expect(await booking()).toMatchObject({bookingStatus:"PENDING",attendedPeople:0});
    expect((await db.query(`SELECT status FROM "Transaction"`)).rows[0]).toEqual({status:"VOIDED"});
    expect((await db.query(`SELECT "remainingSessions" FROM "CustomerPlanWallet"`)).rows[0]).toEqual({remainingSessions:2});
    const [pending] = await init();
    await db.transaction(tx=>cancelParticipantPlan(client(tx),{...operation(pending),status:"CANCELLED"}));
    expect(await booking()).toMatchObject({bookingStatus:"CANCELLED"});
    expect((await db.query(`SELECT status,"bookingId" FROM "WalletSession" WHERE id='own1'`)).rows[0]).toEqual({status:"AVAILABLE",bookingId:null});
  });
  it("restores only the cardholder and preserves the companion's paid completion", async () => {
    const [person,friend] = await init(); await ownWallet(); await reserve(person);
    const [selected] = await init(); await db.transaction(tx=>completeParticipantOwnPlan(client(tx),{...operation(selected),walletId:"own"}));
    await db.transaction(tx=>linkBookingParticipantCustomer(client(tx),{storeId:"a",participantId:friend.id,customerId:"guest",revision:1}));
    await collect(friend.id,2); const [completed] = await init(); await restore(completed);
    expect((await init())[1]).toMatchObject({status:"COMPLETED",service:"FIRST_TRIAL"});
    expect(await booking()).toMatchObject({bookingStatus:"PENDING",attendedPeople:1});
    expect((await db.query(`SELECT status,amount FROM "Transaction" WHERE "customerId"='guest'`)).rows[0]).toEqual({status:"SUCCESS",amount:499});
  });
  it("paid trial restoration retains cash and re-completion never collects twice", async () => {
    await db.exec(`UPDATE "Booking" SET people=1`); const [person] = await init(); await collect(person.id);
    const [completed] = await init(); await restore(completed); const [pending] = await init();
    await expect(reserve(pending)).rejects.toThrow(/原款項/);
    await db.transaction(tx=>completePreviouslyPaidParticipant(client(tx),operation(pending)));
    expect((await db.query(`SELECT count(*)::int AS n FROM "Transaction"`)).rows[0]).toEqual({n:1});
    expect(await booking()).toMatchObject({bookingStatus:"COMPLETED"});
  });
  it("a stale selection or unavailable/foreign/expired wallet cannot consume or lose the old reservation", async () => {
    const [person] = await init(); await ownWallet(); await reserve(person);
    await expect(reserve(person)).rejects.toThrow(/狀態已變更/);
    const [selected] = await init(); await expect(reserve(selected,"foreign")).rejects.toThrow(/方案/);
    await db.exec(`INSERT INTO "CustomerPlanWallet" (id,"storeId","customerId") VALUES ('empty','a','primary')`);
    await expect(reserve(selected,"empty")).rejects.toThrow(/可預約堂數/);
    await db.exec(`INSERT INTO "CustomerPlanWallet" (id,"storeId","customerId","expiryDate") VALUES ('expired','a','primary','2020-01-01')`);
    await expect(reserve(selected,"expired")).rejects.toThrow(/預約日期/);
    expect((await db.query(`SELECT status FROM "WalletSession" WHERE id='own1'`)).rows[0]).toEqual({status:"RESERVED"});
    await reserve(selected,null); expect((await init())[0]).toMatchObject({service:"FIRST_TRIAL",status:"PENDING"});
    expect((await db.query(`SELECT status FROM "WalletSession" WHERE id='own1'`)).rows[0]).toEqual({status:"AVAILABLE"});
  });
  it("fully corrected trial receipt can switch to a plan without deleting the money history", async () => {
    await db.exec(`UPDATE "Booking" SET people=1`); const [person] = await init(); await ownWallet(); await collect(person.id);
    const [completed] = await init(); await restore(completed); const [pending] = await init();
    await db.exec(`UPDATE "Transaction" SET "refundAmount"=amount WHERE "transactionType"='TRIAL_PURCHASE'`);
    await reserve(pending); const [selected] = await init();
    expect(selected).toMatchObject({service:"PACKAGE_SESSION",status:"PENDING"});
    expect((await db.query(`SELECT "collectionTransactionId" FROM "BookingParticipant" WHERE id=$1`,[person.id])).rows[0]).toEqual({collectionTransactionId:null});
    await db.transaction(tx=>completeParticipantOwnPlan(client(tx),{...operation(selected),walletId:"own"}));
    expect((await db.query(`SELECT count(*)::int AS n FROM "Transaction"`)).rows[0]).toEqual({n:2});
    expect(h.award).toHaveBeenCalledTimes(1);
  });
  it("re-completing a restored plan does not repeat attendance awards or successful deductions", async () => {
    await db.exec(`UPDATE "Booking" SET people=1`); const [person]=await init(); await ownWallet(); await reserve(person);
    const [selected]=await init(); await db.transaction(tx=>completeParticipantOwnPlan(client(tx),{...operation(selected),walletId:"own"}));
    const [completed]=await init(); await restore(completed); const [pending]=await init();
    await db.transaction(tx=>completeParticipantOwnPlan(client(tx),{...operation(pending),walletId:"own"}));
    expect(h.award).toHaveBeenCalledTimes(1);
    expect((await db.query(`SELECT count(*)::int AS n FROM "Transaction" WHERE status='SUCCESS'`)).rows[0]).toEqual({n:1});
  });
  it("raw status reversal is still blocked without the matching audit record", async () => {
    await db.exec(`UPDATE "Booking" SET people=1`); const [person]=await init(); await ownWallet(); await reserve(person);
    const [selected]=await init(); await db.transaction(tx=>completeParticipantOwnPlan(client(tx),{...operation(selected),walletId:"own"}));
    await expect(db.exec(`UPDATE "Booking" SET "bookingStatus"='PENDING'`)).rejects.toThrow(/Group status/);
    await expect(db.exec(`UPDATE "BookingParticipant" SET status='PENDING', revision=revision+1`)).rejects.toThrow(/audited correction/);
  });
  it("rejects the older guard version before reserving or writing an audit", async () => {
    const [person]=await init(); await ownWallet();
    await db.exec(`CREATE OR REPLACE FUNCTION public.booking_participant_wallet_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$`);
    try {
      await expect(reserve(person)).rejects.toThrow(/更新尚未完成/);
      expect((await db.query(`SELECT count(*)::int AS n FROM "AuditLog"`)).rows[0]).toEqual({n:0});
      expect((await db.query(`SELECT status FROM "WalletSession" WHERE id='own1'`)).rows[0]).toEqual({status:"AVAILABLE"});
    } finally { await db.exec(readFileSync("docs/sql/booking-participants-lifecycle-upgrade.sql","utf8")); }
  });

});
