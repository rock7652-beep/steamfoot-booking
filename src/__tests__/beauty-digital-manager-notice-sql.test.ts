import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {afterAll,beforeAll,expect,it} from 'vitest';
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`CREATE ROLE steamfoot_beauty_data_qa; CREATE TABLE "Store"(id text PRIMARY KEY,"industryModule" text,name text); INSERT INTO "Store" VALUES ('beauty','BEAUTY','private'),('course','COURSE','private'); GRANT SELECT (id,"industryModule") ON "Store" TO steamfoot_beauty_data_qa; ALTER TABLE "Store" ENABLE ROW LEVEL SECURITY; CREATE POLICY beauty_store_read ON "Store" FOR SELECT TO steamfoot_beauty_data_qa USING (true);`);
 await db.exec(readFileSync('scripts/sql/digital-manager-notice-candidate.sql','utf8'));
 await db.exec(`SET beauty_migration.app_role='steamfoot_beauty_data_qa';`);
 const sql=readFileSync('scripts/sql/digital-manager-beauty-access-candidate.sql','utf8');await db.exec(sql);await db.exec(sql);
},30000);
afterAll(async()=>db.close());
it('allows the restricted Beauty role to write its payment notice without access to course notices',async()=>{
 await db.exec(`INSERT INTO "DigitalManagerNotice" (id,"storeId","eventKey","eventType","targetId") VALUES ('course-event','course','course-purchase-pending:1','TRANSFER_PENDING_CONFIRMATION','1'); SET ROLE steamfoot_beauty_data_qa;`);
 try {
  await db.exec(`INSERT INTO "DigitalManagerNotice" (id,"storeId","eventKey","eventType","targetId") VALUES ('beauty-event','beauty','beauty-purchase-pending:1','TRANSFER_PENDING_CONFIRMATION','1');`);
  await db.exec(`INSERT INTO "DigitalManagerActivation" ("storeId") VALUES ('beauty'); INSERT INTO "DigitalManagerNotice" (id,"storeId","eventKey","eventType","targetId") VALUES ('reminder','beauty','beauty-incomplete:1:time','INCOMPLETE_SERVICE_REMINDER','1');`);
  expect((await db.query(`SELECT id FROM "DigitalManagerNotice" ORDER BY id`)).rows).toEqual([{id:'beauty-event'},{id:'reminder'}]);
  await expect(db.exec(`INSERT INTO "DigitalManagerNotice" (id,"storeId","eventKey","eventType","targetId") VALUES ('wrong','course','beauty-purchase-pending:2','TRANSFER_PENDING_CONFIRMATION','2')`)).rejects.toThrow();
  await expect(db.exec(`INSERT INTO "DigitalManagerActivation" ("storeId") VALUES ('course')`)).rejects.toThrow();
  await expect(db.exec(`DELETE FROM "DigitalManagerNotice"`)).rejects.toThrow();
  await expect(db.exec(`SELECT name FROM "Store"`)).rejects.toThrow();
 } finally { await db.exec('RESET ROLE'); }
});
