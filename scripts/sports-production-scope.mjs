/** Production environment validation; module eligibility is checked server-side.
 * @param {string | undefined} storeId
 * @param {Record<string,string|undefined>} env
 */
export function sportsProductionEnabled(storeId, env = process.env) {
 if (env.VERCEL_ENV !== 'production') return false;
 const project='qijlnhtpbintanzpxkvf';
 const productionUrl=value=>{try{const u=new URL(value);return ['postgres:','postgresql:'].includes(u.protocol)&&u.pathname==='/postgres'&&(u.hostname===`db.${project}.supabase.co`||(u.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(u.username).endsWith(`.${project}`)));}catch{return false;}};
 if(env.VERCEL!=='1'||env.VERCEL_ENV!=='production'||env.NODE_ENV!=='production'||env.VERCEL_GIT_COMMIT_REF!=='main'||env.VERCEL_GIT_REPO_OWNER!=='rock7652-beep'||env.VERCEL_GIT_REPO_SLUG!=='steamfoot-booking'||env.WORKERS_CI_BRANCH||env.CF_PAGES_BRANCH||env.SPORTS_REDESIGN_STAGING||env.SPORTS_REDESIGN_PREVIEW||env.SPORTS_LIVE_FLOW_QA||![env.DATABASE_URL,env.DIRECT_URL].every(productionUrl)) throw new Error('Sports production requires main, the production project and disabled QA flags.');
 return Boolean(storeId);
}
/** Persisted rules survive disabling the new UI.
 * @param {Record<string,string|undefined>} env
 */
export function sportsProductionRulesEnvironment(env=process.env){
 if(env.VERCEL_ENV!=='production')return false;
 sportsProductionEnabled(undefined,{...env,SPORTS_REDESIGN_PRODUCTION:'1',SPORTS_REDESIGN_STORE_IDS:''});
 return true;
}
