import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: h.transaction } }));
import { unlinkCustomerLine } from "@/server/services/customer-line-unlink";
let db: PGlite;
let failAudit = false;
beforeEach(async () => {
  failAudit = false;
  db = new PGlite();
  await db.exec(`
    CREATE TABLE "Customer" (id text PRIMARY KEY, "storeId" text, "mergedIntoCustomerId" text, "lineUserId" text, "lineLinkStatus" text);
    CREATE TABLE "CustomerIdentityLink" ("customerId" text, "storeId" text, provider text);
    CREATE TABLE "StoreMemberConnection" ("customerId" text, "storeId" text, "channelKey" text, status text);
    CREATE TABLE "LineRebindRequest" (id text PRIMARY KEY, "customerId" text, "storeId" text, status text, "cancelledByUserId" text, "cancelledAt" timestamp);
    CREATE TABLE "LineRebindCandidate" ("requestId" text);
    CREATE TABLE history (kind text, "customerId" text, amount int);
    INSERT INTO "Customer" VALUES ('a','store-a',NULL,'old-a','LINKED'), ('b','store-a',NULL,'old-b','BLOCKED'), ('c','store-b',NULL,'old-c','LINKED');
    INSERT INTO "CustomerIdentityLink" VALUES ('a','store-a','line'),('a','store-a','line-provider:123'),('a','store-a','line-messaging:123'),('a','store-a','google'),('b','store-a','line'),('c','store-b','line');
    INSERT INTO "StoreMemberConnection" VALUES ('a','store-a','channel','APPROVED'),('a','store-a','login:channel','PENDING'),('b','store-a','channel','APPROVED'),('c','store-b','channel','APPROVED');
    INSERT INTO "LineRebindRequest" VALUES ('r-a','a','store-a','CANDIDATE_CAPTURED',NULL,NULL),('r-b','b','store-a','PENDING_CAPTURE',NULL,NULL);
    INSERT INTO "LineRebindCandidate" VALUES ('r-a'),('r-b');
    INSERT INTO history VALUES ('booking','a',3),('plan','a',10),('consumption','a',500),('booking','b',2);
  `);
  h.transaction.mockImplementation(async (callback, options) => {
    expect(options.isolationLevel).toBe("Serializable");
    return db.transaction(async sql => callback({
      $queryRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => {
        const query = parts.reduce((text, part, i) => text + part + (i < values.length ? `$${i + 1}` : ""), "");
        return (await sql.query(query, values)).rows;
      },
      customerIdentityLink: { deleteMany: async ({ where }: { where: { customerId: string; storeId: string } }) => sql.query('DELETE FROM "CustomerIdentityLink" WHERE "customerId"=$1 AND "storeId"=$2 AND (provider=$3 OR provider LIKE $4 OR provider LIKE $5)', [where.customerId, where.storeId, 'line', 'line-provider:%', 'line-messaging:%']) },
      storeMemberConnection: { updateMany: async ({ where }: { where: { customerId: string; storeId: string } }) => sql.query('UPDATE "StoreMemberConnection" SET status=$1 WHERE "customerId"=$2 AND "storeId"=$3 AND status IN ($4,$5) AND "channelKey" NOT LIKE $6', ['REJECTED', where.customerId, where.storeId, 'PENDING', 'APPROVED', 'login:%']) },
      lineRebindCandidate: { deleteMany: async ({ where }: { where: { requestId: { in: string[] } } }) => sql.query('DELETE FROM "LineRebindCandidate" WHERE "requestId"=ANY($1)', [where.requestId.in]) },
      lineRebindRequest: { updateMany: async ({ where, data }: { where: { id: { in: string[] }; customerId: string; storeId: string }; data: { status: string; cancelledAt: Date; cancelledByUserId: string } }) => sql.query('UPDATE "LineRebindRequest" SET status=$1,"cancelledAt"=$2,"cancelledByUserId"=$3 WHERE id=ANY($4) AND "customerId"=$5 AND "storeId"=$6', [data.status, data.cancelledAt, data.cancelledByUserId, where.id.in, where.customerId, where.storeId]) },
      customer: { update: async ({ where, data }: { where: { id: string; storeId: string }; data: { lineUserId: string | null; lineLinkStatus: string } }) => sql.query('UPDATE "Customer" SET "lineUserId"=$1,"lineLinkStatus"=$2 WHERE id=$3 AND "storeId"=$4', [data.lineUserId, data.lineLinkStatus, where.id, where.storeId]) },
      auditLog: { create: async () => { if (failAudit) throw new Error("audit unavailable"); } },
    }));
  });
});
afterEach(async () => db.close());
const input = { customerId: "a", storeId: "store-a", actorUserId: "owner" };
async function snapshot() {
  return Promise.all(['"Customer"', '"CustomerIdentityLink"', '"LineRebindRequest"', '"LineRebindCandidate"', 'history', '"StoreMemberConnection"'].map(async table => (await db.query<Record<string, unknown>>(`SELECT * FROM ${table} ORDER BY 1`)).rows));
}
it("unlinks only A, revokes its candidate, and preserves other identities and all business history", async () => {
  const before = await snapshot();
  await unlinkCustomerLine(input);
  const after = await snapshot();
  expect(after[0]).toEqual([{ id: "a", storeId: "store-a", mergedIntoCustomerId: null, lineUserId: null, lineLinkStatus: "UNLINKED" }, ...before[0].slice(1)]);
  expect(after[1]).toEqual(before[1].filter(row => !(row.customerId === "a" && String(row.provider).startsWith("line"))));
  expect(after[2][0]).toMatchObject({ id: "r-a", status: "CANCELLED", cancelledByUserId: "owner" });
  expect(after[2][1]).toEqual(before[2][1]);
  expect(after[3]).toEqual([{ requestId: "r-b" }]);
  expect(after[4]).toEqual(before[4]);
  expect(after[5]).toEqual(expect.arrayContaining(before[5].map(row => row.customerId === "a" && row.channelKey === "channel" ? { ...row, status: "REJECTED" } : row)));
  expect(after[5]).toHaveLength(before[5].length);
});
it("rolls back main record, identity, request and candidate when a late write fails", async () => {
  const before = await snapshot();
  failAudit = true;
  await expect(unlinkCustomerLine(input)).rejects.toThrow("audit unavailable");
  expect(await snapshot()).toEqual(before);
});
it("rejects stale cross-store input without changing any records", async () => {
  const before = await snapshot();
  await expect(unlinkCustomerLine({ ...input, storeId: "store-b" })).rejects.toThrow();
  expect(await snapshot()).toEqual(before);
});
