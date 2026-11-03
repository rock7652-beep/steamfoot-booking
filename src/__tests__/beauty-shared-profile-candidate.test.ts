import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
it('installs and reruns additive profiles/window candidates without replacing existing technician data',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE "BeautyTechnician"(id text PRIMARY KEY,name text);INSERT INTO "BeautyTechnician" VALUES('t','原姓名');CREATE TABLE "BeautySetting"("storeId" text PRIMARY KEY);INSERT INTO "BeautySetting" VALUES('s');CREATE TABLE "CourseRental"(id text);CREATE ROLE candidate_role;SET beauty_migration.app_role='candidate_role';`);
 for(let pass=0;pass<2;pass++)for(const file of ['beauty-shared-technician-profile-candidate.sql','beauty-shared-booking-window-candidate.sql','beauty-shared-rental-access-candidate.sql'])await db.exec(readFileSync('scripts/sql/'+file,'utf8'));
 expect((await db.query('SELECT * FROM "BeautyTechnician"')).rows).toEqual([{id:'t',name:'原姓名',phone:'',contactEmail:'',birthday:'',emergencyContactName:'',emergencyContactPhone:'',emergencyContactRelation:''}]);
 await db.exec(`UPDATE "BeautyTechnician" SET phone='0912345678',"contactEmail"='tech@example.invalid',birthday='1990-03-04' WHERE id='t'`);expect((await db.query('SELECT phone,"contactEmail",birthday FROM "BeautyTechnician" WHERE id=\'t\'')).rows[0]).toMatchObject({phone:'0912345678',birthday:'1990-03-04'});
 expect((await db.query(`SELECT has_table_privilege('candidate_role','"CourseRental"','SELECT') AS read,has_table_privilege('candidate_role','"CourseRental"','INSERT') AS write`)).rows[0]).toEqual({read:true,write:false});
 expect((await db.query('SELECT "bookableUntilDate" FROM "BeautySetting"')).rows[0]).toEqual({bookableUntilDate:null});
 }finally{await db.close();}
},30000);
