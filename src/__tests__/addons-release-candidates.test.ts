import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
const sql=(name:string)=>readFileSync(`scripts/sql/addons-release-review/${name}.sql`,'utf8');
const review=`SELECT set_config('addons_release.review_id','addons-release-v1',false),set_config('addons_release.expected_database',current_database(),false);`;
it('requires reviewed target and baseline, and rolls back schema drift',async()=>{
 const db=new PGlite();try{
 await db.exec('CREATE TABLE "BeautySetting"("storeId" text PRIMARY KEY);');
 await expect(db.exec(sql('beauty-service-switch'))).rejects.toThrow('marker required');await db.exec('ROLLBACK');
 await db.exec(review+`SELECT set_config('addons_release.expected_database','wrong-target',false);`);
 await expect(db.exec(sql('beauty-service-switch'))).rejects.toThrow('marker required');await db.exec('ROLLBACK');
 await db.exec(review+'ALTER TABLE "BeautySetting" ADD COLUMN "serviceAddOnsEnabled" text;');
 await expect(db.exec(sql('beauty-service-switch'))).rejects.toThrow('schema drift');await db.exec('ROLLBACK');
 await db.exec('DROP TABLE "BeautySetting";');
 await expect(db.exec(sql('beauty-service-switch'))).rejects.toThrow('baseline required');await db.exec('ROLLBACK');
 }finally{await db.close();}
},20000);
it('adds closed defaults, preserves explicit decisions and amounts on rerun, without staff backfill',async()=>{
 const db=new PGlite();try{
 await db.exec(review+`CREATE TABLE "BeautySetting"("storeId" text PRIMARY KEY,revision int);INSERT INTO "BeautySetting" VALUES('existing',7);CREATE TABLE "ServiceAddOnCatalog"("storeId" text PRIMARY KEY,revision int,groups jsonb);INSERT INTO "ServiceAddOnCatalog" VALUES('existing',4,'[{"id":"tea"}]');CREATE TABLE "StaffPermission"(id text,"staffId" text,permission text,granted boolean);INSERT INTO "StaffPermission" VALUES('p','editor','plans.edit',true);CREATE TABLE "BeautyPayment"(id text,amount int);INSERT INTO "BeautyPayment" VALUES('legacy',900);`);
 for(const name of ['beauty-service-switch','catalog-activation'])await db.exec(sql(name));
 expect((await db.query('SELECT * FROM "BeautySetting"')).rows).toEqual([{storeId:'existing',revision:7,serviceAddOnsEnabled:false}]);
 expect((await db.query('SELECT enabled FROM "ServiceAddOnCatalog"')).rows).toEqual([{enabled:false}]);
 await db.exec(`UPDATE "BeautySetting" SET "serviceAddOnsEnabled"=true;UPDATE "ServiceAddOnCatalog" SET enabled=true;`);
 for(const name of ['beauty-service-switch','catalog-activation'])await db.exec(sql(name));
 expect((await db.query('SELECT * FROM "BeautySetting"')).rows).toEqual([{storeId:'existing',revision:7,serviceAddOnsEnabled:true}]);
 expect((await db.query('SELECT * FROM "ServiceAddOnCatalog"')).rows).toEqual([{storeId:'existing',revision:4,groups:[{id:'tea'}],enabled:true}]);
 expect((await db.query('SELECT * FROM "BeautyPayment"')).rows).toEqual([{id:'legacy',amount:900}]);
 expect((await db.query('SELECT permission FROM "StaffPermission"')).rows).toEqual([{permission:'plans.edit'}]);
 await db.exec(`INSERT INTO "BeautySetting"("storeId",revision) VALUES('new',0);INSERT INTO "ServiceAddOnCatalog"("storeId",revision,groups) VALUES('new',0,'[]');`);
 expect((await db.query(`SELECT "serviceAddOnsEnabled" FROM "BeautySetting" WHERE "storeId"='new'`)).rows).toEqual([{serviceAddOnsEnabled:false}]);
 expect((await db.query(`SELECT enabled FROM "ServiceAddOnCatalog" WHERE "storeId"='new'`)).rows).toEqual([{enabled:false}]);
 }finally{await db.close();}
},20000);
async function staffBaseline(db:PGlite){await db.exec(review+`CREATE TABLE "Staff"(id text PRIMARY KEY,"storeId" text,status text);INSERT INTO "Staff" VALUES('approved','a','ACTIVE'),('denied','a','ACTIVE'),('unapproved','b','ACTIVE'),('inactive','a','INACTIVE');CREATE TABLE "StaffPermission"(id text PRIMARY KEY,"staffId" text,permission text,granted boolean,UNIQUE("staffId",permission));INSERT INTO "StaffPermission" VALUES('legacy-denial','denied','add_ons.manage',false),('legacy-editor','unapproved','plans.edit',true);`);}
it('initializes only explicit approved active staff, retaining existing denials and leaving other stores alone',async()=>{
 const db=new PGlite();try{
 await staffBaseline(db);
 await expect(db.exec(sql('staff-permission-initialization'))).rejects.toThrow('approval list required');await db.exec('ROLLBACK');
 await db.exec('CREATE TEMP TABLE addons_permission_approval("storeId" text NOT NULL,"staffId" text PRIMARY KEY);');
 await db.exec(sql('staff-permission-initialization'));
 expect((await db.query(`SELECT * FROM "StaffPermission" WHERE permission='add_ons.manage'`)).rows).toHaveLength(1);
 await db.exec(`INSERT INTO addons_permission_approval VALUES('a','approved'),('a','denied');`);
 await db.exec(sql('staff-permission-initialization'));await db.exec(sql('staff-permission-initialization'));
 expect((await db.query(`SELECT "staffId",granted FROM "StaffPermission" WHERE permission='add_ons.manage' ORDER BY "staffId"`)).rows).toEqual([{staffId:'approved',granted:true},{staffId:'denied',granted:false}]);
 }finally{await db.close();}
},20000);
it.each([['a','unapproved'],['a','inactive'],['a','missing']])('rejects invalid staff approval %s/%s atomically',async(storeId,staffId)=>{
 const db=new PGlite();try{
 await staffBaseline(db);await db.exec('CREATE TEMP TABLE addons_permission_approval("storeId" text NOT NULL,"staffId" text PRIMARY KEY);');
 await db.query('INSERT INTO addons_permission_approval VALUES($1,$2),($1,$3)',[storeId,staffId,'approved']);
 await expect(db.exec(sql('staff-permission-initialization'))).rejects.toThrow('active and belong');await db.exec('ROLLBACK');
 expect((await db.query(`SELECT * FROM "StaffPermission" WHERE "staffId"='approved'`)).rows).toHaveLength(0);
 }finally{await db.close();}
},20000);
