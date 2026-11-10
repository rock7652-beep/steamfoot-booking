import {expect,it} from 'vitest';
import {assertCompactOperationsPreview,customerOverviewPreviewStore,CUSTOMER_OVERVIEW_PREVIEW_BRANCH,COMPACT_OPERATIONS_PROJECT} from '../../scripts/compact-operations-preview-scope.mjs';
import {musicNativeWorkflowEnabled} from '../../scripts/music-native-workflow-scope.mjs';
const url='postgresql://steamfoot_compact_qa_20261103.ttworfzgwejdeolegkxl:synthetic-only@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require';
const env={VERCEL:'1',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:COMPACT_OPERATIONS_PROJECT,VERCEL_GIT_COMMIT_REF:CUSTOMER_OVERVIEW_PREVIEW_BRANCH,VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',COMPACT_OPERATIONS_PREVIEW:'1',BEAUTY_DATABASE_MODE:'legacy',BEAUTY_MODULE_ENABLED:'1',BEAUTY_NOTIFICATIONS_ENABLED:'0',AUTH_SECRET:'synthetic-only',DATABASE_URL:url,DIRECT_URL:url};
it('permits the current candidate only under the existing restricted QA project',()=>expect(assertCompactOperationsPreview(env)).toBe(true));
it('enables native workflows only for their exact synthetic demo stores',()=>{
 for(const [module,id] of [['sports','addons-qa-fitness'],['music','addons-qa-music'],['beauty','addons-qa-beauty']]){
  expect(customerOverviewPreviewStore(module,id,env)).toBe(true);
  expect(customerOverviewPreviewStore(module,'real-store',env)).toBe(false);
  expect(customerOverviewPreviewStore(module,id,{...env,VERCEL_GIT_COMMIT_REF:'main'})).toBe(false);
 }
 expect(musicNativeWorkflowEnabled('addons-qa-music',env)).toBe(true);
 expect(musicNativeWorkflowEnabled('store-lubymusic',env)).toBe(false);
});
it.each([{VERCEL_ENV:'production'},{VERCEL_PROJECT_ID:'production-project'},{VERCEL_GIT_REPO_SLUG:'wrong'},{WORKERS_CI_BRANCH:CUSTOMER_OVERVIEW_PREVIEW_BRANCH},{LINE_CHANNEL_ACCESS_TOKEN:'blocked'},{BEAUTY_NOTIFICATIONS_ENABLED:'1'},{DATABASE_URL:url.replace('ttworfzgwejdeolegkxl','qijlnhtpbintanzpxkvf')},{DIRECT_URL:url.replace('steamfoot_compact_qa_20261103','postgres')}])('rejects unsafe preview configuration %j',patch=>{
 expect(()=>assertCompactOperationsPreview({...env,...patch})).toThrow();
 expect(()=>customerOverviewPreviewStore('music','addons-qa-music',{...env,...patch})).toThrow();
});
