import {expect,it} from 'vitest';
import {assertSportsRedesignPreviewEnvironment} from '../../scripts/sports-redesign-preview-scope.mjs';
import {assertSportsSharedCardPreviewEnvironment,CALENDAR_PHASE_PREVIEW_BRANCH} from '../../scripts/sports-shared-card-preview-scope.mjs';
const env={SPORTS_REDESIGN_STAGING:'1',SPORTS_REDESIGN_PREVIEW:'1',VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:CALENDAR_PHASE_PREVIEW_BRANCH,VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',DATABASE_URL:'postgresql://postgres.ttworfzgwejdeolegkxl@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres',DIRECT_URL:'postgresql://postgres@db.ttworfzgwejdeolegkxl.supabase.co/postgres'};
it('accepts only the exact isolated calendar performance branch',()=>{
 expect(()=>assertSportsRedesignPreviewEnvironment(env)).not.toThrow();
 expect(()=>assertSportsSharedCardPreviewEnvironment(env)).not.toThrow();
});
it.each([{VERCEL_ENV:'production'},{VERCEL_GIT_COMMIT_REF:CALENDAR_PHASE_PREVIEW_BRANCH+'-other'},{VERCEL_GIT_REPO_OWNER:'other'},{DATABASE_URL:env.DATABASE_URL.replace('ttworfzgwejdeolegkxl','qijlnhtpbintanzpxkvf')},{SPORTS_REDESIGN_PREVIEW:''},{WORKERS_CI_BRANCH:CALENDAR_PHASE_PREVIEW_BRANCH}])('rejects a changed isolation boundary %j',patch=>expect(()=>assertSportsRedesignPreviewEnvironment({...env,...patch})).toThrow());
