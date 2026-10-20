import { describe, expect, it } from 'vitest';
import { assertSportsRedesignPreviewEnvironment, SPORTS_REDESIGN_PREVIEW_BRANCH, SPORTS_CARD_MODES_PREVIEW_BRANCH, SPORTS_OPENING_GUIDE_PREVIEW_BRANCH } from '../../scripts/sports-redesign-preview-scope.mjs';
import { assertReviewedReleaseEnvironment } from '../../scripts/consultation-preview-scope.mjs';
const url='postgresql://postgres.ttworfzgwejdeolegkxl:test@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true';
const safe={SPORTS_REDESIGN_STAGING:'1',SPORTS_REDESIGN_PREVIEW:'1',VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:SPORTS_REDESIGN_PREVIEW_BRANCH,VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',DATABASE_URL:url,DIRECT_URL:url};
describe('sports redesign remote isolation',()=>{
 it('accepts exact Preview and routes clients through the checked release mode',()=>{
  expect(()=>assertSportsRedesignPreviewEnvironment(safe)).not.toThrow();
  expect(assertReviewedReleaseEnvironment(safe)).toBe('sports-redesign-preview');
 });
 it.each([
  ['VERCEL_ENV','production'],['VERCEL_GIT_COMMIT_REF','main'],['VERCEL_GIT_REPO_OWNER','other'],['VERCEL_GIT_REPO_SLUG','other'],['VERCEL',''],['SPORTS_REDESIGN_PREVIEW',''],['SPORTS_REDESIGN_STAGING',''],['SPORTS_LIVE_FLOW_QA','1'],['CF_PAGES_BRANCH','main'],['WORKERS_CI_BRANCH','main'],['DATABASE_URL','postgresql://postgres@db.qijlnhtpbintanzpxkvf.supabase.co/postgres'],['DIRECT_URL','postgresql://postgres@db.qijlnhtpbintanzpxkvf.supabase.co/postgres'],['DATABASE_URL',url+'&options=-csearch_path=public'],
 ])('rejects invalid %s', (key,value)=>expect(()=>assertReviewedReleaseEnvironment({...safe,[key]:value})).toThrow());
});

it('card-mode Preview uses the same isolated database guard and refuses missing opt-in',()=>{
 const env={...safe,VERCEL_GIT_COMMIT_REF:SPORTS_CARD_MODES_PREVIEW_BRANCH};
 expect(assertReviewedReleaseEnvironment(env)).toBe('sports-redesign-preview');
 for(const [key,value] of [['SPORTS_REDESIGN_PREVIEW',''],['SPORTS_REDESIGN_STAGING',''],['VERCEL_ENV','production'],['DATABASE_URL','postgresql://postgres@db.qijlnhtpbintanzpxkvf.supabase.co/postgres'],['DIRECT_URL','postgresql://postgres@db.qijlnhtpbintanzpxkvf.supabase.co/postgres']])expect(()=>assertReviewedReleaseEnvironment({...env,[key]:value})).toThrow();
});

// The opening guide branch gets the same isolation boundary, never a generic bypass.
it('opening-guide Preview requires explicit opt-in, isolated connections and Vercel provenance',()=>{
 const env={...safe,VERCEL_GIT_COMMIT_REF:SPORTS_OPENING_GUIDE_PREVIEW_BRANCH};
 expect(assertReviewedReleaseEnvironment(env)).toBe('sports-redesign-preview');
 for(const [key,value] of [
  ['SPORTS_REDESIGN_PREVIEW',''],['SPORTS_REDESIGN_STAGING',''],['VERCEL_ENV','production'],
  ['VERCEL_GIT_COMMIT_REF',SPORTS_OPENING_GUIDE_PREVIEW_BRANCH+'-other'],
  ['VERCEL_GIT_REPO_OWNER','other'],['VERCEL_GIT_REPO_SLUG','other'],
  ['WORKERS_CI_BRANCH',SPORTS_OPENING_GUIDE_PREVIEW_BRANCH],['CF_PAGES_BRANCH',SPORTS_OPENING_GUIDE_PREVIEW_BRANCH],
  ['DATABASE_URL','postgresql://postgres@db.qijlnhtpbintanzpxkvf.supabase.co/postgres'],
  ['DIRECT_URL','postgresql://postgres@db.qijlnhtpbintanzpxkvf.supabase.co/postgres'],
 ]) expect(()=>assertReviewedReleaseEnvironment({...env,[key]:value})).toThrow();
});
