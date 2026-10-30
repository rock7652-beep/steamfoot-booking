import {test} from 'node:test';
import assert from 'node:assert/strict';
import {musicNativeWorkflowEnabled,assertMusicNativeReleaseEnvironment,MUSIC_RELEASE_BRANCH} from './music-native-workflow-scope.mjs';
const connection=ref=>`postgresql://postgres:fake@db.${ref}.supabase.co:5432/postgres`;
const env={VERCEL:'1',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'main',VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',DATABASE_URL:connection('qijlnhtpbintanzpxkvf'),DIRECT_URL:connection('qijlnhtpbintanzpxkvf'),MUSIC_NATIVE_WORKFLOW_STORE_IDS:'synthetic-store'};
test('production capability requires exact repository, branch, database and configured store',()=>{
 assert.equal(musicNativeWorkflowEnabled('synthetic-store',env),true);
 for(const mutation of [{VERCEL_ENV:'preview'},{VERCEL_GIT_COMMIT_REF:'other'},{VERCEL:'0'},{VERCEL_GIT_REPO_OWNER:'other'},{DATABASE_URL:connection('ttworfzgwejdeolegkxl')},{DIRECT_URL:connection('ttworfzgwejdeolegkxl')},{MUSIC_NATIVE_WORKFLOW_STORE_IDS:''},{WORKERS_CI_BRANCH:'main'}])assert.equal(musicNativeWorkflowEnabled('synthetic-store',{...env,...mutation}),false);
 assert.equal(musicNativeWorkflowEnabled('another-store',env),false);
});
test('release preview cannot connect to production or mixed connections',()=>{
 const preview={...env,VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:MUSIC_RELEASE_BRANCH,DATABASE_URL:connection('ttworfzgwejdeolegkxl'),DIRECT_URL:connection('ttworfzgwejdeolegkxl')};
 assert.equal(assertMusicNativeReleaseEnvironment(preview),'preview');
 assert.equal(musicNativeWorkflowEnabled('synthetic-store',preview),true);
 assert.throws(()=>assertMusicNativeReleaseEnvironment({...preview,DIRECT_URL:env.DIRECT_URL}));
});
test('connection overrides and wrong schemas fail closed',()=>{
 for(const suffix of ['?host=production.invalid','?schema=private','?schema=public&schema=public','#invalid'])assert.equal(musicNativeWorkflowEnabled('synthetic-store',{...env,DATABASE_URL:env.DATABASE_URL+suffix}),false);
});
test('preview archive read authorization does not authorize historical import scope',async()=>{
 const {assertMusicPreviewDataReviewEnvironment}=await import('./music-native-workflow-scope.mjs');
 const {assertMusicOpeningPreviewEnvironment}=await import('./music-opening-preview-scope.mjs');
 const preview={...env,VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:MUSIC_RELEASE_BRANCH,DATABASE_URL:connection('ttworfzgwejdeolegkxl'),DIRECT_URL:connection('ttworfzgwejdeolegkxl')};
 assert.doesNotThrow(()=>assertMusicPreviewDataReviewEnvironment(preview));
 assert.throws(()=>assertMusicOpeningPreviewEnvironment(preview));
 assert.throws(()=>assertMusicPreviewDataReviewEnvironment(env));
});

test('balance acceptance capability is confined to exact preview, store and both isolated connections',async()=>{
 const preview={...env,VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'feat/roster-applicable-balance',DATABASE_URL:connection('ttworfzgwejdeolegkxl'),DIRECT_URL:connection('ttworfzgwejdeolegkxl')};
 assert.equal(musicNativeWorkflowEnabled('store-lubymusic',preview),true);
 assert.equal(musicNativeWorkflowEnabled('synthetic-store',preview),false);
 for(const mutation of [{VERCEL_ENV:'production'},{VERCEL_GIT_COMMIT_REF:'other'},{VERCEL:'0'},{VERCEL_GIT_REPO_OWNER:'other'},{VERCEL_GIT_REPO_SLUG:'other'},{DATABASE_URL:env.DATABASE_URL},{DIRECT_URL:env.DIRECT_URL},{WORKERS_CI_BRANCH:'main'},{CF_PAGES_BRANCH:'main'}])assert.equal(musicNativeWorkflowEnabled('store-lubymusic',{...preview,...mutation}),false);
 const {assertMusicOpeningPreviewEnvironment}=await import('./music-opening-preview-scope.mjs');
 assert.throws(()=>assertMusicOpeningPreviewEnvironment(preview));
 assert.throws(()=>assertMusicNativeReleaseEnvironment(preview));
});
