import { expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
it("new row reads count synthetic occupancy, exclude other stores and do not grant writes", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE steamfoot_ai_preview_20261125 NOINHERIT NOCREATEDB NOCREATEROLE NOBYPASSRLS CONNECTION LIMIT 8;
      CREATE TABLE "Store"(id text,"isDemo" boolean,"industryModule" text);
      INSERT INTO "Store" VALUES ('ai-preview-steamfoot',true,'STEAMFOOT');
      CREATE TABLE "Booking"("storeId" text,people integer);
      CREATE TABLE "DutyAssignment"("storeId" text,"slotTime" text);
      ALTER TABLE "Booking" ENABLE ROW LEVEL SECURITY; ALTER TABLE "DutyAssignment" ENABLE ROW LEVEL SECURITY;
      GRANT SELECT ON "Booking","DutyAssignment" TO steamfoot_ai_preview_20261125;
      INSERT INTO "Booking" VALUES ('ai-preview-steamfoot',2),('ai-preview-music',5),('foreign-store',99);
      INSERT INTO "DutyAssignment" VALUES ('ai-preview-steamfoot','13:00'),('ai-preview-music','14:00'),('foreign-store','15:00');
      SET ROLE steamfoot_ai_preview_20261125;`);
    expect((await db.query('SELECT * FROM "Booking"')).rows).toEqual([]);
    await db.exec('RESET ROLE');
    await db.exec(readFileSync('scripts/sql/ai-digital-butler/preview-availability.sql','utf8'));
    await db.exec('SET ROLE steamfoot_ai_preview_20261125');
    expect((await db.query('SELECT sum(people)::int AS occupied FROM "Booking"')).rows).toEqual([{ occupied: 2 }]);
    expect((await db.query('SELECT "slotTime" FROM "DutyAssignment"')).rows).toEqual([{ slotTime: '13:00' }]);
    expect((await db.query('SELECT * FROM "Booking" WHERE "storeId"=\'foreign-store\'')).rows).toEqual([]);
    for (const statement of ['INSERT INTO "Booking" VALUES (\'ai-preview-steamfoot\',1)', 'UPDATE "Booking" SET people=0', 'DELETE FROM "Booking"']) {
      await expect(db.exec(statement)).rejects.toThrow(/permission denied/);
    }
    await db.exec('RESET ROLE; DROP POLICY ai_preview_availability_read ON "Booking"; DROP POLICY ai_preview_availability_read ON "DutyAssignment"; SET ROLE steamfoot_ai_preview_20261125;');
    expect((await db.query('SELECT * FROM "Booking"')).rows).toEqual([]);
    expect((await db.query('SELECT * FROM "DutyAssignment"')).rows).toEqual([]);
  } finally { await db.close(); }
}, 30_000);
