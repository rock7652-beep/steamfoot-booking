import {afterEach,expect,it,vi} from 'vitest';
import {coursePurchaseIntentsEnabled} from '@/lib/course-purchase-intent-flag';
afterEach(()=>vi.unstubAllEnvs());
it('limits the shared course preview purchase intent to the two existing test stores and fails closed on bad configuration',()=>{
 vi.stubEnv('COURSE_PURCHASE_INTENTS_ENABLED','1');vi.stubEnv('COURSE_PURCHASE_QA_STORE_SCOPE','1');vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('VERCEL_GIT_COMMIT_REF','release/music-production-20261023');
 expect(coursePurchaseIntentsEnabled('store-lubymusic')).toBe(true);expect(coursePurchaseIntentsEnabled('sports-live-flow-store')).toBe(true);expect(coursePurchaseIntentsEnabled('other')).toBe(false);expect(coursePurchaseIntentsEnabled()).toBe(false);
 vi.stubEnv('COURSE_PURCHASE_QA_STORE_SCOPE','');expect(coursePurchaseIntentsEnabled('store-lubymusic')).toBe(false);
 vi.stubEnv('COURSE_PURCHASE_QA_STORE_SCOPE','1');vi.stubEnv('VERCEL_ENV','production');expect(coursePurchaseIntentsEnabled('store-lubymusic')).toBe(false);
 vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('VERCEL_GIT_COMMIT_REF','main');expect(coursePurchaseIntentsEnabled('store-lubymusic')).toBe(false);
});
it.each(['store-lubymusic','sports-live-flow-store'])('does not let a QA store bypass a disabled flag or the beauty preview scope: %s',storeId=>{
 vi.stubEnv('COURSE_PURCHASE_INTENTS_ENABLED','0');vi.stubEnv('COURSE_PURCHASE_QA_STORE_SCOPE','1');vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('VERCEL_GIT_COMMIT_REF','release/music-production-20261023');
 expect(coursePurchaseIntentsEnabled(storeId)).toBe(false);
 vi.stubEnv('COURSE_PURCHASE_INTENTS_ENABLED','1');vi.stubEnv('VERCEL_GIT_COMMIT_REF','preview/beauty-ui-alignment-20261021');
 expect(coursePurchaseIntentsEnabled(storeId)).toBe(false);
});
