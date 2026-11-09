import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
it('defaults catalogs off without deriving any staff authorization from plans.edit',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE "ServiceAddOnCatalog" ("storeId" text,"module" text,revision integer,groups jsonb);
  CREATE TABLE "StaffPermission" (id text,"staffId" text,permission text,granted boolean,UNIQUE("staffId",permission));
  INSERT INTO "ServiceAddOnCatalog" VALUES ('s','STEAMFOOT',7,'[{"id":"tea"}]');
  INSERT INTO "StaffPermission" VALUES ('1','staff-a','plans.edit',true),('2','staff-b','plans.edit',false),('3','staff-a','add_ons.manage',false),('4','staff-c','plans.edit',true),('5','staff-d','add_ons.manage',true);`);
  const permissions=(await db.query('SELECT * FROM "StaffPermission" ORDER BY id')).rows;
  await db.exec(readFileSync('prisma/migrations/20261031220000_add_independent_add_ons_feature/migration.sql','utf8'));
  expect((await db.query('SELECT * FROM "ServiceAddOnCatalog"')).rows).toEqual([{storeId:'s',module:'STEAMFOOT',revision:7,groups:[{id:'tea'}],enabled:false}]);
  expect((await db.query('SELECT * FROM "StaffPermission" ORDER BY id')).rows).toEqual(permissions);
  // Reapplying additive schema must not disable a catalog the store later enabled.
  await db.exec('UPDATE "ServiceAddOnCatalog" SET enabled=true,revision=8');
  await db.exec(readFileSync('prisma/migrations/20261031220000_add_independent_add_ons_feature/migration.sql','utf8'));
  expect((await db.query('SELECT enabled,revision,groups FROM "ServiceAddOnCatalog"')).rows).toEqual([{enabled:true,revision:8,groups:[{id:'tea'}]}]);
  expect((await db.query('SELECT * FROM "StaffPermission" ORDER BY id')).rows).toEqual(permissions);
 }finally{await db.close();}
});
