import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
it('adds empty defaults without rewriting historical amounts and isolates image storage',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE "BeautyService"(id text PRIMARY KEY,price int);CREATE TABLE "BeautyAppointment"(id text PRIMARY KEY,price int,duration int);INSERT INTO "BeautyService" VALUES ('s',900);INSERT INTO "BeautyAppointment" VALUES ('b',900,60);CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE ROLE beauty_addons_app LOGIN;SET beauty_migration.app_role='beauty_addons_app';`);
 const sql=readFileSync('scripts/sql/beauty-add-on-items-candidate.sql','utf8');await db.exec(sql);await db.exec(sql);
 const {rows}=await db.query(`SELECT price,duration,"addOnItems","baseServiceDuration" FROM "BeautyAppointment"`);
 expect(rows).toEqual([{price:900,duration:60,addOnItems:[],baseServiceDuration:null}]);
 const policies=await db.query(`SELECT policyname FROM pg_policies WHERE tablename='BeautyServiceImage'`);expect(policies.rows).toHaveLength(1);
 await db.exec('SET ROLE anon');await expect(db.query('SELECT * FROM "BeautyServiceImage"')).rejects.toThrow('permission denied');
 }finally{await db.close();}
},20000);
