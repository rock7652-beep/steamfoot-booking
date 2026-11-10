import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { assertCoursePhoneAPreview, COURSE_PHONE_A_PREVIEW_BRANCH } from '../../scripts/course-phone-a-preview-scope.mjs';
import { assertReviewedReleaseEnvironment } from '../../scripts/consultation-preview-scope.mjs';
const url='postgresql://postgres:fixture@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres';
const env={VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:COURSE_PHONE_A_PREVIEW_BRANCH,VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',DATABASE_URL:url,DIRECT_URL:url,AUTH_SECRET:'fixture-only-not-a-real-secret',STORE_LINE_CONFIG_JSON:JSON.stringify([{storeId:'store-course-start-0918-a',slug:'course-start-0918-a',liffId:'2010761154-2BkMDceh'}])};
it('only authorizes the existing A entry on its isolated Preview, without changing another release mode',()=>{
 expect(assertCoursePhoneAPreview(env)).toBe(true);
 expect(assertReviewedReleaseEnvironment(env)).toBe('course-phone-preview');
 expect(assertCoursePhoneAPreview({...env,VERCEL_GIT_COMMIT_REF:'unrelated'})).toBe(false);
});
it.each([
 {VERCEL_ENV:'production'}, {VERCEL:'0'}, {VERCEL_GIT_REPO_OWNER:'other'}, {WORKERS_CI_BRANCH:COURSE_PHONE_A_PREVIEW_BRANCH},
 {DATABASE_URL:url.replace('ttworfzgwejdeolegkxl','qijlnhtpbintanzpxkvf')}, {DIRECT_URL:url+'?host=production'},
 {DIRECT_URL:url+'?schema=private'}, {DIRECT_URL:url+'?connection_limit=1&connection_limit=2'},
 {ADDONS_DATABASE_URL:url}, {BEAUTY_DATABASE_URL:url}, {PRODUCTION_MIGRATION_TARGET:'anything'},
 {PREVIEW_LINE_ACCEPTANCE_ENABLED:'1'}, {BEAUTY_NOTIFICATIONS_ENABLED:'1'}, {STORE_LINE_CONFIG_JSON:'[]'}, {AUTH_SECRET:''},
])('rejects unsafe build/runtime scope %j',changes=>{
 expect(()=>assertCoursePhoneAPreview({...env,...changes})).toThrow();
});
it('the migration dispatcher exits before any DB client or migration on the A preview',()=>{
 const result=spawnSync(process.execPath,['scripts/ci-migrate.mjs'],{cwd:process.cwd(),env:{...process.env,...env},encoding:'utf8',timeout:15000});
 expect(result.status).toBe(0);expect(result.stdout).toContain('migrations_skipped=true');expect(result.stdout).not.toContain('prisma migrate');
});
