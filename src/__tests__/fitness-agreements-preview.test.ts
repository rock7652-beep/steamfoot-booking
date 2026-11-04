import { expect, it } from 'vitest';
import { assertCourseAgreementsPreviewEnvironment } from '../../scripts/course-agreements-preview-scope.mjs';
const env = {
 COURSE_AGREEMENTS_REVIEW:'1',VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'codex/fitness-agreements-preview',
 VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',
 DATABASE_URL:'postgresql://postgres.ttworfzgwejdeolegkxl:synthetic@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres',
 DIRECT_URL:'postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres',
 LINE_CHANNEL_ACCESS_TOKEN:'disabled-course-agreements-rehearsal',WEB_LINE_LOGIN_CHANNEL_SECRET:'disabled-course-agreements-rehearsal',
};
it('permits only the exact opt-in fitness preview with isolated data and no LINE credentials',()=>{
 expect(assertCourseAgreementsPreviewEnvironment(env)).toBe(true);
 for(const override of [{VERCEL_ENV:'production'},{COURSE_AGREEMENTS_REVIEW:''},{DATABASE_URL:env.DATABASE_URL.replaceAll('ttworfzgwejdeolegkxl','qijlnhtpbintanzpxkvf')},{LINE_CHANNEL_ACCESS_TOKEN:'real-token'},{VERCEL_GIT_COMMIT_REF:'main'}]) {
  expect(()=>assertCourseAgreementsPreviewEnvironment({...env,...override})).toThrow('rejected');
 }
});
