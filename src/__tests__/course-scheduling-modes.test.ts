import {expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {courseSchedulingModes,courseSchedulingModeAllowed} from "@/lib/course-scheduling-modes";
import {assertCourseSchedulingMode} from "@/server/services/course-scheduling-modes";
import {PGlite} from "@electric-sql/pglite";
import {readFileSync} from "node:fs";
it("legacy defaults preserve self-booking and staff assignment independently",()=>{
 expect(courseSchedulingModes(null)).toEqual({open:true,assigned:true});
 expect(courseSchedulingModes({selfBookingEnabled:false})).toEqual({open:false,assigned:true});
});
it.each([[true,true],[true,false],[false,true],[false,false]])("checks both independent scheduling modes: %s/%s",(open,assigned)=>{
 const rule={selfBookingEnabled:open,assignedSchedulingEnabled:assigned};
 expect(courseSchedulingModeAllowed(rule,"OPEN")).toBe(open);expect(courseSchedulingModeAllowed(rule,"ASSIGNED")).toBe(assigned);
 for(const mode of ["OPEN","ASSIGNED"] as const){if(courseSchedulingModeAllowed(rule,mode))expect(()=>assertCourseSchedulingMode(rule,mode)).not.toThrow();else expect(()=>assertCourseSchedulingMode(rule,mode)).toThrow("已關閉");}
});
it("additive migration retains all old controls, revisions and records",async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE "CourseBookingRule"("storeId" text PRIMARY KEY,"selfBookingEnabled" boolean NOT NULL,"selfBookingRevision" int NOT NULL,"selfLeaveEnabled" boolean NOT NULL,"selfRescheduleEnabled" boolean NOT NULL);INSERT INTO "CourseBookingRule" VALUES ('a',false,7,true,false),('b',true,9,false,true);CREATE TABLE "CourseBooking"(id text PRIMARY KEY);INSERT INTO "CourseBooking" VALUES ('retained');`);
 const before=(await db.query<Record<string,unknown>>('SELECT * FROM "CourseBookingRule" ORDER BY "storeId"')).rows;
 const sql=readFileSync('prisma/migrations/20261024140000_course_scheduling_modes/migration.sql','utf8');await db.exec(sql);await db.exec(sql);
 const rows=(await db.query<Record<string,unknown>>('SELECT * FROM "CourseBookingRule" ORDER BY "storeId"')).rows;
 rows.forEach((row,i)=>{const {assignedSchedulingEnabled,...rest}=row;expect(assignedSchedulingEnabled).toBe(true);expect(rest).toEqual(before[i]);});
 expect((await db.query('SELECT * FROM "CourseBooking"')).rows).toEqual([{id:'retained'}]);
 }finally{await db.close();}
});
