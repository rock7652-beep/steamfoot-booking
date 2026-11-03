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
const bellEnv={...env,VERCEL_GIT_COMMIT_REF:'feat/store-manager-bell-20261030'};
it('allows the digital manager native sports fixture only in its isolated Preview',()=>{
 expect(courseWorkflowSportsPreview('dm-bell-sports',bellEnv)).toBe(true);
 for(const id of ['staging-store','dm-bell-music','dm-bell-beauty','sports-live-flow-store','other'])expect(courseWorkflowSportsPreview(id,bellEnv)).toBe(false);
});
it.each([{VERCEL_ENV:'production'},{VERCEL_ENV:'development'},{VERCEL_GIT_COMMIT_REF:'main'},{VERCEL:'0'},{VERCEL_GIT_REPO_OWNER:'other'},{VERCEL_GIT_REPO_SLUG:'other'},{WORKERS_CI_BRANCH:'main'},{CF_PAGES_BRANCH:'main'},{DATABASE_URL:'postgresql://postgres@db.qijlnhtpbintanzpxkvf.supabase.co:5432/postgres'},{DIRECT_URL:'postgresql://postgres@db.qijlnhtpbintanzpxkvf.supabase.co:5432/postgres'},{DATABASE_URL:bellEnv.DATABASE_URL+'?options=role%3Dpostgres'},{DIRECT_URL:bellEnv.DIRECT_URL+'?schema=private'}])('rejects unsafe digital manager Preview configuration %j',overrides=>{
 expect(courseWorkflowSportsPreview('dm-bell-sports',{...bellEnv,...overrides})).toBe(false);
});
