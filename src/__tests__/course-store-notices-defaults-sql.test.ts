import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("enables existing stores, defaults new rules on, and preserves unrelated controls and later opt-outs", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "CourseBookingRule" (
      "storeId" text PRIMARY KEY,
      "backendNoticesEnabled" boolean NOT NULL DEFAULT false,
      "selfBookingEnabled" boolean NOT NULL DEFAULT true,
      "selfRescheduleEnabled" boolean NOT NULL DEFAULT true,
      "selfLeaveEnabled" boolean NOT NULL DEFAULT true,
      "selfBookingRevision" integer NOT NULL DEFAULT 0
    );
    INSERT INTO "CourseBookingRule" VALUES ('disabled',false,false,false,false,3),('enabled',true,true,true,true,4);`);
    await db.exec(readFileSync("prisma/migrations/20261020110000_enable_backend_notices_by_default/migration.sql", "utf8"));
    const rows = (await db.query('SELECT * FROM "CourseBookingRule" ORDER BY "storeId"')).rows;
    expect(rows).toEqual([
      { storeId: "disabled", backendNoticesEnabled: true, selfBookingEnabled: false, selfRescheduleEnabled: false, selfLeaveEnabled: false, selfBookingRevision: 3 },
      { storeId: "enabled", backendNoticesEnabled: true, selfBookingEnabled: true, selfRescheduleEnabled: true, selfLeaveEnabled: true, selfBookingRevision: 4 },
    ]);
    await db.exec(`INSERT INTO "CourseBookingRule" ("storeId") VALUES ('new');`);
    expect((await db.query('SELECT "backendNoticesEnabled" FROM "CourseBookingRule" WHERE "storeId"=\'new\'')).rows).toEqual([{ backendNoticesEnabled: true }]);
    await db.exec(`UPDATE "CourseBookingRule" SET "backendNoticesEnabled"=false WHERE "storeId"='new';`);
    expect((await db.query('SELECT "backendNoticesEnabled" FROM "CourseBookingRule" WHERE "storeId"=\'new\'')).rows).toEqual([{ backendNoticesEnabled: false }]);
  } finally {
    await db.close();
  }
});
