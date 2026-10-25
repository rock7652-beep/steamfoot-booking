import {expect,it} from 'vitest';
import {assertReviewedReleaseEnvironment} from '../../scripts/consultation-preview-scope.mjs';
const env={VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'preview/beauty-hosted-20261021',VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',BEAUTY_HOSTED_PREVIEW:'1',BEAUTY_MODULE_ENABLED:'1',BEAUTY_NOTIFICATIONS_ENABLED:'0',AUTH_SECRET:'synthetic',DATABASE_URL:'postgresql://postgres.ttworfzgwejdeolegkxl:synthetic@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres'};
it('allows only the authorized shared-connection hosted Beauty Preview',()=>expect(assertReviewedReleaseEnvironment(env)).toBe('beauty-hosted-preview'));
it('allows the exact live-issues branch only with the hosted Preview boundary',()=>{
  const fixEnv={...env,VERCEL_GIT_COMMIT_REF:'fix/beauty-live-issues-20261025'};
  expect(assertReviewedReleaseEnvironment(fixEnv)).toBe('beauty-hosted-preview');
  for(const patch of [{BEAUTY_HOSTED_PREVIEW:'0'},{VERCEL_ENV:'production'},{BEAUTY_NOTIFICATIONS_ENABLED:'1'},{VERCEL_GIT_COMMIT_REF:'fix/beauty-live-issues-20261025-other'},{DATABASE_URL:env.DATABASE_URL.replace('ttworfzgwejdeolegkxl','qijlnhtpbintanzpxkvf')}]) {
    expect(()=>assertReviewedReleaseEnvironment({...fixEnv,...patch})).toThrow();
  }
});
it.each([{VERCEL_ENV:'production'},{VERCEL_GIT_COMMIT_REF:'main'},{VERCEL_GIT_REPO_OWNER:'other'},{VERCEL_GIT_REPO_SLUG:'other'},{BEAUTY_HOSTED_PREVIEW:'0'},{BEAUTY_NOTIFICATIONS_ENABLED:'1'},{BEAUTY_MODULE_ENABLED:'yes'},{LINE_CHANNEL_ACCESS_TOKEN:'blocked'},{WEB_LINE_LOGIN_CHANNEL_SECRET:'blocked'},{BEAUTY_DATABASE_MODE:'dedicated'},{BEAUTY_DATABASE_URL:'blocked'},{BEAUTY_RELEASE_QA:'1'},{AUTH_SECRET:''},{DATABASE_URL:env.DATABASE_URL.replace('ttworfzgwejdeolegkxl','qijlnhtpbintanzpxkvf')},{DATABASE_URL:env.DATABASE_URL+'?host=other.invalid'},{WORKERS_CI_BRANCH:'other'}])('rejects unsafe Preview boundary %j',patch=>expect(()=>assertReviewedReleaseEnvironment({...env,...patch})).toThrow());
