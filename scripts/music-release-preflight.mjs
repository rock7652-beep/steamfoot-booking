// Read-only release gate. Never applies DDL, imports rows or sends notifications.
import {fileURLToPath} from 'node:url';
import {MUSIC_OPENING_BRANCH} from './music-opening-preview-scope.mjs';
import {assertMusicNativeReleaseEnvironment,MUSIC_RELEASE_BRANCH} from './music-native-workflow-scope.mjs';
const tables=['CourseScheduleSeries','CourseMusicTuition','CourseMusicReceipt','CourseMusicLessonAssignment','CourseMusicOpeningState','CourseMusicOpeningMakeupEntitlement'];
const columns={CourseBookingRule:['assignedSchedulingEnabled'],CourseSession:['scheduleType','scheduleFrequency','enrollmentMode','enrollmentFingerprint','rescheduleShadowHidden','bookingAudience'],CoursePointCard:['musicOpeningStateRequired'],CourseBooking:['musicOpeningMakeupEntitlementId','musicOpeningTermKey','musicOpeningLessonOrdinal','musicOpeningSourceLessonKey']};
export async function runMusicNativeSchemaPreflight(env=process.env){
 const target=assertMusicNativeReleaseEnvironment(env);
 const {Client}=await import('pg');
 const client=new Client({connectionString:env.DIRECT_URL,connectionTimeoutMillis:5000,statement_timeout:10000,query_timeout:12000});
 try{
  await client.connect();await client.query('BEGIN READ ONLY');
  const objects=await client.query('SELECT relname,relrowsecurity FROM pg_class WHERE relnamespace=\'public\'::regnamespace AND relkind=\'r\' AND relname=ANY($1::text[])',[tables]);
  if(objects.rows.length!==tables.length||objects.rows.some(row=>!row.relrowsecurity))throw Error('Music release tables/RLS not ready');
  const found=await client.query('SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=\'public\' AND table_name=ANY($1::text[])',[Object.keys(columns)]);
  for(const [table,names] of Object.entries(columns))for(const name of names)if(!found.rows.some(r=>r.table_name===table&&r.column_name===name))throw Error('Music release columns not ready');
  const privileges=await client.query('SELECT count(*)::int AS n FROM information_schema.role_table_grants WHERE table_schema=\'public\' AND table_name=ANY($1::text[]) AND grantee=ANY($2::text[])',[tables,['PUBLIC','anon','authenticated']]);
  if(privileges.rows[0].n!==0)throw Error('Music release private grants not ready');
  const functions=await client.query(`SELECT proname,prosecdef FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=ANY($1::text[])`,[['music_lesson_assignment_guard','music_lesson_assignment_release']]);
  if(functions.rows.length!==2||functions.rows.some(r=>r.prosecdef))throw Error('Music release trigger functions not ready');
  const trigger=await client.query(`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O' AND tgname=ANY($1::text[])`,[['music_lesson_assignment_guard','music_lesson_assignment_release']]);
  if(trigger.rows.length!==2)throw Error('Music release triggers not ready');
  const disabled=await client.query(`SELECT conname FROM pg_constraint WHERE connamespace='public'::regnamespace AND convalidated AND conname=ANY($1::text[])`,[['MusicProductionOpeningDisabled','MusicProductionOpeningMakeupDisabled']]);
  // The isolated rehearsal database retains its sealed opening state; only production uses empty compatibility tables.
  if(target==='production'&&disabled.rows.length!==2)throw Error('Production historical imports are not disabled');
  const stores=(env.MUSIC_NATIVE_WORKFLOW_STORE_IDS??'').split(',').map(s=>s.trim()).filter(Boolean);
  if(!stores.length)throw Error('Music native store rollout scope missing');
  const enabled=await client.query(`SELECT DISTINCT "storeId" FROM "StoreFeatureEntitlement" WHERE "storeId"=ANY($1::text[]) AND "featureKey"='business.music' AND status::text='ENABLED'`,[stores]);
  if(enabled.rows.length!==new Set(stores).size)throw Error('Music native store entitlement mismatch');
  await client.query('ROLLBACK');
  return {target,tablesChecked:tables.length};
 }finally{await client.end();}
}
export async function musicBuildPreflight(env=process.env){
 const refs=[env.VERCEL_GIT_COMMIT_REF,env.WORKERS_CI_BRANCH,env.CF_PAGES_BRANCH];
 if(refs.includes(MUSIC_OPENING_BRANCH)){
  const {runMusicOpeningSchemaPreflight}=await import('./music-opening-schema-check.mjs');await runMusicOpeningSchemaPreflight();return;
 }
 if(env.VERCEL_ENV==='production'||refs.includes(MUSIC_RELEASE_BRANCH))await runMusicNativeSchemaPreflight(env);
}
if(process.argv[1]===fileURLToPath(import.meta.url))musicBuildPreflight().catch(()=>{console.error('[music-release-preflight] blocked: verify release scope and schema readiness; no migrations applied');process.exitCode=1;});
