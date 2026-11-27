import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { Prisma } from "@prisma/client";
import type { Prisma as CoursePrisma } from "../../generated/course-client";
import { collectCourseTrialInTransaction, voidCourseTrialInTransaction } from "@/server/services/course-trial-payment";
let db: PGlite;
function client(connection: { query: PGlite["query"] }) {
  const query = async (input: TemplateStringsArray, ...values: unknown[]) => {
    const sql = Prisma.sql(input, ...values); return connection.query(sql.text, sql.values);
  };
  const payment = async (where: { id?: string; storeId?: string; storeId_requestKey?: { storeId: string; requestKey: string } }) =>
    (await connection.query(`SELECT * FROM "CourseTrialPayment" WHERE ($1::text IS NULL OR id=$1) AND "storeId"=$2 AND ($3::text IS NULL OR "requestKey"=$3)`,
      [where.id ?? null, where.storeId ?? where.storeId_requestKey?.storeId, where.storeId_requestKey?.requestKey ?? null])).rows[0] ?? null;
  return {
    $queryRaw: async (input: TemplateStringsArray, ...values: unknown[]) => (await query(input, ...values)).rows,
    $executeRaw: async (input: TemplateStringsArray, ...values: unknown[]) => (await query(input, ...values)).affectedRows,
    courseBooking: {
      findFirst: async ({ where }: { where: { id: string; storeId: string; bookingKind?: string; cardId?: null } }) => {
        const row = (await connection.query<{ id: string } & Record<string, unknown>>(`SELECT * FROM "CourseBooking" WHERE id=$1 AND "storeId"=$2 AND ($3::text IS NULL OR "bookingKind"=$3) AND ($4 OR "cardId" IS NULL)`, [where.id, where.storeId, where.bookingKind??null, where.cardId===undefined])).rows[0];
        return row ? { ...row, session: { cancelledAt: null }, trialPayments: (await connection.query(`SELECT * FROM "CourseTrialPayment" WHERE "bookingId"=$1 AND status='SUCCESS'`, [row.id])).rows } : null;
      },
      update: async ({ where }: { where: { id: string } }) => connection.query(`UPDATE "CourseBooking" SET status='RESERVED', "checkedInAt"=NULL,"absenceKind"=NULL WHERE id=$1`, [where.id]),
    },
    courseTrialPayment: {
      findFirst: async ({ where }: { where: Parameters<typeof payment>[0] }) => payment(where),
      findUnique: async ({ where }: { where: Parameters<typeof payment>[0] }) => payment(where),
      update: async ({ where, data }: { where: { id: string }; data: { voidReason: string } }) =>
        (await connection.query(`UPDATE "CourseTrialPayment" SET status='VOIDED',"voidReason"=$2 WHERE id=$1 RETURNING *`, [where.id, data.voidReason])).rows[0],
      create: async ({ data }: { data: { storeId: string; bookingId: string; amount: number; paymentMethod: string; requestKey: string; note: string } }) =>
        (await connection.query(`INSERT INTO "CourseTrialPayment" (id,"storeId","bookingId",amount,"paymentMethod","requestKey",note) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [crypto.randomUUID(),data.storeId,data.bookingId,data.amount,data.paymentMethod,data.requestKey,data.note])).rows[0],
    },
  } as unknown as CoursePrisma.TransactionClient;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TYPE "CashbookEntryType" AS ENUM ('INCOME','EXPENSE'); CREATE TYPE "CashbookPaymentMethod" AS ENUM ('CASH','OTHER');
    CREATE TABLE "CourseBooking" (id text PRIMARY KEY,"storeId" text,"bookingKind" text DEFAULT 'TRIAL',"cardId" text,status text DEFAULT 'ATTENDED',"checkedInAt" timestamp DEFAULT now(),"absenceKind" text,"trialPrice" int DEFAULT 499,"customerName" text DEFAULT '體驗客');
    CREATE TABLE "CourseTrialPayment" (id text PRIMARY KEY,"storeId" text,"bookingId" text,status text DEFAULT 'SUCCESS',amount int,"paymentMethod" text,"paymentSplits" jsonb,"voidReason" text,"requestKey" text,note text DEFAULT '');
    CREATE TABLE "CashbookEntry" (id text PRIMARY KEY,"storeId" text,"entryDate" date,type "CashbookEntryType","paymentMethod" "CashbookPaymentMethod",category text,amount int,note text CHECK(note NOT LIKE '%FAIL%'),"createdByUserId" text,"updatedAt" timestamp);
    CREATE TABLE "AuditLog" (id text PRIMARY KEY,"actorUserId" text,"targetType" text,"targetId" text,action text,"beforeJson" jsonb,"afterJson" jsonb,"createdAt" timestamp);`);
});
beforeEach(async () => { await db.exec(`TRUNCATE "CourseBooking","CourseTrialPayment","CashbookEntry","AuditLog";
  INSERT INTO "CourseBooking" (id,"storeId") VALUES ('a','sports'),('b','music');
  INSERT INTO "CourseTrialPayment" (id,"storeId","bookingId",amount,"paymentMethod") VALUES ('pa','sports','a',499,'TRANSFER'),('pb','music','b',499,'TRANSFER');`); });
afterAll(async () => { await db.close(); });
const restore = (id = "pa", storeId = "sports", reason = "誤結帳") => db.transaction(tx => voidCourseTrialInTransaction(client(tx), { storeId, userId: "owner" }, id, reason));
describe("sports and music shared trial void", () => {
  it.each([["sports","a","pa"],["music","b","pb"]])("restores %s attendance, preserves receipt and permits recollection", async (storeId, bookingId, paymentId) => {
    await restore(paymentId, storeId); await restore(paymentId, storeId);
    expect((await db.query(`SELECT status,"checkedInAt","cardId" FROM "CourseBooking" WHERE id=$1`, [bookingId])).rows[0]).toEqual({status:"RESERVED",checkedInAt:null,cardId:null});
    expect((await db.query(`SELECT * FROM "CashbookEntry" WHERE "storeId"=$1`, [storeId])).rows).toHaveLength(1);
    expect((await db.query(`SELECT status FROM "CourseBooking" WHERE id<>$1`, [bookingId])).rows[0]).toEqual({status:"ATTENDED"});
    await db.transaction(tx => collectCourseTrialInTransaction(client(tx), {storeId,userId:"owner"}, {bookingId,amount:499,paymentMethod:"TRANSFER",requestKey:crypto.randomUUID()}));
    expect((await db.query(`SELECT status FROM "CourseTrialPayment" WHERE "storeId"=$1 ORDER BY status`, [storeId])).rows).toEqual([{status:"SUCCESS"},{status:"VOIDED"}]);
  });
  it("does not revive a cancelled trial", async () => {
    await db.exec(`UPDATE "CourseBooking" SET status='CANCELLED',"absenceKind"='TEACHER_ABSENT' WHERE id='a'`);
    await restore(); expect((await db.query(`SELECT status,"absenceKind" FROM "CourseBooking" WHERE id='a'`)).rows[0]).toEqual({status:"CANCELLED",absenceKind:"TEACHER_ABSENT"});
  });
  it("rejects another store and a card-linked trial without changing money", async () => {
    await expect(restore("pa","music")).rejects.toThrow(/找不到/);
    await db.exec(`UPDATE "CourseBooking" SET "cardId"='card' WHERE id='a'`);
    await expect(restore()).rejects.toThrow(/不一致/);
    expect((await db.query(`SELECT status FROM "CourseTrialPayment" WHERE id='pa'`)).rows[0]).toEqual({status:"SUCCESS"});
  });
  it("rolls attendance and receipt back when cash reversal fails", async () => {
    await expect(restore("pa","sports","FAIL")).rejects.toThrow();
    expect((await db.query(`SELECT status FROM "CourseBooking" WHERE id='a'`)).rows[0]).toEqual({status:"ATTENDED"});
    expect((await db.query(`SELECT status FROM "CourseTrialPayment" WHERE id='pa'`)).rows[0]).toEqual({status:"SUCCESS"});
    expect((await db.query(`SELECT * FROM "CashbookEntry"`)).rows).toHaveLength(0);
  });
});
