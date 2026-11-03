/** Embedded schema coverage only; native PostgreSQL race tests run separately. */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("nullable migration preserves native values and restricts null to marked opening cards", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "Store"(id text,slug text,"industryModule" text);
      INSERT INTO "Store" VALUES('store-lubymusic','lubymusic','COURSE');
      CREATE TABLE "CourseMusicOpeningState"(id text);
      CREATE TABLE "CoursePointCard"(id text PRIMARY KEY,"musicOpeningStateRequired" boolean NOT NULL DEFAULT false,
        unit text NOT NULL,"musicValidityDays" int,"musicActivatedAt" timestamptz,"expiresAt" timestamptz NOT NULL);
      INSERT INTO "CoursePointCard" VALUES('native-finite',false,'SESSION',35,NULL,'2099-12-31T15:59:59.999Z');`);
    await db.exec(readFileSync("docs/sql/music-opening-no-expiry-20261010.sql", "utf8"));
    expect((await db.query<{ expiry: string }>('SELECT "expiresAt"::text expiry FROM "CoursePointCard" WHERE id=\'native-finite\'')).rows[0].expiry).toContain("2099-12-31");
    await expect(db.exec(`INSERT INTO "CoursePointCard" VALUES('invalid-native',false,'SESSION',NULL,'2026-09-01',NULL)`)).rejects.toThrow();
    await expect(db.exec(`INSERT INTO "CoursePointCard" VALUES('invalid-unactivated',true,'SESSION',NULL,NULL,NULL)`)).rejects.toThrow();
    await expect(db.exec(`INSERT INTO "CoursePointCard" VALUES('invalid-finite-rule',true,'SESSION',35,'2026-09-01',NULL)`)).rejects.toThrow();
    await db.exec(`INSERT INTO "CoursePointCard" VALUES('synthetic-opening',true,'SESSION',NULL,'2026-09-01',NULL)`);
    expect((await db.query('SELECT id FROM "CoursePointCard" WHERE "expiresAt" IS NULL')).rows).toEqual([{ id: "synthetic-opening" }]);
    // A populated null cannot be rolled back to NOT NULL by inventing a date.
    await expect(db.exec('ALTER TABLE "CoursePointCard" ALTER COLUMN "expiresAt" SET NOT NULL')).rejects.toThrow();
  } finally { await db.close(); }
}, 20_000);
