import {afterEach,expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL('../../prisma/migrations/20261110082629_course_family_contact/migration.sql',import.meta.url),'utf8');
let db:PGlite|undefined;
afterEach(async()=>{await db?.close();db=undefined;});
it('corrects a legacy learner phone to a sibling guardian contact without changing learner or booking IDs',async()=>{
 db=new PGlite();
 await db.exec(`CREATE TABLE "Customer"(id text PRIMARY KEY,"storeId" text NOT NULL,name text NOT NULL,phone text NOT NULL,"userId" text,"googleId" text,"lineUserId" text,"lineBindingCode" text);CREATE UNIQUE INDEX uq_store_customer_phone ON "Customer"("storeId",phone);INSERT INTO "Customer"(id,"storeId",name,phone) VALUES ('sibling','store','小安','0987654321'),('learner','store','小晴','0912345678');`);
 await db.exec(migration);
 await db.exec(`CREATE TABLE fixture_booking(id text PRIMARY KEY,"customerId" text REFERENCES "Customer"(id));INSERT INTO fixture_booking VALUES ('lesson-a','sibling'),('lesson-b','learner');`);
 await expect(db.exec(`UPDATE "Customer" SET phone='0987654321' WHERE id='learner'`)).rejects.toMatchObject({code:'23505'});
 await db.exec(`UPDATE "Customer" SET phone='',"contactPhone"='0987654321' WHERE id='learner' AND "storeId"='store';`);
 expect((await db.query(`SELECT id,phone,"contactPhone" FROM "Customer" WHERE "storeId"='store' ORDER BY id`)).rows).toEqual([{id:'learner',phone:'',contactPhone:'0987654321'},{id:'sibling',phone:'0987654321',contactPhone:null}]);
 expect((await db.query(`SELECT "customerId" FROM fixture_booking ORDER BY id`)).rows).toEqual([{customerId:'sibling'},{customerId:'learner'}]);
},15000);
it('preserves personal identity uniqueness while allowing two independent learners to share a guardian contact',async()=>{
 db=new PGlite();
 await db.exec(`CREATE TABLE "Customer"(id text PRIMARY KEY,"storeId" text NOT NULL,name text NOT NULL,phone text NOT NULL,"userId" text,"googleId" text,"lineUserId" text,"lineBindingCode" text);CREATE UNIQUE INDEX uq_store_customer_phone ON "Customer"("storeId",phone);INSERT INTO "Customer"(id,"storeId",name,phone) VALUES ('existing','store','既有學員','0912345678'),('legacy','other','舊空白電話','');`);
 await db.exec(migration);
 await db.exec(`INSERT INTO "Customer"(id,"storeId",name,phone,"contactPhone") VALUES ('child-a','store','小安','','0912345678'),('child-b','store','小晴','','0912345678');`);
 expect((await db.query(`SELECT id FROM "Customer" WHERE "storeId"='store' AND phone='0912345678'`)).rows).toEqual([{id:'existing'}]);
 expect((await db.query(`SELECT id FROM "Customer" WHERE "storeId"='store' AND "contactPhone"='0912345678' ORDER BY id`)).rows).toEqual([{id:'child-a'},{id:'child-b'}]);
 await expect(db.exec(`INSERT INTO "Customer"(id,"storeId",name,phone) VALUES ('duplicate','store','另一位','0912345678')`)).rejects.toMatchObject({code:'23505'});
 for(const field of ['userId','googleId','lineUserId','lineBindingCode'])await expect(db.exec(`UPDATE "Customer" SET "${field}"='identity' WHERE id='child-a'`)).rejects.toMatchObject({code:'23514'});
 await expect(db.exec(`INSERT INTO "Customer"(id,"storeId",name,phone,"contactPhone") VALUES ('bad','store','錯誤','','not-a-phone')`)).rejects.toMatchObject({code:'23514'});
 await expect(db.exec(`INSERT INTO "Customer"(id,"storeId",name,phone) VALUES ('blank','other','另一空白','')`)).rejects.toMatchObject({code:'23505'});
 // Independent booking/card ownership remains keyed by the learner, never the shared contact.
 await db.exec(`CREATE TABLE fixture_booking(id text PRIMARY KEY,"customerId" text REFERENCES "Customer"(id));INSERT INTO fixture_booking VALUES ('lesson-a','child-a'),('lesson-b','child-b');`);
 expect((await db.query(`SELECT "customerId" FROM fixture_booking ORDER BY id`)).rows).toEqual([{customerId:'child-a'},{customerId:'child-b'}]);
 await db.exec(`UPDATE "Customer" SET phone='0987654321',"userId"='own-verified-user' WHERE id='child-a'`);
 expect((await db.query(`SELECT phone,"contactPhone" FROM "Customer" WHERE id='child-a'`)).rows).toEqual([{phone:'0987654321',contactPhone:'0912345678'}]);
},15000);
