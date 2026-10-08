import { expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

it("adds an enabled-by-default non-null flag and preserves independent stores and cutoffs", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "CourseBookingRule" ("storeId" TEXT PRIMARY KEY,"bookingLeadMinutes" INTEGER NOT NULL DEFAULT 0,"cancellationLeadMinutes" INTEGER NOT NULL DEFAULT 0);
      INSERT INTO "CourseBookingRule" VALUES ('sports',30,60),('music',120,180);`);
    await db.exec(readFileSync("prisma/migrations/20261008054000_course_student_self_booking/migration.sql","utf8"));
    expect((await db.query('SELECT * FROM "CourseBookingRule" ORDER BY "storeId"')).rows).toEqual([
      {storeId:"music",bookingLeadMinutes:120,cancellationLeadMinutes:180,selfBookingEnabled:true,selfBookingRevision:0},
      {storeId:"sports",bookingLeadMinutes:30,cancellationLeadMinutes:60,selfBookingEnabled:true,selfBookingRevision:0},
    ]);
    await db.exec(`UPDATE "CourseBookingRule" SET "selfBookingEnabled"=false WHERE "storeId"='sports'; INSERT INTO "CourseBookingRule" ("storeId") VALUES ('new');`);
    expect((await db.query('SELECT "storeId","selfBookingEnabled" FROM "CourseBookingRule" ORDER BY "storeId"')).rows).toEqual([
      {storeId:"music",selfBookingEnabled:true},{storeId:"new",selfBookingEnabled:true},{storeId:"sports",selfBookingEnabled:false},
    ]);
    await expect(db.exec(`UPDATE "CourseBookingRule" SET "selfBookingEnabled"=NULL WHERE "storeId"='music'`)).rejects.toThrow(/null/i);
  } finally { await db.close(); }
});
