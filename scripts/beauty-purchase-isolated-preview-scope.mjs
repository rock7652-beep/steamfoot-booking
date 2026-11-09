import {BEAUTY_PURCHASE_QA_PROJECT_REF,BEAUTY_PURCHASE_QA_BRANCH,BEAUTY_PURCHASE_QA_STORE,isValidBeautyPurchaseQaRef,isValidBeautyPurchaseQaConnection} from '../src/lib/beauty/isolated-purchase-config.mjs';
export {BEAUTY_PURCHASE_QA_PROJECT_REF,BEAUTY_PURCHASE_QA_BRANCH,BEAUTY_PURCHASE_QA_STORE};

/** The configurable ref argument exists only to test the validator. The build
 * gate below always passes the source-controlled, initially-null constant. */
export function validateBeautyPurchaseIsolatedPreview(env,projectRef) {
  if(!isValidBeautyPurchaseQaRef(projectRef))
    throw Error('Beauty isolated purchase Preview project ref is not pinned.');
  if(env.VERCEL!=='1'||env.VERCEL_ENV!=='preview'||env.VERCEL_GIT_COMMIT_REF!==BEAUTY_PURCHASE_QA_BRANCH||
    env.VERCEL_GIT_REPO_OWNER!=='rock7652-beep'||env.VERCEL_GIT_REPO_SLUG!=='steamfoot-booking'||env.WORKERS_CI_BRANCH||env.CF_PAGES_BRANCH||
    env.BEAUTY_ISOLATED_PURCHASE_QA!=='1'||env.BEAUTY_ISOLATED_QA_STORE_ID!==BEAUTY_PURCHASE_QA_STORE||
    env.BEAUTY_MODULE_ENABLED!=='1'||env.BEAUTY_DATABASE_MODE!=='legacy'||env.BEAUTY_DATABASE_URL||
    env.BEAUTY_NOTIFICATIONS_ENABLED!=='0'||env.BEAUTY_PLAN_PURCHASE_INTENTS_ENABLED!=='1'||env.BEAUTY_MEMBER_PURCHASE_INTENTS_ENABLED!=='1'||
    env.BEAUTY_COLLECTION_INTENTS_ENABLED==='1'||env.COURSE_PURCHASE_INTENTS_ENABLED==='1'||env.PRODUCTION_MIGRATION_TARGET||!env.AUTH_SECRET||
    Object.entries(env).some(([key,value])=>!!value&&(/^(LINE_.*(?:TOKEN|SECRET)|WEB_LINE_.*(?:TOKEN|SECRET)|MESSENGER_.*(?:TOKEN|SECRET)|RESEND_API_KEY|SMTP_)/.test(key)))||
    !isValidBeautyPurchaseQaConnection(env.DATABASE_URL,projectRef)||!isValidBeautyPurchaseQaConnection(env.DIRECT_URL,projectRef))
    throw Error('Beauty isolated purchase Preview scope is invalid.');
  return {storeId:BEAUTY_PURCHASE_QA_STORE};
}

export async function verifyBeautyPurchaseIsolatedFixture(env,projectRef,createClient){
  const scope=validateBeautyPurchaseIsolatedPreview(env,projectRef);
  const factory=createClient??(async config=>{const {Client}=await import('pg');return new Client(config);});
  const client=await factory({connectionString:env.DIRECT_URL,connectionTimeoutMillis:5000,statement_timeout:10000,query_timeout:12000});
  try{
    await client.connect();await client.query('BEGIN READ ONLY');
    const stores=await client.query('SELECT id,"industryModule"::text AS module FROM "Store" ORDER BY id LIMIT 2');
    if(stores.rows.length!==1||stores.rows[0].id!==scope.storeId||stores.rows[0].module!=='BEAUTY')throw Error('Beauty isolated purchase Preview fixture scope is invalid.');
    await client.query('ROLLBACK');
  }finally{await client.end();}
  return scope;
}
export async function assertBeautyPurchaseIsolatedPreview(env=process.env){
  return verifyBeautyPurchaseIsolatedFixture(env,BEAUTY_PURCHASE_QA_PROJECT_REF);
}
