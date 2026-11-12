import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {afterAll,beforeAll,expect,it} from 'vitest';
import {cardChargeSettings,courseChargeAllowsProvider,courseChargeSettings} from '@/lib/course-charge-settings';
let db:PGlite;
const selected={kind:'plan',durationMinutes:50,trialPrice:null,trialDuration:null,providerIds:['old-teacher']};
beforeAll(async()=>{
 db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;
 CREATE TABLE "CoursePointPlan"(id text,"storeId" text,"chargeSettings" jsonb);
 CREATE TABLE "CoursePointCard"(id text,"storeId" text,"planId" text);
 INSERT INTO "CoursePointPlan" VALUES('p','s','${JSON.stringify(selected)}'),('p','other','{"providerIds":["foreign"]}');
 INSERT INTO "CoursePointCard" VALUES('old','s','p'),('foreign','other','p');`);
 await db.exec(readFileSync(new URL('../../prisma/migrations/20261112071000_course_card_provider_agreement/migration.sql',import.meta.url),'utf8'));
},30000);
afterAll(async()=>db.close());
const read=async(id:string)=>(await db.query<{chargeSettingsSnapshot:unknown}>('SELECT "chargeSettingsSnapshot" FROM "CoursePointCard" WHERE id=$1',[id])).rows[0];
it('backfills sold cards within the same tenant and preserves them after catalog edits',async()=>{
 expect((await read('old')).chargeSettingsSnapshot).toEqual(selected);
 expect((await read('foreign')).chargeSettingsSnapshot).toEqual({providerIds:['foreign']});
 await db.query('UPDATE "CoursePointPlan" SET "chargeSettings"=$1 WHERE id=$2 AND "storeId"=$3',[JSON.stringify({...selected,providerScope:'QUALIFIED',providerIds:[]}),'p','s']);
 const old=courseChargeSettings.parse(cardChargeSettings(await read('old')));
 expect(courseChargeAllowsProvider(old,'new-teacher')).toBe(false);
 await db.exec(`INSERT INTO "CoursePointCard"(id,"storeId","planId","chargeSettingsSnapshot") VALUES('new','s','p','{"providerIds":["forged"]}')`);
 const current=courseChargeSettings.parse(cardChargeSettings(await read('new')));
 expect(courseChargeAllowsProvider(current,'new-teacher')).toBe(true);
 expect((await read('old')).chargeSettingsSnapshot).toEqual(selected);
});
it('refuses rewriting purchased provider agreements',async()=>{
 await expect(db.exec(`UPDATE "CoursePointCard" SET "chargeSettingsSnapshot"='{}' WHERE id='old'`)).rejects.toThrow('immutable');
});

it('does not expose its capture function to public API roles',async()=>{
 const result=await db.query<{allowed:boolean}>("SELECT has_function_privilege('anon','course_card_capture_charge_settings()','EXECUTE') AS allowed");
 expect(result.rows[0].allowed).toBe(false);
});
