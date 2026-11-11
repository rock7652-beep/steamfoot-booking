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
it('subject-scoped plans work with either enrollment mode while old unscoped products require review',async()=>{
 const {coursePlanModeAllowed}=await import('@/lib/course-scheduling-modes');
 expect(coursePlanModeAllowed({selfBookingEnabled:true,assignedSchedulingEnabled:false},'ASSIGNED')).toBe(true);
 expect(coursePlanModeAllowed({selfBookingEnabled:false,assignedSchedulingEnabled:true},'ASSIGNED')).toBe(true);
 expect(coursePlanModeAllowed({selfBookingEnabled:false,assignedSchedulingEnabled:false},'ASSIGNED')).toBe(false);
 expect(coursePlanModeAllowed({selfBookingEnabled:true,assignedSchedulingEnabled:true},'OPEN')).toBe(false);
});
it('multi-subject plans obey the same current store scheduling gate on client and server',async()=>{
 const {coursePlanModeAllowed}=await import('@/lib/course-scheduling-modes');
 const {assertCoursePlanMode}=await import('@/server/services/course-scheduling-modes');
 for(const [open,assigned] of [[true,true],[true,false],[false,true],[false,false]]){
  const rule={selfBookingEnabled:open,assignedSchedulingEnabled:assigned};
  const tx={courseBookingRule:{findUnique:async()=>rule}};
  expect(coursePlanModeAllowed(rule,'SUBJECTS')).toBe(open||assigned);
  if(open||assigned)await expect(assertCoursePlanMode(tx,'store','SUBJECTS')).resolves.toBeUndefined();
  else await expect(assertCoursePlanMode(tx,'store','SUBJECTS')).rejects.toThrow('尚未開放排課');
 }
});
