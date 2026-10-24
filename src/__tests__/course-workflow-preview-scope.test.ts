import {it,expect} from 'vitest';
import {courseWorkflowSportsPreview} from '../../scripts/course-workflow-preview-scope.mjs';
const env={NODE_ENV:'test' as const,VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'release/music-production-20261023',VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',DATABASE_URL:'postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres',DIRECT_URL:'postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres'};
it('enables only the existing sports fixture on this exact isolated review',()=>{
 expect(courseWorkflowSportsPreview('sports-live-flow-store',env)).toBe(true);
 expect(courseWorkflowSportsPreview('store-lubymusic',env)).toBe(false);
 expect(courseWorkflowSportsPreview('another-store',env)).toBe(false);
});
it.each([{VERCEL_ENV:'production'},{VERCEL_GIT_COMMIT_REF:'main'},{VERCEL:'0'},{VERCEL_GIT_REPO_OWNER:'other'},{WORKERS_CI_BRANCH:'main'},{CF_PAGES_BRANCH:'main'},{DATABASE_URL:'postgresql://synthetic@localhost/postgres'},{DIRECT_URL:'postgresql://synthetic@db.qijlnhtpbintanzpxkvf.supabase.co/postgres'}])('does not expand access for %j',overrides=>{
 expect(courseWorkflowSportsPreview('sports-live-flow-store',{...env,...overrides})).toBe(false);
});
