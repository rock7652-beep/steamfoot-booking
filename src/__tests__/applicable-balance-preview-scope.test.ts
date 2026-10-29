import { expect, it } from 'vitest';
import { assertReviewedReleaseEnvironment } from '../../scripts/consultation-preview-scope.mjs';
import { assertSportsRedesignPreviewEnvironment } from '../../scripts/sports-redesign-preview-scope.mjs';
const env={VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'feat/roster-applicable-balance',VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',SPORTS_REDESIGN_STAGING:'1',SPORTS_REDESIGN_PREVIEW:'1',DATABASE_URL:'postgresql://postgres.ttworfzgwejdeolegkxl:synthetic@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true',DIRECT_URL:'postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres'};
it('uses the existing migration-free isolated Preview mode for this exact branch',()=>{
 expect(assertReviewedReleaseEnvironment(env)).toBe('sports-redesign-preview');
});
it.each([
 {VERCEL_ENV:'production'},
 {VERCEL_GIT_COMMIT_REF:'main'},
 {VERCEL_GIT_REPO_SLUG:'another-repository'},
 {DIRECT_URL:'postgresql://postgres:synthetic@db.qijlnhtpbintanzpxkvf.supabase.co:5432/postgres'},
 {DATABASE_URL:'postgresql://postgres:synthetic@db.qijlnhtpbintanzpxkvf.supabase.co:5432/postgres'},
])('rejects target or database drift %s',override=>{
 expect(()=>assertSportsRedesignPreviewEnvironment({...env,...override})).toThrow();
});
