import {PGlite} from "@electric-sql/pglite";
import {readFileSync} from "node:fs";
import {afterAll,beforeAll,expect,it} from "vitest";
import {MUSIC_OPENING_SCHEMA_SQL,assertMusicOpeningSchema} from "../../scripts/music-opening-schema-check.mjs";
const db=new PGlite();
beforeAll(async()=>{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE TABLE "Store"(id text PRIMARY KEY,slug text,"industryModule" text);
 CREATE TABLE "Customer"(id text PRIMARY KEY,"storeId" text,UNIQUE(id,"storeId"));
 CREATE TABLE "CoursePointCard"(id text PRIMARY KEY,"storeId" text,UNIQUE(id,"storeId"));
 CREATE TABLE "CourseCardMember"("cardId" text,"storeId" text,"customerId" text,PRIMARY KEY("cardId","customerId"));
 CREATE TABLE "CourseBooking"(id text PRIMARY KEY,"storeId" text,"cardId" text,"customerId" text);
 INSERT INTO "Store" VALUES('store-lubymusic','lubymusic','COURSE');
 INSERT INTO "Customer" VALUES('synthetic-student','store-lubymusic');
 INSERT INTO "CoursePointCard" VALUES('synthetic-card','store-lubymusic');
 INSERT INTO "CourseCardMember" VALUES('synthetic-card','store-lubymusic','synthetic-student');`);
 await db.exec(readFileSync("docs/sql/music-opening-state-draft-20261007.sql","utf8"));
});
afterAll(()=>db.close());
it("actual local PostgreSQL catalogs satisfy the deployment capability guard",async()=>{
 const result=await db.query(MUSIC_OPENING_SCHEMA_SQL);expect(()=>assertMusicOpeningSchema(result.rows)).not.toThrow();
});
it("DDL preserves native defaults and leaves opening state empty",async()=>{
 expect((await db.query<{n:number}>(`SELECT count(*)::int n FROM "CourseMusicOpeningState"`)).rows[0].n).toBe(0);
 expect((await db.query(`SELECT "musicOpeningStateRequired" FROM "CoursePointCard"`)).rows).toEqual([{musicOpeningStateRequired:false}]);
});
it("incomplete identity and duplicate original ordinals fail under real local constraints",async()=>{
 await expect(db.exec(`INSERT INTO "CourseBooking"(id,"storeId","cardId","customerId","musicOpeningTermKey") VALUES('invalid','store-lubymusic','synthetic-card','synthetic-student','term-7')`)).rejects.toThrow();
 await db.exec(`INSERT INTO "CourseBooking" VALUES('valid','store-lubymusic','synthetic-card','synthetic-student','term-7',3,'source-3')`);
 await expect(db.exec(`INSERT INTO "CourseBooking" VALUES('duplicate','store-lubymusic','synthetic-card','synthetic-student','term-7',3,'different-source')`)).rejects.toThrow();
});
it("same-store foreign keys and public API denial are enforced locally",async()=>{
 await expect(db.exec(`INSERT INTO "CourseMusicOpeningState"(id,"storeId","cardId","customerId","sourceKey","contentHash",snapshot,"appliedBatchId") VALUES('bad','wrong-store','synthetic-card','synthetic-student','source',repeat('a',64),'{}','batch')`)).rejects.toThrow();
 const result=await db.query(`SELECT has_table_privilege('anon','"CourseMusicOpeningState"','SELECT') AS anon,has_table_privilege('authenticated','"CourseMusicOpeningState"','INSERT') AS authenticated`);
 expect(result.rows).toEqual([{anon:false,authenticated:false}]);
});
it("an aborted transaction cannot leave a synthetic opening row",async()=>{
 await db.exec("BEGIN");
 await db.exec(`INSERT INTO "CourseMusicOpeningState"(id,"storeId","cardId","customerId","sourceKey","contentHash",snapshot,"appliedBatchId") VALUES('rollback','store-lubymusic','synthetic-card','synthetic-student','source',repeat('a',64),'{}','batch')`);
 await expect(db.exec(`INSERT INTO "CourseBooking"(id,"storeId","cardId","customerId","musicOpeningTermKey") VALUES('failure','store-lubymusic','synthetic-card','synthetic-student','term-7')`)).rejects.toThrow();
 await db.exec("ROLLBACK");
 expect((await db.query(`SELECT id FROM "CourseMusicOpeningState"`)).rows).toEqual([]);
});
