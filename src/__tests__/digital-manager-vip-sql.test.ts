import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {afterAll,beforeAll,expect,it} from 'vitest';
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE "Store"(id text PRIMARY KEY,"industryModule" text);INSERT INTO "Store" VALUES ('a','STEAMFOOT'),('b','STEAMFOOT'),('c','COURSE');CREATE TABLE "SessionBalanceNotification"(id text PRIMARY KEY,"storeId" text,"customerId" text,"responseAction" text);INSERT INTO "SessionBalanceNotification" VALUES ('a1','a','ca',null),('b1','b','cb','LATER'),('other','c','cc',null);`);
 await db.exec(readFileSync('scripts/sql/digital-manager-notice-candidate.sql','utf8'));await db.exec(readFileSync('scripts/sql/digital-manager-vip-candidate.sql','utf8'));
},30000);
afterAll(async()=>db.close());
it('records one private VIP interest notice per same-store response',async()=>{
 await db.exec(`UPDATE "SessionBalanceNotification" SET "responseAction"='VIP_INTEREST' WHERE id IN ('a1','b1','other');UPDATE "SessionBalanceNotification" SET "responseAction"='VIP_INTEREST' WHERE id='a1';`);
 expect((await db.query(`SELECT "storeId","eventKey","eventType","targetId" FROM "DigitalManagerNotice" ORDER BY "storeId"`)).rows).toEqual([{storeId:'a',eventKey:'vip-interest:a1',eventType:'VIP_INTEREST',targetId:'ca'},{storeId:'b',eventKey:'vip-interest:b1',eventType:'VIP_INTEREST',targetId:'cb'}]);
});
it('rolls the response and notice back together',async()=>{
 await db.exec(`INSERT INTO "SessionBalanceNotification" VALUES ('rolled','a','ca',null);BEGIN;UPDATE "SessionBalanceNotification" SET "responseAction"='VIP_INTEREST' WHERE id='rolled';ROLLBACK;`);
 expect((await db.query(`SELECT id FROM "DigitalManagerNotice" WHERE "eventKey"='vip-interest:rolled'`)).rows).toHaveLength(0);
});
