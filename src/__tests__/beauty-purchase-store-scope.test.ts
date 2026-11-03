import {afterEach,describe,expect,it,vi} from 'vitest';
import {beautyPlanPurchaseIntentsEnabled} from '@/server/beauty/plan-checkout-input';
import {beautyMemberPurchaseIntentsEnabled} from '@/server/beauty/member-purchase-intent';
vi.mock('server-only',()=>({}));
afterEach(()=>vi.unstubAllEnvs());
describe('shared preview purchase scope',()=>{
 it('enables both paths only for the fixed test store on the intended preview branch',()=>{
  vi.stubEnv('BEAUTY_PLAN_PURCHASE_INTENTS_ENABLED','1');vi.stubEnv('BEAUTY_MEMBER_PURCHASE_INTENTS_ENABLED','1');
  vi.stubEnv('BEAUTY_PURCHASE_QA_STORE_SCOPE','1');vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('VERCEL_GIT_COMMIT_REF','preview/beauty-ui-alignment-20261021');
  for(const enabled of [beautyPlanPurchaseIntentsEnabled,beautyMemberPurchaseIntentsEnabled]){
   expect(enabled('beauty-hosted-20261021')).toBe(true);expect(enabled('another-store')).toBe(false);expect(enabled()).toBe(false);
   vi.stubEnv('VERCEL_ENV','production');expect(enabled('beauty-hosted-20261021')).toBe(false);vi.stubEnv('VERCEL_ENV','preview');
   vi.stubEnv('VERCEL_GIT_COMMIT_REF','main');expect(enabled('beauty-hosted-20261021')).toBe(false);vi.stubEnv('VERCEL_GIT_COMMIT_REF','preview/beauty-ui-alignment-20261021');
   vi.stubEnv('BEAUTY_PURCHASE_QA_STORE_SCOPE','');expect(enabled('beauty-hosted-20261021')).toBe(false);vi.stubEnv('BEAUTY_PURCHASE_QA_STORE_SCOPE','1');
  }
 });
});
