import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";
const sql = readFileSync("prisma/migrations/20261018070000_verified_login_until_used/migration.sql", "utf8");
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE "User"(id text PRIMARY KEY,status text,role text);
    CREATE TABLE "Customer"(id text PRIMARY KEY,"storeId" text,"userId" text,phone text,"mergedIntoCustomerId" text);
    CREATE TABLE "Account"("userId" text,provider text,"providerAccountId" text);
    CREATE TABLE "CustomerIdentityLink"("customerId" text,"storeId" text,"userId" text,provider text,"providerAccountId" text,"lineUserId" text);
    CREATE TABLE "LineRebindRequest"(id text PRIMARY KEY,"storeId" text,"customerId" text,"createdByUserId" text,reason text,status text,"phoneHash" text,"oldUserIdHash" text,"expiresAt" timestamp,"consumedAt" timestamp,"updatedAt" timestamp);
    CREATE TABLE "AuditLog"(id text PRIMARY KEY,"actorUserId" text,source text,"storeId" text,"targetType" text,"targetId" text,action text,"afterJson" jsonb,"createdAt" timestamp);
  `);
  for (const kind of ["reviewed", "generic", "unreviewed", "cancelled", "consumed", "changed-phone", "changed-login", "first-capture"]) {
    await db.query(`INSERT INTO "User" VALUES($1,'ACTIVE','CUSTOMER')`, [kind]);
    await db.query(`INSERT INTO "Customer" VALUES($1,$1,$1,$2,NULL)`, [kind, kind === "changed-phone" ? "0999999999" : "0912345678"]);
    if (kind !== "first-capture") {
      const subject = kind === "changed-login" ? "changed" : "old";
      await db.query(`INSERT INTO "Account" VALUES($1,'line',$2)`, [kind, subject]);
      await db.query(`INSERT INTO "CustomerIdentityLink" VALUES($1,$1,$1,'line',$2,$2)`, [kind, subject]);
    }
    const reason = kind === "generic" ? "LIFF_LOGIN_CHANNEL_MIGRATION_V1" :
      (kind === "first-capture" ? "LIFF_LOGIN_FIRST_CAPTURE_V1" : "LIFF_LOGIN_CHANNEL_MIGRATION_V1") + ":verified:" + "a".repeat(64);
    await db.query(`INSERT INTO "LineRebindRequest" VALUES($1,$1,$1,'authorizer',$2,$3,
      encode(sha256(convert_to('0912345678','UTF8')),'hex'),$4,'2000-01-01',$5,'2000-01-01')`,
      [kind, reason, kind === "cancelled" ? "CANCELLED" : kind === "consumed" ? "CONSUMED" : "PENDING_CAPTURE",
        kind === "first-capture" ? null : (await db.query<{ hash: string }>(`SELECT encode(sha256(convert_to('old','UTF8')),'hex') AS hash`)).rows[0].hash,
        kind === "consumed" ? new Date() : null]);
    if (kind !== "unreviewed") await db.query(`INSERT INTO "AuditLog"(id,"targetId",action) VALUES($1,$2,'AUTHORIZE_VERIFIED_LIFF_LOGIN_RECOVERY')`, ["approval-" + kind, kind]);
  }
  await db.exec(sql);
}, 30_000);
afterAll(async () => { await db.close(); });
it("upgrades only audited exact approvals with unchanged phone/owner/Login snapshots", async () => {
  const rows = (await db.query<{ id: string; untilUsed: boolean }>(`SELECT id,"untilUsed" FROM "LineRebindRequest" ORDER BY id`)).rows;
  expect(rows.filter(r => r.untilUsed).map(r => r.id)).toEqual(["first-capture", "reviewed"]);
  const audit = await db.query(`SELECT * FROM "AuditLog" WHERE action='VERIFIED_LOGIN_RECOVERY_UNTIL_USED'`);
  expect(audit.rows).toHaveLength(2);
});
it("is idempotent and does not duplicate audit rows", async () => {
  await db.exec(sql);
  expect((await db.query(`SELECT * FROM "AuditLog" WHERE action='VERIFIED_LOGIN_RECOVERY_UNTIL_USED'`)).rows).toHaveLength(2);
});
it("rejects setting indefinite authorization on a generic unpinned request", async () => {
  await expect(db.exec(`UPDATE "LineRebindRequest" SET "untilUsed"=true WHERE id='generic'`)).rejects.toThrow(/line_rebind_until_used_verified_only/);
});
