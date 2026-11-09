import {describe,it,expect,vi} from 'vitest';
import {assertReferralReleaseReview,validateReferralCatalog,runReferralReadonlyReview} from '../../scripts/referral-production-release-review.mjs';
const env={VERCEL:'1',VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR',VERCEL_GIT_COMMIT_REF:'main',VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',SUBSCRIPTION_REFERRAL_RELEASE_REVIEW:'1',SUBSCRIPTION_REFERRALS_ENABLED:'false',DATABASE_URL:'postgresql://postgres:synthetic@db.qijlnhtpbintanzpxkvf.supabase.co/postgres?sslmode=require'};
const names=['StoreSubscriptionReferralCode','StoreSubscriptionReferral','StoreSubscriptionReferralPayment','StoreSubscriptionReferralRefundReview','StoreSubscriptionReferralReward','Store','StoreSubscription','StorePlanChange','ConsultationLead'];
const report={project:'qijlnhtpbintanzpxkvf',verified_tls:true,identity:{role:'synthetic-role',read_only:'on'},tables:names.map(name=>({name,present:true,rls_enabled:true,can_select:true,needs_insert:true,can_insert:true,needs_update:true,can_update:true}))};
describe('opt-in production referral read-only review',()=>{
 it('leaves existing builds alone unless explicitly requested',()=>{expect(assertReferralReleaseReview({},'/workspace')).toBe(false);expect(assertReferralReleaseReview({...env,SUBSCRIPTION_REFERRAL_RELEASE_REVIEW:'0'},'/workspace')).toBe(false);});
 it('allows only production main with activity off and no selected migration',()=>{
  expect(assertReferralReleaseReview(env,'/vercel/path0')).toBe(true);
  for(const patch of [{VERCEL_ENV:'preview'},{VERCEL_GIT_COMMIT_REF:'feature'},{SUBSCRIPTION_REFERRALS_ENABLED:'true'},{SUBSCRIPTION_REFERRALS_ENABLED:''},{CONSULTATION_PREVIEW_INTAKE_ENABLED:'true'},{PRODUCTION_MIGRATION_TARGET:'any'},{SUBSCRIPTION_REFERRAL_RELEASE_REVIEW:'true'},{DATABASE_URL:env.DATABASE_URL+'&schema=other'},{DATABASE_URL:env.DATABASE_URL+'&options=unsafe'}])expect(()=>assertReferralReleaseReview({...env,...patch},'/vercel/path0')).toThrow();
 });
 it('accepts only complete read-only target and permission evidence',()=>{
  expect(validateReferralCatalog(report)).toMatchObject({catalogReady:true,transactionReadOnly:true});
  for(const patch of [{project:'other'},{verified_tls:false},{identity:{role:'test',read_only:'off'}},{tables:[]},{tables:report.tables.map((r,i)=>i?r:{...r,can_update:false})}])expect(()=>validateReferralCatalog({...report,...patch})).toThrow();
 });
 it('delegates solely to the existing read-only command and suppresses raw connection errors',()=>{
  const run=vi.fn().mockReturnValue(JSON.stringify(report));expect(runReferralReadonlyReview('/vercel/path0',run).catalogReady).toBe(true);expect(run).toHaveBeenCalledWith(process.execPath,['/vercel/path0/scripts/subscription-referral-runtime-preflight.mjs','--read-only']);
  const fail=()=>{throw Error('secret-connection-must-not-leak')};expect(()=>runReferralReadonlyReview('/vercel/path0',fail)).toThrow('no connection details');expect(()=>runReferralReadonlyReview('/vercel/path0',fail)).not.toThrow('secret-connection-must-not-leak');
 });
});
