export const REFERRAL_QA_PROJECT='prj_09HrzKOJ4Iu5LKouVry9VeXiC8LJ';
export const REFERRAL_QA_BRANCH='content/marketing-beauty-addons-20261104';
export const REFERRAL_QA_DATABASE='ttworfzgwejdeolegkxl';
export const REFERRAL_QA_ROLE='steamfoot_referral_qa_20261105';
export const REFERRAL_QA_STORES=['referral-qa-20261105-a','referral-qa-20261105-b','referral-qa-20261105-c'];
export function isReferralQaConnection(value){
 try{
  const u=new URL(value);const direct=u.hostname===`db.${REFERRAL_QA_DATABASE}.supabase.co`&&u.username===REFERRAL_QA_ROLE;
  const pooled=['aws-0-ap-northeast-1.pooler.supabase.com','aws-1-ap-northeast-1.pooler.supabase.com'].includes(u.hostname)&&u.username===`${REFERRAL_QA_ROLE}.${REFERRAL_QA_DATABASE}`;
  const allowed=new Set(['sslmode','schema','pgbouncer','connection_limit','connect_timeout','pool_timeout']);
  return ['postgres:','postgresql:'].includes(u.protocol)&&!!u.password&&u.pathname==='/postgres'&&!u.hash&&(direct||pooled)&&['','5432','6543'].includes(u.port)&&u.searchParams.get('sslmode')==='require'&&[...u.searchParams].every(([k,v])=>allowed.has(k)&&v!==''&&u.searchParams.getAll(k).length===1&&(k!=='schema'||v==='public'));
 }catch{return false;}
}
/** Exact dedicated Preview only; never grants main or another project access.
 * @param {Readonly<Record<string,string|undefined>>} [env]
 */
export function assertSubscriptionReferralQa(env=process.env){
 if(env.SUBSCRIPTION_REFERRAL_QA!=='1')return false;
 if(env.VERCEL!=='1'||env.VERCEL_ENV!=='preview'||env.VERCEL_PROJECT_ID!==REFERRAL_QA_PROJECT||env.VERCEL_GIT_COMMIT_REF!==REFERRAL_QA_BRANCH||env.VERCEL_GIT_REPO_OWNER!=='rock7652-beep'||env.VERCEL_GIT_REPO_SLUG!=='steamfoot-booking'||env.WORKERS_CI_BRANCH||env.CF_PAGES_BRANCH||env.PRODUCTION_MIGRATION_TARGET||!env.AUTH_SECRET||env.SUBSCRIPTION_REFERRALS_ENABLED!=='true'||env.CONSULTATION_HQ_ENABLED!=='true'||env.CONSULTATION_PREVIEW_INTAKE_ENABLED!=='true'||![env.DATABASE_URL,env.DIRECT_URL].every(isReferralQaConnection)||Object.entries(env).some(([k,v])=>v&&/^(?:LINE_.*(?:TOKEN|SECRET)|WEB_LINE_.*(?:TOKEN|SECRET)|MESSENGER_.*(?:TOKEN|SECRET)|RESEND_API_KEY|SMTP_|SHEETS_WEBHOOK|EC_PAY|ECPAY_)/.test(k)))throw Error('Referral QA requires its dedicated Preview project, exact branch, restricted isolated role and no delivery credentials');
 return true;
}
export function referralQaRoute(path){
 if(path==='/')return {destination:'/referral-test',redirect:true};
 const m=path.match(/^\/s\/(referral-qa-20261105-[abc])\/admin\/dashboard\/settings\/subscription-referrals$/);
 if(m)return {destination:'/dashboard/settings/subscription-referrals'};
 const pages=['/referral-test','/hq/login','/hq/dashboard/stores/referrals','/dashboard/settings/subscription-referrals','/pricing/referral','/api/subscription-referrals/availability','/pricing/submit','/apply','/pricing/apply.html','/pricing','/pricing/features','/privacy'];
 if(pages.includes(path)||/^\/api\/auth\/(?:session|csrf|providers|signin|signout|error|callback\/credentials)$/.test(path)||path.startsWith('/_next/static/')||/^\/pricing\/(?:brand|images)\/[a-zA-Z0-9/_-]+\.(?:png|jpg|jpeg|webp|svg)$/.test(path))return {destination:path==='/apply'?'/pricing/apply.html':path};
 return null;
}
