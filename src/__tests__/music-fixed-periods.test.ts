import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { musicLessonSlots, nextMusicLessonSlot } from '@/lib/music-lesson-periods';
const db = new PGlite();
const insert = (id: string, period: number, ordinal: number, source: string | null = null) => db.query(`INSERT INTO "CourseMusicLessonAssignment"("bookingId","storeId","cardId","customerId",period,ordinal,kind,"sourceBookingId") VALUES($1,'store-lubymusic','card','student',$2,$3,$4,$5)`,[id,period,ordinal,source?'MAKEUP':'REGULAR',source]);
beforeAll(async()=>{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE TABLE "Store"(id text PRIMARY KEY,slug text);
 CREATE TABLE "MusicOperationalArchive"("batchId" text,"storeId" text,"entityType" text,"rowKey" text);
 CREATE TABLE "CourseBookingRule"("storeId" text);
 CREATE TABLE "Customer"(id text,"storeId" text,UNIQUE(id,"storeId"));
 CREATE TABLE "CoursePointCard"(id text,"storeId" text,"musicTermSizes" int[],"musicBonusLessons" int,"musicOpeningStateRequired" boolean,"requestKey" text,UNIQUE(id,"storeId"));
 CREATE TABLE "CourseBooking"(id text,"storeId" text,"cardId" text,"customerId" text,status text,"absenceKind" text,"makeupForBookingId" text,UNIQUE(id,"storeId"));
 INSERT INTO "Store" VALUES('store-lubymusic','lubymusic');
 INSERT INTO "MusicOperationalArchive" VALUES('music-operational-retirement-20261023','store-lubymusic','sentinel','sealed');
 INSERT INTO "Customer" VALUES('student','store-lubymusic'),('other','other-store');
 INSERT INTO "CoursePointCard" VALUES('card','store-lubymusic',ARRAY[2,2],1,false,'purchase');
 INSERT INTO "CourseBooking" SELECT x,'store-lubymusic','card','student','RESERVED',NULL,NULL FROM unnest(ARRAY['first','second','replacement','out-of-range','foreign','archived','makeup','wrong-makeup']) x;
 UPDATE "CourseBooking" SET "makeupForBookingId"='second' WHERE id IN ('makeup','wrong-makeup');`);
 await db.exec(readFileSync('scripts/music-fixed-periods.sql','utf8'));
});
afterAll(()=>db.close());
it('uses purchase snapshots and chooses a released slot without renumbering occupied lessons',()=>{
 expect(musicLessonSlots([2,1],1)).toEqual([{period:1,ordinal:1,bonus:false},{period:1,ordinal:2,bonus:false},{period:2,ordinal:1,bonus:false},{period:3,ordinal:1,bonus:true}]);
 expect(nextMusicLessonSlot([2,2],0,[{period:1,ordinal:2,bonus:false}])).toEqual({period:1,ordinal:1,bonus:false});
 expect(musicLessonSlots([0])).toEqual([]);
});
it('cancels only the original allocation and preserves later fixed identities',async()=>{
 await insert('first',1,1);await insert('second',1,2);
 await db.exec(`UPDATE "CourseBooking" SET status='CANCELLED' WHERE id='first'`);
 expect((await db.query(`SELECT period,ordinal,"releasedAt" IS NOT NULL released FROM "CourseMusicLessonAssignment" WHERE "bookingId"='first'`)).rows).toEqual([{period:1,ordinal:1,released:true}]);
 expect((await db.query(`SELECT period,ordinal FROM "CourseMusicLessonAssignment" WHERE "bookingId"='second'`)).rows).toEqual([{period:1,ordinal:2}]);
 await insert('replacement',1,1);
 await expect(db.exec(`UPDATE "CourseBooking" SET status='RESERVED' WHERE id='first'`)).rejects.toThrow();
});
it('retains leave identity and binds makeup to precisely the same original lesson',async()=>{
 await db.exec(`UPDATE "CourseBooking" SET status='CANCELLED',"absenceKind"='STUDENT_LEAVE' WHERE id='second'`);
 expect((await db.query(`SELECT "releasedAt" FROM "CourseMusicLessonAssignment" WHERE "bookingId"='second'`)).rows).toEqual([{releasedAt:null}]);
 await insert('makeup',1,2,'second');
 await expect(insert('wrong-makeup',2,1,'second')).rejects.toThrow('Makeup must retain');
 await db.exec(`UPDATE "CourseBooking" SET status='CANCELLED' WHERE id='makeup'`);
 expect((await db.query(`SELECT "releasedAt" IS NOT NULL released FROM "CourseMusicLessonAssignment" WHERE "bookingId"='makeup'`)).rows).toEqual([{released:true}]);
});
it('rejects foreign ownership, invalid periods, archived rows and history deletion',async()=>{
 await expect(insert('out-of-range',9,1)).rejects.toThrow('outside purchased');
 await db.exec(`UPDATE "CourseBooking" SET "customerId"='other' WHERE id='foreign';INSERT INTO "MusicOperationalArchive" VALUES('sealed','store-lubymusic','CourseBooking','archived')`);
 await expect(insert('foreign',2,1)).rejects.toThrow('ownership mismatch');
 await expect(insert('archived',2,1)).rejects.toThrow('Archived records');
 await expect(db.exec(`DELETE FROM "CourseMusicLessonAssignment" WHERE "bookingId"='first'`)).rejects.toThrow('cannot be deleted');
 expect((await db.query(`SELECT has_table_privilege('anon','"CourseMusicLessonAssignment"','SELECT') allowed`)).rows).toEqual([{allowed:false}]);
});
it('rolls back both booking and allocation when a slot is occupied',async()=>{
 await db.exec('BEGIN');
 await db.exec(`INSERT INTO "CourseBooking" VALUES('rollback','store-lubymusic','card','student','RESERVED',NULL,NULL)`);
 await expect(insert('rollback',1,1)).rejects.toThrow();
 await db.exec('ROLLBACK');
 expect((await db.query(`SELECT id FROM "CourseBooking" WHERE id='rollback'`)).rows).toEqual([]);
});

it('keeps a separate makeup entitlement tied to the original purchased period',async()=>{
 await db.exec(`INSERT INTO "CoursePointCard" VALUES('coupon','store-lubymusic',ARRAY[1],0,false,'music-leave-makeup:second');
 INSERT INTO "CourseBooking" VALUES('coupon-booking','store-lubymusic','coupon','student','RESERVED',NULL,NULL)`);
 await insert('coupon-booking',1,2,'second');
 expect((await db.query(`SELECT "cardId",period,ordinal FROM "CourseMusicLessonAssignment" WHERE "bookingId"='coupon-booking'`)).rows).toEqual([{cardId:'card',period:1,ordinal:2}]);
});
