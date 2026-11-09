import { describe,it,expect } from 'vitest';
import { isMarketingPublicationLocalQa,isMarketingPublicationLocalQaPath,
  MARKETING_LOCAL_QA_DATABASE,MARKETING_LOCAL_QA_ORIGIN,MARKETING_LOCAL_QA_SECRET } from '../../scripts/marketing-publication-local-qa.mjs';
import { isGuideUiPreview } from '../../scripts/guide-ui-preview-scope.mjs';
import { assertReviewedReleaseEnvironment } from '../../scripts/consultation-preview-scope.mjs';

const safe={MARKETING_PUBLICATION_LOCAL_QA:'1',NODE_ENV:'production',AUTH_URL:MARKETING_LOCAL_QA_ORIGIN,
  NEXTAUTH_URL:MARKETING_LOCAL_QA_ORIGIN,AUTH_SECRET:MARKETING_LOCAL_QA_SECRET,
  DATABASE_URL:MARKETING_LOCAL_QA_DATABASE,DIRECT_URL:MARKETING_LOCAL_QA_DATABASE};
describe('local public-page production build boundary',()=>{
  it('only enables the exact no-database local profile',()=>{
    expect(isMarketingPublicationLocalQa(safe)).toBe(true);expect(isGuideUiPreview(safe)).toBe(true);
    expect(assertReviewedReleaseEnvironment(safe)).toBe('marketing-local-qa');
    expect(isMarketingPublicationLocalQa({VERCEL:'1',VERCEL_ENV:'production'})).toBe(false);
    expect(isGuideUiPreview({VERCEL:'1',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'main'})).toBe(false);
  });
  it.each(Object.keys(safe).filter(key=>key!=='MARKETING_PUBLICATION_LOCAL_QA'))('rejects missing %s',key=>{
    expect(()=>isMarketingPublicationLocalQa({...safe,[key]:undefined})).toThrow(/local-only/);
  });
  it.each(['VERCEL','VERCEL_ENV','VERCEL_GIT_COMMIT_REF','VERCEL_GIT_REPO_OWNER','WORKERS_CI_BRANCH','CF_PAGES_BRANCH',
    'RESEND_API_KEY','GITHUB_TOKEN','LINE_CHANNEL_ACCESS_TOKEN','SHEETS_WEBHOOK_URL','BEAUTY_PRODUCTION_QA'])('rejects hosted, credential or mixed mode %s',key=>{
    expect(()=>isMarketingPublicationLocalQa({...safe,[key]:'1'})).toThrow(/local-only/);
  });
  it('never accepts a real database, real auth secret or enabled referral writes',()=>{
    for(const patch of [{DATABASE_URL:'postgresql://postgres@db.qijlnhtpbintanzpxkvf.supabase.co/postgres'},
      {DIRECT_URL:'postgresql://postgres@db.ttworfzgwejdeolegkxl.supabase.co/postgres'},
      {AUTH_SECRET:'not-the-synthetic-value'},{SUBSCRIPTION_REFERRALS_ENABLED:'true'},{CONSULTATION_HQ_ENABLED:'true'}]){
      expect(()=>isMarketingPublicationLocalQa({...safe,...patch})).toThrow(/local-only/);
    }
  });
  it('only exposes known public pages and availability, never admin, auth or optimizer',()=>{
    for(const path of ['/','/pricing','/pricing/features/beauty','/apply','/privacy','/api/subscription-referrals/availability','/pricing/referral'])
      expect(isMarketingPublicationLocalQaPath(path)).toBe(true);
    for(const path of ['/hq/login','/hq/dashboard','/s/shop/admin','/api/auth/session','/api/line/webhook','/_next/image','/pricing/submit'])
      expect(isMarketingPublicationLocalQaPath(path)).toBe(false);
  });
});
