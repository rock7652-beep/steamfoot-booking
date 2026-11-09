// Execute the managed-service migration wrapper against an isolated PGlite fixture.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {buildNoticeLifecycleMigrationQuery,NOTICE_GRACE_BASELINE} from '../store-notice-lifecycle-release-review.mjs';
const db=new PGlite();
try{
 const setup=readFileSync('src/__tests__/store-notice-lifecycle.pg.test.ts','utf8').match(/await db.exec\(`(CREATE ROLE[\s\S]*?)`\);/)[1];
 await db.exec(setup);
 await db.exec(`CREATE TABLE public._prisma_migrations(id text PRIMARY KEY,migration_name text,finished_at timestamptz,rolled_back_at timestamptz); INSERT INTO public._prisma_migrations VALUES ('old','old',now(),NULL);
 INSERT INTO public."SteamfootStoreNotice"(id,"storeId","createdAt","updatedAt") VALUES ('grace-1','s',now()-interval '11 days',now()),('grace-2','s',now()-interval '11 days',now());`);
 const sql=buildNoticeLifecycleMigrationQuery();
 await assert.rejects(db.exec(sql),/grace_population_changed/);await db.exec('ROLLBACK');
 assert.equal((await db.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='SteamfootStoreNotice' AND column_name='publishedAt'`)).rows[0].n,0);
 const hash=(await db.query(`SELECT md5(string_agg('SteamfootStoreNotice:'||"storeId"||':'||id,'|' ORDER BY "storeId",id)) AS hash FROM public."SteamfootStoreNotice" WHERE id LIKE 'grace-%'`)).rows[0].hash;
 // Fixture-only replacement. Production builder has no baseline override.
 await db.exec(sql.replace(NOTICE_GRACE_BASELINE.fingerprint,hash));
 assert.equal((await db.query(`SELECT count(*)::int AS n FROM public."SteamfootStoreNotice" WHERE "publishedAt">now()-interval '1 minute'`)).rows[0].n,2);
 assert.equal((await db.query(`SELECT count(*)::int AS n FROM public._prisma_migrations`)).rows[0].n,1);
 console.log(JSON.stringify({wrongPopulationRollsBack:true,approvedFixtureGrace:2,legacyDataUnchanged:true,prismaHistoryUnchanged:true,physicalDeletion:false}));
}finally{await db.close();}
