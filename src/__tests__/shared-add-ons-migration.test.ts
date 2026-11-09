import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
it('installs safely, rejects nonzero duration in SQL and protects participant payment history',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE "Store"(id text PRIMARY KEY);CREATE TABLE "BookingParticipant"(id text PRIMARY KEY,"storeId" text);INSERT INTO "Store" VALUES('s');INSERT INTO "BookingParticipant" VALUES('p','s');CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE ROLE addons_app LOGIN;SET service_addons_migration.app_role='addons_app';`);
 const sql=readFileSync('scripts/sql/shared-add-on-items-candidate.sql','utf8');await db.exec(sql);await db.exec(sql);
 const group=JSON.stringify([{id:'g',options:[{id:'tea',duration:1}]}]);
 await expect(db.query('INSERT INTO "ServiceAddOnCatalog" ("storeId",module,groups) VALUES ($1,$2,$3)', ['s','STEAMFOOT',group])).rejects.toThrow('cannot add duration');
 await db.exec(`INSERT INTO "ServiceAddOnCatalog" ("storeId",module) VALUES ('s','STEAMFOOT');INSERT INTO "ServiceAddOnOrder" (id,"storeId",module,"bookingId","participantId") VALUES ('o','s','STEAMFOOT','b','p');`);
 await expect(db.exec(`UPDATE "ServiceAddOnOrder" SET items='[{"id":"x","duration":20}]' WHERE id='o'`)).rejects.toThrow('cannot add duration');
 await expect(db.exec(`DELETE FROM "BookingParticipant" WHERE id='p'`)).rejects.toThrow('history');
 await db.exec('SET ROLE anon');await expect(db.query('SELECT * FROM "ServiceAddOnOrder"')).rejects.toThrow('permission denied');
 await db.exec('RESET ROLE;SET ROLE addons_app');
 await db.exec(`UPDATE "ServiceAddOnCatalog" SET groups='[]' WHERE "storeId"='s' AND module='STEAMFOOT'`);
 await expect(db.exec(`UPDATE "ServiceAddOnReceipt" SET amount=20`)).rejects.toThrow('permission denied');
 }finally{await db.close();}
},20000);

it('preserves FITNESS and MUSIC course add-on history including parent cascade deletion',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE "Store"(id text PRIMARY KEY);CREATE TABLE "BookingParticipant"(id text PRIMARY KEY,"storeId" text);CREATE TABLE "CourseSession"(id text PRIMARY KEY);CREATE TABLE "CourseBooking"(id text PRIMARY KEY,"storeId" text,"sessionId" text REFERENCES "CourseSession"(id) ON DELETE CASCADE);INSERT INTO "Store" VALUES('s');CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE ROLE addons_app LOGIN;SET service_addons_migration.app_role='addons_app';`);
 await db.exec(readFileSync('scripts/sql/shared-add-on-items-candidate.sql','utf8'));
 const sql=readFileSync('scripts/sql/course-add-on-items-candidate.sql','utf8');await db.exec(sql);await db.exec(sql);
 for(const addOnModule of ['FITNESS','MUSIC']){
 await db.query('INSERT INTO "CourseSession" VALUES($1)',[addOnModule]);
 await db.query('INSERT INTO "CourseBooking" VALUES($1,$2,$1)',[addOnModule,'s']);
 await db.query('INSERT INTO "ServiceAddOnOrder"(id,"storeId",module,"bookingId","participantId") VALUES($1,$2,$1,$1,$1)',[addOnModule,'s']);
 await expect(db.query('DELETE FROM "CourseBooking" WHERE id=$1',[addOnModule])).rejects.toThrow('history');
 await expect(db.query('DELETE FROM "CourseSession" WHERE id=$1',[addOnModule])).rejects.toThrow('history');
 await expect(db.query('UPDATE "ServiceAddOnOrder" SET items=$1 WHERE id=$2',[JSON.stringify([{duration:1}]),addOnModule])).rejects.toThrow('cannot add duration');
 }
 await db.exec(`INSERT INTO "CourseSession" VALUES('empty');INSERT INTO "CourseBooking" VALUES('empty','s','empty');DELETE FROM "CourseSession" WHERE id='empty';`);
 }finally{await db.close();}
},20000);
