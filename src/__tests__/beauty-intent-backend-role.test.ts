import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';

const policy=readFileSync('scripts/sql/beauty-intent-backend-role-candidate.sql','utf8');
const migrations=['20261028111327_beauty_plan_purchase_intents.sql','20261028112155_beauty_collection_intents.sql','20261028123112_beauty_member_purchase_intents.sql'].map(name=>readFileSync(`supabase/migrations/${name}`,'utf8')).join('\n');
async function setup(){
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE qa_beauty LOGIN NOINHERIT;
 CREATE TABLE "Store" (id text PRIMARY KEY,"industryModule" text NOT NULL,"operatingStatus" text NOT NULL DEFAULT 'ACTIVE');
 CREATE TABLE "User" (id text PRIMARY KEY);
 CREATE TABLE "Customer" ("storeId" text,id text,PRIMARY KEY("storeId",id));
 CREATE TABLE "BeautyCard" ("storeId" text,id text,PRIMARY KEY("storeId",id));
 CREATE TABLE "BeautyPurchase" ("storeId" text,id text,PRIMARY KEY("storeId",id));
 CREATE TABLE "BeautyAppointment" ("storeId" text,id text,PRIMARY KEY("storeId",id));
 GRANT USAGE ON SCHEMA public TO qa_beauty;
 GRANT SELECT(id,"industryModule","operatingStatus"), UPDATE(id) ON "Store" TO qa_beauty;
 ALTER TABLE "Store" ENABLE ROW LEVEL SECURITY;
 CREATE POLICY qa_store_read ON "Store" FOR SELECT TO qa_beauty USING ("industryModule"='BEAUTY');
 CREATE POLICY qa_store_lock ON "Store" FOR UPDATE TO qa_beauty USING ("industryModule"='BEAUTY') WITH CHECK ("industryModule"='BEAUTY');
 INSERT INTO "Store" (id,"industryModule") VALUES ('beauty','BEAUTY'),('course','COURSE');
 INSERT INTO "User" VALUES ('actor');
 INSERT INTO "Customer" VALUES ('beauty','customer'),('course','customer');
 INSERT INTO "BeautyPurchase" VALUES ('beauty','order');
 INSERT INTO "BeautyAppointment" VALUES ('beauty','appointment');`);
 await db.exec(migrations);
 return db;
}
it('fails closed when a restricted backend role is not explicitly selected',async()=>{
 const db=await setup();try{
  await expect(db.exec(policy)).rejects.toThrow('Explicit restricted backend login role required');
  await expect(db.exec(`BEGIN; SET LOCAL steamfoot_migration.beauty_intent_role='postgres'; ${policy} COMMIT;`)).rejects.toThrow('Explicit restricted backend login role required');
  await db.exec('ROLLBACK');
  const result=await db.query<{allowed:boolean}>(`SELECT has_table_privilege('qa_beauty','"BeautyPurchaseIntent"','SELECT') AS allowed`);
  expect(result.rows).toEqual([{allowed:false}]);
  await db.exec('CREATE ROLE qa_bypass BYPASSRLS; GRANT qa_bypass TO qa_beauty');
  await expect(db.exec(`BEGIN; SET LOCAL steamfoot_migration.beauty_intent_role='qa_beauty'; ${policy} COMMIT;`)).rejects.toThrow('RLS-bypassing role');
  await db.exec('ROLLBACK');
 }finally{await db.close();}
});
it('permits only scoped backend operations while denying browser access and deletion',async()=>{
 const db=await setup();try{
  await db.exec(`INSERT INTO "BeautyPurchaseIntent" ("storeId","customerId","requestKey",status,"actorUserId") VALUES ('course','customer','hidden','CANCELLED','actor');
  BEGIN; SET LOCAL steamfoot_migration.beauty_intent_role='qa_beauty'; ${policy} COMMIT; SET ROLE qa_beauty;
  INSERT INTO "BeautyPurchaseIntent" ("storeId","customerId","requestKey",status,fingerprint,"actorUserId") VALUES ('beauty','customer','direct','PREPARED',repeat('a',64),'actor');
  UPDATE "BeautyPurchaseIntent" SET status='CANCELLED' WHERE "requestKey"='direct';
  INSERT INTO "BeautyOnlineConfirmIntent" VALUES ('beauty','direct','order');
  INSERT INTO "BeautyCollectionIntent" ("storeId","requestKey",status,fingerprint,"actorUserId") VALUES ('beauty','collection','PREPARED',repeat('a',64),'actor');
  INSERT INTO "BeautyCollectionIntentItem" VALUES ('beauty','collection','appointment',true);
  UPDATE "BeautyCollectionIntent" SET status='CANCELLED' WHERE "requestKey"='collection';
  UPDATE "BeautyCollectionIntentItem" SET active=false WHERE "requestKey"='collection';
  INSERT INTO "BeautyMemberPurchaseIntent" ("storeId","customerId","actorUserId","requestKey",status,fingerprint) VALUES ('beauty','customer','actor','member','PREPARED',repeat('a',64));
  UPDATE "BeautyMemberPurchaseIntent" SET status='COMMITTED',"purchaseId"='order' WHERE "requestKey"='member';`);
  expect((await db.query(`SELECT id FROM "Store" WHERE id='beauty' AND "industryModule"='BEAUTY' AND "operatingStatus" IN ('ACTIVE','TRIAL') FOR UPDATE`)).rows).toEqual([{id:'beauty'}]);
  expect((await db.query(`SELECT "requestKey" FROM "BeautyPurchaseIntent" ORDER BY "requestKey"`)).rows).toEqual([{requestKey:'direct'}]);
  await expect(db.exec(`INSERT INTO "BeautyPurchaseIntent" ("storeId","customerId","requestKey",status,"actorUserId") VALUES ('course','customer','blocked','CANCELLED','actor')`)).rejects.toThrow(/row-level security/i);
  for(const table of ['BeautyPurchaseIntent','BeautyOnlineConfirmIntent','BeautyCollectionIntent','BeautyCollectionIntentItem','BeautyMemberPurchaseIntent']){
   const r=await db.query<{browser:boolean;deletable:boolean}>(`SELECT has_table_privilege('anon','public."${table}"','SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated','public."${table}"','SELECT,INSERT,UPDATE,DELETE') AS browser,has_table_privilege('qa_beauty','public."${table}"','DELETE') AS deletable`);
   expect(r.rows).toEqual([{browser:false,deletable:false}]);
  }
  expect((await db.query<{allowed:boolean}>(`SELECT has_table_privilege('qa_beauty','"BeautyOnlineConfirmIntent"','UPDATE') AS allowed`)).rows).toEqual([{allowed:false}]);
 }finally{await db.close();}
});
it('refuses existing intent policies and does not leave partial grants',async()=>{
 const db=await setup();try{
  await db.exec(`CREATE POLICY unexpected ON "BeautyMemberPurchaseIntent" FOR SELECT TO qa_beauty USING (true)`);
  await expect(db.exec(`BEGIN; SET LOCAL steamfoot_migration.beauty_intent_role='qa_beauty'; ${policy} COMMIT;`)).rejects.toThrow('Existing intent policies require manual review');
  await db.exec('ROLLBACK');
  const r=await db.query<{allowed:boolean;policies:number}>(`SELECT has_table_privilege('qa_beauty','"BeautyPurchaseIntent"','SELECT') AS allowed,(SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'beauty_intent_%') AS policies`);
  expect(r.rows).toEqual([{allowed:false,policies:0}]);
 }finally{await db.close();}
});
it('refuses to grant intent access when the backend cannot acquire the Store lock',async()=>{
 const db=await setup();try{
  await db.exec('REVOKE UPDATE(id) ON "Store" FROM qa_beauty');
  await expect(db.exec(`BEGIN; SET LOCAL steamfoot_migration.beauty_intent_role='qa_beauty'; ${policy} COMMIT;`)).rejects.toThrow('Backend Store scope prerequisites are missing');
  await db.exec('ROLLBACK');
  expect((await db.query<{allowed:boolean}>(`SELECT has_table_privilege('qa_beauty','"BeautyPurchaseIntent"','SELECT') AS allowed`)).rows).toEqual([{allowed:false}]);
 }finally{await db.close();}
});
