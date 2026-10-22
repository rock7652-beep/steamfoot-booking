import { expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

it("migration enforces store ownership, deduplication, and browser-role isolation", async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE "Store" (id TEXT PRIMARY KEY, "operatingStatus" TEXT DEFAULT \'ACTIVE\', "isDemo" BOOLEAN DEFAULT false, "archivedAt" TIMESTAMP); INSERT INTO "Store" VALUES (\'a\'), (\'b\');');
    await db.exec(await readFile("prisma/migrations/20261022090000_line_quota_email_alerts/migration.sql", "utf8"));
    expect((await db.query<{ enabled: boolean }>('SELECT enabled FROM "LineQuotaSetting"')).rows).toEqual([{ enabled: true }, { enabled: true }]);
    await db.exec(`UPDATE "LineQuotaSetting" SET "updatedAt"=now() WHERE "storeId"='a';
      INSERT INTO "LineQuotaAlert" (id,"storeId","eventKey",email,subject,body) VALUES ('alert-a','a','STORE:2026-10:80','owner@example.com','test','test');`);
    await expect(db.exec(`INSERT INTO "LineQuotaAlert" (id,"storeId","eventKey",email,subject,body) VALUES ('duplicate','a','STORE:2026-10:80','owner@example.com','test','test')`)).rejects.toThrow(/unique/);
    const rls = await db.query<{ relrowsecurity: boolean }>(`SELECT relrowsecurity FROM pg_class WHERE relname IN ('LineQuotaSetting','LineQuotaAlert')`);
    expect(rls.rows).toHaveLength(2); expect(rls.rows.every(row => row.relrowsecurity)).toBe(true);
    const grants = await db.query<{ allowed: boolean }>(`SELECT has_table_privilege('anon','"LineQuotaSetting"','SELECT') OR has_table_privilege('authenticated','"LineQuotaAlert"','INSERT') AS allowed`);
    expect(grants.rows[0].allowed).toBe(false);
    await db.exec(`DELETE FROM "Store" WHERE id='a'`);
    expect((await db.query('SELECT * FROM "LineQuotaAlert"')).rows).toHaveLength(0);
  } finally { await db.close(); }
}, 30000);
