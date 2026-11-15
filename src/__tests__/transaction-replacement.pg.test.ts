import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { Prisma } from "@prisma/client";
const h = vi.hoisted(() => ({ aggregate: vi.fn(), splits: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {
  transaction: { aggregate: h.aggregate }, transactionPaymentSplit: { aggregate: h.splits },
} }));
import { resolveTransactionReplacement, recordTransactionReplacement } from "@/server/services/transaction-replacement";
import { createFinancialTransaction } from "@/server/services/financial-transaction";
import { computeCashIncomeForSession } from "@/server/services/cash-drawer";

// Disposable, in-memory PostgreSQL only. Production credentials are never used.
const db = new PGlite();
const originalDate = new Date("2026-11-14T04:00:00Z");
const oldDay = new Date("2026-11-14T00:00:00Z");
const today = new Date("2026-11-15T00:00:00Z");
const input = { sourceId: "source", storeId: "store", customerId: "customer", fingerprint: "corrected-20-sessions" };
beforeAll(async () => {
  await db.exec(`CREATE TABLE "Transaction" (id text primary key,"storeId" text,"customerId" text,status text,
    "paymentStatus" text,"transactionType" text,"paymentMethod" text,amount numeric,"transactionDate" timestamptz,
    "customerPlanWalletId" text);
    CREATE TABLE "CashDrawerSession" (id text primary key,"storeId" text,"businessDate" date,status text,"updatedAt" timestamptz,"finalBookBalance" numeric);
    CREATE TABLE "TransactionAuditLog" (id serial primary key,"transactionId" text,"storeId" text,"afterJson" jsonb);
  `);
});
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec(`TRUNCATE "Transaction", "CashDrawerSession", "TransactionAuditLog";
    INSERT INTO "Transaction" VALUES ('source','store','customer','SUCCESS','SUCCESS','PACKAGE_PURCHASE','CASH',5990,'2026-11-14T04:00:00Z','old-wallet');
    INSERT INTO "Transaction" VALUES ('today-sale','store','other','SUCCESS','SUCCESS','SINGLE_PURCHASE','CASH',13197,'2026-11-15T03:00:00Z',null);
    INSERT INTO "CashDrawerSession" VALUES ('closed','store','2026-11-14','CLOSED',now(),395085);
  `);
  h.splits.mockResolvedValue({ _sum: { amount: null } });
  h.aggregate.mockImplementation(async ({ where }) => {
    const result = await db.query<{ amount: string | null }>(`SELECT sum(amount)::text AS amount FROM "Transaction"
      WHERE "storeId"=$1 AND status=$2 AND "paymentStatus"=ANY($3) AND "transactionType"=ANY($4)
      AND "paymentMethod"=ANY($5) AND "transactionDate">=$6 AND "transactionDate"<=$7`,
    [where.storeId, where.status, where.paymentStatus.in, where.transactionType.in, where.paymentMethod.in,
      where.transactionDate.gte, where.transactionDate.lte]);
    return { _sum: { amount: new Prisma.Decimal(result.rows[0].amount ?? 0) } };
  });
});

function adapter() {
  return {
    $queryRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const sql = parts.reduce((text, part, i) => text + (i ? `$${i}` : "") + part, "");
      return (await db.query(sql, values)).rows;
    },
    transaction: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        (await db.query('SELECT * FROM "Transaction" WHERE id=$1', [where.id])).rows[0] ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        await db.query(`INSERT INTO "Transaction" VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [data.id, data.storeId, data.customerId, data.status ?? "SUCCESS", data.paymentStatus ?? "SUCCESS",
            data.transactionType, data.paymentMethod, data.amount, data.transactionDate, data.customerPlanWalletId]);
        return { id: data.id };
      },
    },
    transactionAuditLog: {
      findFirst: async ({ where }: { where: { transactionId: string; storeId: string } }) =>
        (await db.query('SELECT * FROM "TransactionAuditLog" WHERE "transactionId"=$1 AND "storeId"=$2',
          [where.transactionId, where.storeId])).rows[0] ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) =>
        db.query('INSERT INTO "TransactionAuditLog" ("transactionId","storeId","afterJson") VALUES ($1,$2,$3)',
          [data.transactionId, data.storeId, JSON.stringify(data.afterJson)]),
    },
  } as unknown as Prisma.TransactionClient;
}
async function replace(amount = 5990) {
  const tx = adapter();
  const context = await resolveTransactionReplacement(tx, input);
  if (context.existing) return context.existing.id;
  await createFinancialTransaction(tx, { data: {
    id: "replacement", storeId: "store", customerId: "customer", revenueStaffId: "staff",
    transactionType: "PACKAGE_PURCHASE", paymentMethod: "CASH", amount,
    transactionDate: context.source.transactionDate, customerPlanWalletId: "new-wallet",
  } }, { allowClosedReplacement: true });
  await recordTransactionReplacement(tx, { ...input, replacementId: "replacement", actorUserId: "manager" });
  return "replacement";
}

it("cancel then replace reconciles the original date and never adds another receipt to today's drawer", async () => {
  expect((await computeCashIncomeForSession({ storeId: "store", businessDate: oldDay })).toNumber()).toBe(5990);
  await db.exec(`UPDATE "Transaction" SET status='VOIDED' WHERE id='source'`);
  expect((await computeCashIncomeForSession({ storeId: "store", businessDate: oldDay })).toNumber()).toBe(0);
  await replace();
  expect((await computeCashIncomeForSession({ storeId: "store", businessDate: oldDay })).toNumber()).toBe(5990);
  const todayIncome = await computeCashIncomeForSession({ storeId: "store", businessDate: today });
  expect(todayIncome.toNumber()).toBe(13197);
  expect(todayIncome.add(395085).toNumber()).toBe(408282);
  expect((await db.query<{finalBookBalance:string}>('SELECT "finalBookBalance" FROM "CashDrawerSession"')).rows[0].finalBookBalance).toBe('395085');
  expect((await db.query<{transactionDate:Date}>('SELECT "transactionDate" FROM "Transaction" WHERE id=\'replacement\'')).rows[0].transactionDate).toEqual(originalDate);
});
it("retries return the same receipt and reject a second correction with different contents", async () => {
  await db.exec(`UPDATE "Transaction" SET status='VOIDED' WHERE id='source'`);
  await replace(); expect(await replace()).toBe("replacement");
  expect((await db.query<{n:number}>('SELECT count(*)::int AS n FROM "Transaction" WHERE id=\'replacement\'')).rows[0].n).toBe(1);
  await expect(resolveTransactionReplacement(adapter(), { ...input, fingerprint: "different" })).rejects.toThrow("已補登");
});
it("supports a different corrected fee without counting it as cash received today", async () => {
  await db.exec(`UPDATE "Transaction" SET status='VOIDED' WHERE id='source'`);
  await replace(11980);
  expect((await computeCashIncomeForSession({ storeId: "store", businessDate: oldDay })).toNumber()).toBe(11980);
  expect((await computeCashIncomeForSession({ storeId: "store", businessDate: today })).toNumber()).toBe(13197);
});
