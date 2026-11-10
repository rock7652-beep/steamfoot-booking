import { afterEach, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const migration = readFileSync(new URL("../../prisma/migrations/20261110095649_course_phone_view_grant/migration.sql", import.meta.url), "utf8");
let db: PGlite;
// PGlite's first WASM boot can exceed Vitest's 5s default on shared runners.
vi.setConfig({ testTimeout: 20000 });
afterEach(async () => { await db?.close(); });
async function setup() {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;
    CREATE TABLE "Store" (id text PRIMARY KEY);
    CREATE TABLE "User" (id text PRIMARY KEY);
    CREATE TABLE "Customer" (id text PRIMARY KEY, "storeId" text NOT NULL, name text, phone text,
      "contactPhone" text, "userId" text, "lineUserId" text, "googleId" text, "mergedIntoCustomerId" text,
      UNIQUE(id,"storeId"));
    CREATE TABLE "CustomerIdentityLink" (id text PRIMARY KEY, "storeId" text, "customerId" text, "providerAccountId" text, "userId" text, provider text, "lineUserId" text, "updatedAt" timestamptz);
    INSERT INTO "Store" VALUES ('store'), ('other');
    INSERT INTO "User" VALUES ('member'), ('manager');
    INSERT INTO "Customer" (id,"storeId",name,phone,"userId") VALUES ('anchor','store','孩子 A','0912345678','member'), ('foreign','other','其他店','0912345678',NULL);
    INSERT INTO "CustomerIdentityLink" (id,"storeId","customerId","providerAccountId","userId",provider,"lineUserId") VALUES ('link','store','anchor','line-a','member','line','line-a');
  `);
  await db.exec(migration);
  await db.exec(`INSERT INTO "CoursePhoneViewGrant" (id,"storeId","userId","anchorCustomerId",phone,"confirmedByUserId","updatedAt") VALUES ('grant','store','member','anchor','0912345678','manager',CURRENT_TIMESTAMP)`);
}
it("enforces tenant FKs, phone format, unique grants and private Data API access", async () => {
  await setup();
  await expect(db.exec(`UPDATE "CoursePhoneViewGrant" SET "storeId"='other' WHERE id='grant'`)).rejects.toMatchObject({ code: "23503" });
  await expect(db.exec(`UPDATE "CoursePhoneViewGrant" SET phone='invalid' WHERE id='grant'`)).rejects.toMatchObject({ code: "23514" });
  await expect(db.exec(`INSERT INTO "CoursePhoneViewGrant" SELECT 'duplicate',"storeId","userId","anchorCustomerId",phone,"confirmedByUserId","confirmedAt","revokedAt","createdAt","updatedAt" FROM "CoursePhoneViewGrant"`)).rejects.toMatchObject({ code: "23505" });
  expect((await db.query(`SELECT relrowsecurity FROM pg_class WHERE relname='CoursePhoneViewGrant'`)).rows).toEqual([{ relrowsecurity: true }]);
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`SET ROLE ${role}`);
    await expect(db.query(`SELECT * FROM "CoursePhoneViewGrant"`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec(`UPDATE "CoursePhoneViewGrant" SET "revokedAt"=NULL`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.query(`SELECT revoke_course_phone_view_on_customer_change()`)).rejects.toMatchObject({ code: "42501" });
    await db.exec(`RESET ROLE`);
  }
});
it("keeps normal name edits valid but permanently revokes after phone changes away and back", async () => {
  await setup();
  await db.exec(`UPDATE "Customer" SET name='孩子 A 正名' WHERE id='anchor'`);
  expect((await db.query(`SELECT "revokedAt" FROM "CoursePhoneViewGrant"`)).rows).toEqual([{ revokedAt: null }]);
  await db.exec(`UPDATE "Customer" SET phone='0987654321' WHERE id='anchor'; UPDATE "Customer" SET phone='0912345678' WHERE id='anchor'`);
  expect((await db.query<{ revoked: boolean }>(`SELECT "revokedAt" IS NOT NULL AS revoked FROM "CoursePhoneViewGrant"`)).rows[0].revoked).toBe(true);
});
it.each(["UPDATE \"CustomerIdentityLink\" SET \"providerAccountId\"='line-b'", "DELETE FROM \"CustomerIdentityLink\""])("revokes family display on Login identity changes: %s", async sql => {
  await setup(); await db.exec(sql);
  expect((await db.query<{ revoked: boolean }>(`SELECT "revokedAt" IS NOT NULL AS revoked FROM "CoursePhoneViewGrant"`)).rows[0].revoked).toBe(true);
});
it("preserves approval through normal Login identity syncs and repeated sign-ins", async () => {
  await setup();
  await db.exec(`UPDATE "CustomerIdentityLink" SET "updatedAt"=CURRENT_TIMESTAMP, "providerAccountId"='line-a', "lineUserId"='line-a' WHERE id='link'`);
  expect((await db.query(`SELECT "revokedAt" FROM "CoursePhoneViewGrant"`)).rows).toEqual([{ revokedAt: null }]);
});
