import {afterEach,expect,it,vi} from 'vitest';
import {coursePurchaseIntentsEnabled} from '@/lib/course-purchase-intent-flag';
afterEach(()=>vi.unstubAllEnvs());
it('limits the music preview purchase intent to its fixed store and fails closed on bad configuration',()=>{
 vi.stubEnv('COURSE_PURCHASE_INTENTS_ENABLED','1');vi.stubEnv('COURSE_PURCHASE_QA_STORE_SCOPE','1');vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('VERCEL_GIT_COMMIT_REF','release/music-production-20261023');
 expect(coursePurchaseIntentsEnabled('store-lubymusic')).toBe(true);expect(coursePurchaseIntentsEnabled('other')).toBe(false);expect(coursePurchaseIntentsEnabled()).toBe(false);
 vi.stubEnv('COURSE_PURCHASE_QA_STORE_SCOPE','');expect(coursePurchaseIntentsEnabled('store-lubymusic')).toBe(false);
 vi.stubEnv('COURSE_PURCHASE_QA_STORE_SCOPE','1');vi.stubEnv('VERCEL_ENV','production');expect(coursePurchaseIntentsEnabled('store-lubymusic')).toBe(false);
 vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('VERCEL_GIT_COMMIT_REF','main');expect(coursePurchaseIntentsEnabled('store-lubymusic')).toBe(false);
});
