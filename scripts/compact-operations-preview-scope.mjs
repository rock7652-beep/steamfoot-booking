export const COURSE_SUBJECT_PREVIEW_BRANCH='feat/course-subject-entitlement-20261110';
export const CALENDAR_TRANSACTION_PREVIEW_BRANCH='fix/silverlily-calendar-transaction-timeout-20261110';
export const CUSTOMER_OVERVIEW_PREVIEW_BRANCH='feat/customer-overview-alignment-20261110';
export const COMPACT_OPERATIONS_BRANCH='feat/beauty-operations-compact-20261103';
export const MUSIC_FITNESS_COMPACT_BRANCH='feat/music-fitness-compact-20261103';
export const UNIFIED_CUSTOMER_FILTERS_BRANCH='fix/course-customer-filters-unified-20261103';
export const BOOKING_CALENDAR_PREVIEW_BRANCH='fix/steam-plan-reschedule-20261103';
export const BEAUTY_SERVICE_JOURNEY_BRANCH='feat/beauty-service-journey-20261103';
const COMPACT_PREVIEW_BRANCHES=[COURSE_SUBJECT_PREVIEW_BRANCH,CALENDAR_TRANSACTION_PREVIEW_BRANCH,CUSTOMER_OVERVIEW_PREVIEW_BRANCH,BEAUTY_SERVICE_JOURNEY_BRANCH,COMPACT_OPERATIONS_BRANCH,MUSIC_FITNESS_COMPACT_BRANCH,UNIFIED_CUSTOMER_FILTERS_BRANCH,BOOKING_CALENDAR_PREVIEW_BRANCH];
export const COMPACT_OPERATIONS_PROJECT='prj_Aq5uK16Dc49OAUPJnP5VtnVAEdTs';
export const COMPACT_OPERATIONS_DATABASE='ttworfzgwejdeolegkxl';
export const COMPACT_OPERATIONS_ROLE='steamfoot_compact_qa_20261103';

export function isCompactOperationsConnection(value){
 try{
  const url=new URL(value);
  const direct=url.hostname===`db.${COMPACT_OPERATIONS_DATABASE}.supabase.co`&&url.username===COMPACT_OPERATIONS_ROLE;
  const pooled=['aws-0-ap-northeast-1.pooler.supabase.com','aws-1-ap-northeast-1.pooler.supabase.com'].includes(url.hostname)&&url.username===`${COMPACT_OPERATIONS_ROLE}.${COMPACT_OPERATIONS_DATABASE}`;
  const allowed=new Set(['sslmode','schema','pgbouncer','connection_limit','connect_timeout','pool_timeout']);
  return ['postgres:','postgresql:'].includes(url.protocol)&&!!url.password&&url.pathname==='/postgres'&&!url.hash&&
   (direct||pooled)&&['','5432','6543'].includes(url.port)&&url.searchParams.get('sslmode')==='require'&&
   [...url.searchParams].every(([key,value])=>allowed.has(key)&&value!==''&&(key!=='schema'||value==='public'));
 }catch{return false;}
}

/** This opt-in belongs only to the dedicated, non-production QA project.
 * @param {Readonly<Record<string,string|undefined>>} env
 */
export function assertCompactOperationsPreview(env=process.env){
 if(env.COMPACT_OPERATIONS_PREVIEW!=='1'&&!COMPACT_PREVIEW_BRANCHES.includes(env.VERCEL_GIT_COMMIT_REF??''))return false;
 if(env.VERCEL!=='1'||env.VERCEL_ENV!=='preview'||env.VERCEL_PROJECT_ID!==COMPACT_OPERATIONS_PROJECT||
  !COMPACT_PREVIEW_BRANCHES.includes(env.VERCEL_GIT_COMMIT_REF??'')||env.VERCEL_GIT_REPO_OWNER!=='rock7652-beep'||env.VERCEL_GIT_REPO_SLUG!=='steamfoot-booking'||
  env.WORKERS_CI_BRANCH||env.CF_PAGES_BRANCH||env.PRODUCTION_MIGRATION_TARGET||env.BEAUTY_DATABASE_URL||
  env.BEAUTY_DATABASE_MODE!=='legacy'||env.BEAUTY_MODULE_ENABLED!=='1'||env.BEAUTY_NOTIFICATIONS_ENABLED!=='0'||!env.AUTH_SECRET||
  ![env.DATABASE_URL,env.DIRECT_URL].every(isCompactOperationsConnection)||
  Object.entries(env).some(([key,value])=>!!value&&/^(LINE_.*(?:TOKEN|SECRET)|WEB_LINE_.*(?:TOKEN|SECRET)|MESSENGER_.*(?:TOKEN|SECRET)|RESEND_API_KEY|SMTP_)/.test(key)))
  throw Error('Compact operations Preview requires its dedicated project, branch, restricted isolated database and disabled deliveries.');
 return true;
}

/** Only this approved calendar comparison, exact QA project/role and synthetic sports store.
 * @param {string|undefined} storeId
 * @param {Readonly<Record<string,string|undefined>>} env
 */
export function calendarPerformanceSportsPreview(storeId,env=process.env){
 if(storeId!=='sports-live-flow-store'||env.VERCEL_GIT_COMMIT_REF!==BOOKING_CALENDAR_PREVIEW_BRANCH)return false;
 return assertCompactOperationsPreview(env);
}

/** Current customer-profile acceptance: three existing synthetic demo stores only.
 * @param {string} module
 * @param {string|undefined} storeId
 * @param {Readonly<Record<string,string|undefined>>} env
 */
export function customerOverviewPreviewStore(module,storeId,env=process.env){
 const stores={sports:'addons-qa-fitness',music:'addons-qa-music',beauty:'addons-qa-beauty'};
 if(![CUSTOMER_OVERVIEW_PREVIEW_BRANCH,CALENDAR_TRANSACTION_PREVIEW_BRANCH].includes(env.VERCEL_GIT_COMMIT_REF??'')||!Object.hasOwn(stores,module)||storeId!==stores[module]||(env.VERCEL_GIT_COMMIT_REF===CALENDAR_TRANSACTION_PREVIEW_BRANCH&&module!=='sports'))return false;
 return assertCompactOperationsPreview(env);
}

/** Subject entitlement rehearsal uses only the existing synthetic QA fitness store. */
export function courseSubjectSportsPreview(storeId,env=process.env){
 if(storeId!=='addons-qa-fitness'||env.VERCEL_GIT_COMMIT_REF!==COURSE_SUBJECT_PREVIEW_BRANCH)return false;
 return assertCompactOperationsPreview(env);
}
