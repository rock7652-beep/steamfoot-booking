import {PGlite} from "@electric-sql/pglite";
import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
it("migrates existing rows as open and validates new assigned-series snapshots",async()=>{
 const db=new PGlite();
 try{
 await db.exec('CREATE TABLE "CourseSession" (id text PRIMARY KEY); CREATE TABLE "CourseScheduleSeries" (id text PRIMARY KEY); INSERT INTO "CourseSession" VALUES (\'old\'); INSERT INTO "CourseScheduleSeries" VALUES (\'old\');');
 await db.exec(readFileSync("supabase/migrations/20261013195301_music_schedule_enrollment.sql","utf8"));
 expect((await db.query('SELECT "enrollmentMode" FROM "CourseSession" WHERE id=\'old\'')).rows).toEqual([{enrollmentMode:"OPEN"}]);
 await db.exec('INSERT INTO "CourseScheduleSeries" (id,"enrollmentMode","learnerSnapshot") VALUES (\'assigned\',\'ASSIGNED\',\'[{"customerId":"a"}]\');');
 expect((await db.query('SELECT "learnerSnapshot" FROM "CourseScheduleSeries" WHERE id=\'assigned\'')).rows).toEqual([{learnerSnapshot:[{customerId:"a"}]}]);
 await expect(db.exec('INSERT INTO "CourseSession" (id,"enrollmentMode") VALUES (\'bad\',\'OTHER\');')).rejects.toThrow();
 await expect(db.exec('UPDATE "CourseScheduleSeries" SET "learnerSnapshot"=\'{}\' WHERE id=\'old\';')).rejects.toThrow();
 }finally{await db.close();}
});
