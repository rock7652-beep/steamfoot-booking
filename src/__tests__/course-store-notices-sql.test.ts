import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import {afterAll,beforeAll,expect,it} from "vitest";
const db=new PGlite();
beforeAll(async()=>{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;
 CREATE TABLE "Store"(id text PRIMARY KEY);INSERT INTO "Store" VALUES ('a'),('b');
 CREATE TABLE "CourseBookingRule"("storeId" text PRIMARY KEY,"selfBookingEnabled" boolean NOT NULL DEFAULT true,"selfBookingRevision" integer NOT NULL DEFAULT 0);
 INSERT INTO "CourseBookingRule" VALUES ('a',false,3),('b',true,4);`);
 await db.exec(readFileSync('prisma/migrations/20261011100000_course_store_notice_center/migration.sql','utf8'));
});
afterAll(()=>db.close());
const add=(id:string,storeId='a',subject='booking:one')=>db.query(`INSERT INTO "CourseStoreNotice" (id,"storeId","subjectKey",kind,"customerName","courseName","coachName","startsAt",details) VALUES ($1,$2,$3,'LEAVE','虛構學員','吉他','虛構老師','2099-10-15T10:00:00+08:00','{}')`,[id,storeId,subject]);
it('preserves prior booking and rescheduling controls and defaults notices off',async()=>{
 const rows=(await db.query<Record<string,unknown>>('SELECT * FROM "CourseBookingRule" ORDER BY "storeId"')).rows;
 expect(rows[0]).toMatchObject({selfBookingEnabled:false,selfRescheduleEnabled:false,selfLeaveEnabled:true,backendNoticesEnabled:false,selfBookingRevision:3});
 expect(rows[1]).toMatchObject({selfBookingEnabled:true,selfRescheduleEnabled:true,backendNoticesEnabled:false});
});
it('isolates duplicate event keys per store and requires a real store',async()=>{
 await add('a1');await expect(add('a2')).rejects.toThrow();await add('b1','b');await expect(add('foreign','unknown')).rejects.toThrow();
});
it('rolls back a notification together with an aborted operation',async()=>{
 await db.exec('BEGIN');await add('rollback','a','booking:rollback');await db.exec('ROLLBACK');
 expect((await db.query('SELECT id FROM "CourseStoreNotice" WHERE id=\'rollback\'')).rows).toEqual([]);
});
it('rejects incomplete handled states and uses revisions for competing updates',async()=>{
 await expect(db.exec(`UPDATE "CourseStoreNotice" SET "handledAt"=NOW() WHERE id='a1'`)).rejects.toThrow();
 const first=await db.query(`UPDATE "CourseStoreNotice" SET "handledAt"=NOW(),"handledById"='u',"handledByName"='店員',revision=revision+1 WHERE id='a1' AND "storeId"='a' AND revision=0 RETURNING id`);
 const stale=await db.query(`UPDATE "CourseStoreNotice" SET "handledAt"=NULL,"handledById"=NULL,"handledByName"=NULL,revision=revision+1 WHERE id='a1' AND "storeId"='a' AND revision=0 RETURNING id`);
 expect(first.rows).toHaveLength(1);expect(stale.rows).toHaveLength(0);
});
it('denies browser roles direct access and enables RLS',async()=>{
 const row=(await db.query<{rls:boolean;browser:boolean}>(`SELECT c.relrowsecurity AS rls,has_table_privilege('authenticated','"CourseStoreNotice"','SELECT') AS browser FROM pg_class c WHERE c.oid='"CourseStoreNotice"'::regclass`)).rows[0];
 expect(row).toEqual({rls:true,browser:false});
});
