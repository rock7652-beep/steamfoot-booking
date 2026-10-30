import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {afterAll,beforeAll,expect,it} from 'vitest';
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE "Store"(id text PRIMARY KEY,"industryModule" text);INSERT INTO "Store" VALUES ('a','STEAMFOOT'),('b','STEAMFOOT'),('course','COURSE');CREATE TABLE "Transaction"(id text PRIMARY KEY,"storeId" text,"planId" text,"transactionType" text,"paymentStatus" text,status text);`);
 await db.exec(readFileSync('scripts/sql/digital-manager-notice-candidate.sql','utf8'));
 await db.exec(readFileSync('scripts/sql/steamfoot-digital-manager-payment-candidate.sql','utf8'));
},30000);
afterAll(async()=>db.close());
it('creates only store-scoped pending plan notices and deduplicates updates',async()=>{
 await db.exec(`INSERT INTO "Transaction" VALUES ('a1','a','plan','PACKAGE_PURCHASE','PENDING','SUCCESS'),('b1','b','plan','SINGLE_PURCHASE','PENDING','SUCCESS'),('other','course','plan','PACKAGE_PURCHASE','PENDING','SUCCESS'),('nonplan','a',null,'PACKAGE_PURCHASE','PENDING','SUCCESS'); UPDATE "Transaction" SET "paymentStatus"='PENDING' WHERE id='a1';`);
 const rows=(await db.query(`SELECT "storeId","eventKey","handledAt",revision FROM "DigitalManagerNotice" ORDER BY "storeId"`)).rows;
 expect(rows).toEqual([{storeId:'a',eventKey:'pending-payment:a1',handledAt:null,revision:0},{storeId:'b',eventKey:'pending-payment:b1',handledAt:null,revision:0}]);
});
it('resolves only the matching notice on confirmation or cancellation',async()=>{
 await db.exec(`BEGIN; SELECT set_config('steamfoot.audit_actor','{"id":"u","name":"店員"}',true); UPDATE "Transaction" SET "paymentStatus"='CONFIRMED' WHERE id='a1'; COMMIT; UPDATE "Transaction" SET status='CANCELLED',"paymentStatus"='CANCELLED' WHERE id='b1';`);
 const rows=(await db.query<{storeId:string;handledAt:Date|null;handledById:string;revision:number}>(`SELECT "storeId","handledAt","handledById",revision FROM "DigitalManagerNotice" ORDER BY "storeId"`)).rows;
 expect(rows[0]).toMatchObject({storeId:'a',handledById:'u',revision:1});expect(rows[0].handledAt).not.toBeNull();
 expect(rows[1]).toMatchObject({storeId:'b',handledById:'system',revision:1});expect(rows[1].handledAt).not.toBeNull();
});
it('rolls the payment and its notice back together',async()=>{
 await db.exec(`BEGIN;INSERT INTO "Transaction" VALUES ('rolled','a','plan','PACKAGE_PURCHASE','PENDING','SUCCESS');ROLLBACK;`);
 expect((await db.query(`SELECT id FROM "DigitalManagerNotice" WHERE "eventKey"='pending-payment:rolled'`)).rows).toHaveLength(0);
});
