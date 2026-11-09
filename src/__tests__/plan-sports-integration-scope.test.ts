import {expect,it} from 'vitest';
import {assertSportsRedesignPreviewEnvironment} from '../../scripts/sports-redesign-preview-scope.mjs';
import {assertReviewedReleaseEnvironment} from '../../scripts/consultation-preview-scope.mjs';
import {musicNativeWorkflowEnabled,assertMusicNativeReleaseEnvironment} from '../../scripts/music-native-workflow-scope.mjs';
import {assertMusicOpeningPreviewEnvironment} from '../../scripts/music-opening-preview-scope.mjs';
const url='postgresql://postgres:fake@db.ttworfzgwejdeolegkxl.supabase.co/postgres';
const safe:NodeJS.ProcessEnv={NODE_ENV:"test",VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'review/plan-management-sports-performance',VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',SPORTS_REDESIGN_PREVIEW:'1',SPORTS_REDESIGN_STAGING:'1',DATABASE_URL:url,DIRECT_URL:url};
it.each(['review/plan-management-sports-performance','fix/calendar-restored-month-consistency','fix/beauty-collection-calendar-remount'])('reviewed Preview %s requires exact branch, repository, both isolated connections and opt-ins',(branch)=>{
 const scoped={...safe,VERCEL_GIT_COMMIT_REF:branch};
 expect(assertReviewedReleaseEnvironment(scoped)).toBe('sports-redesign-preview');
 for(const mutation of [{VERCEL_ENV:'production'},{VERCEL_GIT_COMMIT_REF:'main'},{VERCEL_GIT_REPO_OWNER:'other'},{VERCEL_GIT_REPO_SLUG:'other'},{SPORTS_REDESIGN_PREVIEW:''},{SPORTS_REDESIGN_STAGING:''},{DATABASE_URL:'postgresql://postgres@db.qijlnhtpbintanzpxkvf.supabase.co/postgres'},{DIRECT_URL:'postgresql://postgres@db.qijlnhtpbintanzpxkvf.supabase.co/postgres'},{WORKERS_CI_BRANCH:'main'}])expect(()=>assertSportsRedesignPreviewEnvironment({...scoped,...mutation})).toThrow();
});
it.each(['review/plan-management-sports-performance','fix/silverlily-calendar-loading-20261031'])('music capability %s stays confined to the existing isolated store and authorizes neither imports nor releases',(branch)=>{
 const scoped={...safe,VERCEL_GIT_COMMIT_REF:branch};
 expect(musicNativeWorkflowEnabled('store-lubymusic',scoped)).toBe(true);expect(musicNativeWorkflowEnabled('another-store',scoped)).toBe(false);
 for(const mutation of [{VERCEL_ENV:'production'},{VERCEL_GIT_COMMIT_REF:'main'},{VERCEL_GIT_REPO_OWNER:'other'},{VERCEL_GIT_REPO_SLUG:'other'},{DATABASE_URL:'postgresql://postgres@db.qijlnhtpbintanzpxkvf.supabase.co/postgres'},{DIRECT_URL:'postgresql://postgres@db.qijlnhtpbintanzpxkvf.supabase.co/postgres'},{CF_PAGES_BRANCH:'main'}])expect(musicNativeWorkflowEnabled('store-lubymusic',{...scoped,...mutation})).toBe(false);
 expect(()=>assertMusicOpeningPreviewEnvironment(safe)).toThrow();expect(()=>assertMusicNativeReleaseEnvironment(safe)).toThrow();
});
