import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
const migration=(name:string)=>readFileSync(`prisma/migrations/${name}/migration.sql`,'utf8');
it('dedicated Beauty role can read technician adjustments and confirm only Beauty months, without arbitrary payroll writes',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE steamfoot_beauty_prod_20261025 NOLOGIN; CREATE TABLE "Store" (id text PRIMARY KEY,"industryModule" text); CREATE TABLE "Staff" (id text,"storeId" text,UNIQUE(id,"storeId")); CREATE TABLE "BeautyTechnician" (id text,"storeId" text,UNIQUE("storeId",id)); GRANT SELECT ON "Store" TO steamfoot_beauty_prod_20261025;`);
 await db.exec(migration('20261104120000_staff_monthly_adjustments'));
 await db.exec(`GRANT ALL ON "StaffMonthlyAdjustment","StaffAdjustmentMonth" TO anon,authenticated;`);
 await db.exec(migration('20261104121000_monthly_adjustments_beauty_access'));
 await db.exec(`INSERT INTO "Store" VALUES ('beauty','BEAUTY'),('steam','STEAMFOOT'); INSERT INTO "Staff" VALUES ('staff','steam'); INSERT INTO "BeautyTechnician" VALUES ('tech','beauty'); INSERT INTO "StaffMonthlyAdjustment" (id,"storeId","technicianId",month,date,direction,amount,reason) VALUES ('beauty-row','beauty','tech','2026-11','2026-11-04','ADD',2000,'獎勵'); INSERT INTO "StaffMonthlyAdjustment" (id,"storeId","staffId",month,date,direction,amount,reason) VALUES ('steam-row','steam','staff','2026-11','2026-11-04','SUBTRACT',300,'出勤調整'); INSERT INTO "StaffAdjustmentMonth" ("storeId",month) VALUES ('beauty','2026-11'),('steam','2026-11'); SET ROLE steamfoot_beauty_prod_20261025;`);
 expect((await db.query('SELECT id FROM "StaffMonthlyAdjustment"')).rows).toEqual([{id:'beauty-row'}]);
 expect((await db.query('SELECT "storeId" FROM "StaffAdjustmentMonth"')).rows).toEqual([{storeId:'beauty'}]);
 await db.exec(`INSERT INTO "StaffAdjustmentMonth" ("storeId",month,locked) VALUES ('beauty','2026-12',true); UPDATE "StaffAdjustmentMonth" SET locked=true WHERE "storeId"='beauty';`);
 await expect(db.exec(`INSERT INTO "StaffAdjustmentMonth" ("storeId",month) VALUES ('steam','2026-12')`)).rejects.toThrow();
 await expect(db.exec(`UPDATE "StaffAdjustmentMonth" SET "storeId"='steam' WHERE "storeId"='beauty' AND month='2026-12'`)).rejects.toThrow();
 await expect(db.exec(`DELETE FROM "StaffAdjustmentMonth" WHERE "storeId"='beauty'`)).rejects.toThrow();
 await expect(db.exec(`UPDATE "StaffMonthlyAdjustment" SET amount=9999 WHERE id='beauty-row'`)).rejects.toThrow();
 await db.exec('RESET ROLE; SET ROLE authenticated');await expect(db.query('SELECT * FROM "StaffMonthlyAdjustment"')).rejects.toThrow();
 await db.exec('RESET ROLE; SET ROLE anon');await expect(db.query('SELECT * FROM "StaffAdjustmentMonth"')).rejects.toThrow();
 }finally{await db.close();}
},30000);
it('the grant migration also works without a Beauty role or installation',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE "Store"(id text PRIMARY KEY); CREATE TABLE "Staff"(id text,"storeId" text,UNIQUE(id,"storeId"));`);
 await db.exec(migration('20261104120000_staff_monthly_adjustments'));
 await db.exec(migration('20261104121000_monthly_adjustments_beauty_access'));
 expect((await db.query(`SELECT relrowsecurity FROM pg_class WHERE relname='StaffMonthlyAdjustment'`)).rows).toEqual([{relrowsecurity:true}]);
 }finally{await db.close();}
},30000);
