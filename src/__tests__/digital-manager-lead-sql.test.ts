import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {afterAll,beforeAll,expect,it} from 'vitest';
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE "Store"(id text PRIMARY KEY,"industryModule" text);INSERT INTO "Store" VALUES ('a','STEAMFOOT'),('b','COURSE'),('c','BEAUTY');CREATE TABLE "DigitalButlerLead"(id text PRIMARY KEY,"storeId" text,"completionActionKey" text,status text,"assignedStaffId" text,"phoneCiphertext" bytea,"phoneIv" bytea,"phoneAuthTag" bytea);`);
 await db.exec(readFileSync('scripts/sql/digital-manager-notice-candidate.sql','utf8'));await db.exec(readFileSync('scripts/sql/digital-manager-lead-candidate.sql','utf8'));
},30000);
afterAll(async()=>db.close());
it('creates one private store notice for eligible inquiries and human support',async()=>{
 await db.exec(`INSERT INTO "DigitalButlerLead" VALUES ('lead','a','submit','NEW',null,'\\x01','\\x01','\\x01'),('support','b','__human_support_handoff__','NEW',null,null,null,null),('incomplete','a','submit','NEW',null,null,null,null),('beauty','c','__human_support_handoff__','NEW',null,null,null,null);`);
 const rows=(await db.query(`SELECT "storeId","eventKey","eventType","handledAt" FROM "DigitalManagerNotice" ORDER BY "storeId"`)).rows;
 expect(rows).toEqual([{storeId:'a',eventKey:'digital-butler-lead:lead',eventType:'DIGITAL_BUTLER_LEAD_CREATED',handledAt:null},{storeId:'b',eventKey:'human-support-requested:support',eventType:'HUMAN_SUPPORT_REQUESTED',handledAt:null}]);
});
it('resolves each store notice when its inquiry advances or support is assigned',async()=>{
 await db.exec(`UPDATE "DigitalButlerLead" SET status='CONTACTING' WHERE id='lead';UPDATE "DigitalButlerLead" SET "assignedStaffId"='worker' WHERE id='support';`);
 const rows=(await db.query<{handledAt:Date|null;revision:number}>(`SELECT "handledAt",revision FROM "DigitalManagerNotice" ORDER BY "storeId"`)).rows;
 expect(rows.every(r=>r.handledAt!==null&&r.revision===1)).toBe(true);
});
it('rolls lead and notice back together',async()=>{
 await db.exec(`BEGIN;INSERT INTO "DigitalButlerLead" VALUES ('rolled','a','__human_support_handoff__','NEW',null,null,null,null);ROLLBACK;`);
 expect((await db.query(`SELECT id FROM "DigitalManagerNotice" WHERE "eventKey"='human-support-requested:rolled'`)).rows).toHaveLength(0);
});
