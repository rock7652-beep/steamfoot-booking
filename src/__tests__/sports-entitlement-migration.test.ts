import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("sports entitlement additive migration in isolated PostgreSQL", () => {
  it("preserves historical values and rejects inconsistent rights on all three tables", async () => {
    const db = new PGlite();
    try {
      const tables = ["CoursePointPlan", "CoursePurchase", "CoursePointCard"];
      for (const table of tables) {
        await db.exec(`CREATE TABLE "${table}" (id text PRIMARY KEY, unit text, remaining integer);
          INSERT INTO "${table}" VALUES ('old', 'POINT', 17);`);
      }
      await db.exec(readFileSync("scripts/sql/sports-entitlement-candidate.sql", "utf8"));
      for (const table of tables) {
        const old = await db.query(`SELECT * FROM "${table}" WHERE id='old'`);
        expect(old.rows).toEqual([{ id: "old", unit: "POINT", remaining: 17, sportsMode: "LEGACY", sportsSubjectId: null, sportsCost: null }]);
        await db.query(`INSERT INTO "${table}" (id,unit,"sportsMode","sportsSubjectId","sportsCost") VALUES ('assigned','POINT','ASSIGNED','yoga',2)`);
        await db.query(`INSERT INTO "${table}" (id,unit,"sportsMode") VALUES ('open','POINT','OPEN')`);
        for (const [mode, subject, cost, unit] of [
          ["UNKNOWN", null, null, "POINT"], ["ASSIGNED", null, 2, "POINT"],
          ["ASSIGNED", "yoga", null, "POINT"], ["ASSIGNED", "yoga", 0, "POINT"],
          ["ASSIGNED", "yoga", 2, "SESSION"], ["OPEN", "yoga", null, "POINT"],
          ["LEGACY", null, 2, "POINT"],
        ]) {
          await expect(db.query(`INSERT INTO "${table}" (id,unit,"sportsMode","sportsSubjectId","sportsCost") VALUES ('invalid',$1,$2,$3,$4)`, [unit, mode, subject, cost])).rejects.toThrow();
        }
      }
      // Reapplying is rejected, not silently accepted against an unknown schema.
      await expect(db.exec(readFileSync("scripts/sql/sports-entitlement-candidate.sql", "utf8"))).rejects.toThrow();
      await db.exec("ROLLBACK");
      expect((await db.query('SELECT count(*)::int AS n FROM "CoursePointCard"')).rows).toEqual([{ n: 3 }]);
    } finally {
      await db.close();
    }
  }, 30000);
});
