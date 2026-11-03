/** Separate development and production-build checks, both pinned to synthetic loopback. */
function assertScope(env,flag,nodeEnv){
 const other=flag==='BEAUTY_SHARED_PAGES_LOCAL_QA'?'BEAUTY_SHARED_PAGES_BUILD_QA':'BEAUTY_SHARED_PAGES_LOCAL_QA';
 if(env[flag]!=='1'||env.NODE_ENV!==nodeEnv||[other,'VERCEL','VERCEL_ENV','VERCEL_GIT_COMMIT_REF','VERCEL_GIT_REPO_OWNER','VERCEL_GIT_REPO_SLUG','BEAUTY_HOSTED_PREVIEW','BEAUTY_LOCAL_QA','BEAUTY_RELEASE_QA','BEAUTY_SANDBOX_QA','BEAUTY_PRODUCTION_QA','WORKERS_CI_BRANCH','CF_PAGES_BRANCH'].some(k=>env[k])||env.AUTH_URL!=='http://localhost:3123'||env.NEXTAUTH_URL!==env.AUTH_URL||env.BEAUTY_MODULE_ENABLED!=='1'||env.BEAUTY_NOTIFICATIONS_ENABLED!=='0'||env.BEAUTY_DATABASE_URL!==undefined||(env.BEAUTY_DATABASE_MODE??'legacy')!=='legacy')throw Error('Shared-page QA is local-only with notifications disabled');
 for(const key of ['DATABASE_URL','DIRECT_URL']){const u=new URL(env[key]??'');if(u.protocol!=='postgresql:'||u.hostname!=='127.0.0.1'||u.port!=='32771'||u.pathname!=='/beauty_shared_pages_qa'||u.username!=='beauty_shared_pages_app'||!u.password||u.search||u.hash)throw Error('Shared-page QA requires its separate loopback app database');}
}
export function assertBeautySharedPagesLocalQaEnvironment(env){assertScope(env,'BEAUTY_SHARED_PAGES_LOCAL_QA','development');}
export function assertBeautySharedPagesBuildQaEnvironment(env){assertScope(env,'BEAUTY_SHARED_PAGES_BUILD_QA','production');}
