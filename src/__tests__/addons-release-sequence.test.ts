import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
const sequence=[
 'scripts/sql/shared-add-on-items-candidate.sql',
 'scripts/sql/addons-release-review/catalog-activation.sql',
 'scripts/sql/course-add-on-items-candidate.sql',
 'prisma/migrations/20261031230000_shared_goods_ownership/migration.sql',
 'scripts/sql/beauty-add-on-items-candidate.sql',
 'scripts/sql/addons-release-review/beauty-service-switch.sql',
 'scripts/sql/beauty-shared-goods-candidate.sql',
 'scripts/sql/addons-release-review/staff-permission-initialization.sql',
];
it('rehearses the combined reviewed sequence twice with closed defaults, scoped grants and immutable legacy money',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE ROLE rehearsal_backend LOGIN;
 CREATE TABLE "Store"(id text PRIMARY KEY);INSERT INTO "Store" VALUES('a'),('b');
 CREATE TABLE "Staff"(id text PRIMARY KEY,"storeId" text,status text);INSERT INTO "Staff" VALUES('approved','a','ACTIVE'),('other-editor','b','ACTIVE');
 CREATE TABLE "StaffPermission"(id text PRIMARY KEY,"staffId" text,permission text,granted boolean,UNIQUE("staffId",permission));INSERT INTO "StaffPermission" VALUES('legacy','other-editor','plans.edit',true);
 CREATE TABLE "Booking"(id text PRIMARY KEY,"storeId" text);
 CREATE TABLE "BookingParticipantGroup"(id text PRIMARY KEY,"storeId" text,"bookingId" text);
 CREATE TABLE "BookingParticipant"(id text PRIMARY KEY,"storeId" text,"groupId" text);
 CREATE TABLE "CourseSession"(id text PRIMARY KEY,"storeId" text);
 CREATE TABLE "CourseBooking"(id text PRIMARY KEY,"storeId" text,"sessionId" text REFERENCES "CourseSession"(id) ON DELETE CASCADE,"groupKey" text);
 CREATE TABLE "BeautySetting"("storeId" text PRIMARY KEY,revision int);INSERT INTO "BeautySetting" VALUES('a',7);
 CREATE TABLE "BeautyService"(id text PRIMARY KEY,price int);INSERT INTO "BeautyService" VALUES('svc',900);
 CREATE TABLE "BeautyGroup"(id text PRIMARY KEY,"storeId" text,UNIQUE("storeId",id));INSERT INTO "BeautyGroup" VALUES('party','a');
 CREATE TABLE "BeautyAppointment"(id text PRIMARY KEY,"storeId" text,"groupId" text,status text,price int,duration int);INSERT INTO "BeautyAppointment" VALUES('appointment','a','party','RESERVED',900,60);
 CREATE TABLE "BeautyPayment"(id text PRIMARY KEY,"storeId" text,kind text,amount int,"originalPaymentId" text,"appointmentId" text,"cardId" text,"technicianId" text);INSERT INTO "BeautyPayment" VALUES('legacy-payment','a','SALE',900,null,'appointment',null,null);
 CREATE TEMP TABLE addons_permission_approval("storeId" text NOT NULL,"staffId" text PRIMARY KEY);INSERT INTO addons_permission_approval VALUES('a','approved');
 SET service_addons_migration.app_role='rehearsal_backend';SET beauty_migration.app_role='rehearsal_backend';
 SELECT set_config('beauty_goods.review_id','beauty-goods-v1',false),set_config('beauty_goods.expected_database',current_database(),false),set_config('beauty_goods.app_role','rehearsal_backend',false),set_config('addons_release.review_id','addons-release-v1',false),set_config('addons_release.expected_database',current_database(),false);`);
 const immutable=readFileSync('scripts/sql/beauty-module-candidate.sql','utf8').match(/CREATE FUNCTION beauty_immutable_ledger\(\)[\s\S]*?CREATE TRIGGER beauty_payment_immutable[^;]*;/)?.[0];
 expect(immutable).toBeTruthy();await db.exec(immutable!);
 for(let pass=0;pass<2;pass++)for(const path of sequence)await db.exec(readFileSync(path,'utf8'));
 expect((await db.query('SELECT * FROM "BeautySetting"')).rows).toEqual([{storeId:'a',revision:7,serviceAddOnsEnabled:false}]);
 expect((await db.query('SELECT price,duration,"addOnItems","baseServiceDuration" FROM "BeautyAppointment"')).rows).toEqual([{price:900,duration:60,addOnItems:[],baseServiceDuration:null}]);
 expect((await db.query(`SELECT "staffId",granted FROM "StaffPermission" WHERE permission='add_ons.manage'`)).rows).toEqual([{staffId:'approved',granted:true}]);
 expect((await db.query(`SELECT count(*)::int AS count FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY(ARRAY['ServiceAddOnCatalog','ServiceAddOnImage','ServiceAddOnOrder','ServiceAddOnReceipt','ServiceAddOnCommand','BeautyServiceImage','BeautySharedGoodsOrder']) AND relrowsecurity`)).rows).toEqual([{count:7}]);
 await db.exec(`INSERT INTO "ServiceAddOnCatalog"("storeId",module) VALUES('a','STEAMFOOT');`);
 expect((await db.query('SELECT enabled FROM "ServiceAddOnCatalog"')).rows).toEqual([{enabled:false}]);
 await db.query(`INSERT INTO "BeautySharedGoodsOrder"(id,"storeId","groupId",items,total) VALUES('goods','a','party',$1,80)`,[JSON.stringify([{id:'tea',ownership:'RESERVATION',price:80,duration:0,quantity:1}])]);
 await db.exec(`INSERT INTO "BeautyPayment"(id,"storeId",kind,amount,"sharedGoodsOrderId") VALUES('sale','a','SALE',80,'goods');INSERT INTO "BeautyPayment"(id,"storeId",kind,amount,"originalPaymentId","sharedGoodsOrderId") VALUES('refund','a','REFUND',-80,'sale','goods');`);
 await expect(db.exec(`UPDATE "BeautyPayment" SET amount=0 WHERE id='legacy-payment'`)).rejects.toThrow('immutable');
 expect((await db.query(`SELECT amount,"sharedGoodsOrderId" FROM "BeautyPayment" WHERE id='legacy-payment'`)).rows).toEqual([{amount:900,sharedGoodsOrderId:null}]);
 await db.exec('SET ROLE anon');await expect(db.query('SELECT * FROM "BeautySharedGoodsOrder"')).rejects.toThrow('permission denied');
 await db.exec('RESET ROLE;SET ROLE rehearsal_backend');await expect(db.query('UPDATE "ServiceAddOnReceipt" SET amount=1')).rejects.toThrow('permission denied');
 }finally{await db.close();}
},30000);
