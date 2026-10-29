import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {beautyCollectionIntentsEnabled} from '@/server/beauty/collection-intent';
describe('beauty collection deployment and store boundary',()=>{
 beforeEach(()=>{vi.stubEnv('BEAUTY_COLLECTION_INTENTS_ENABLED','1');vi.stubEnv('BEAUTY_PURCHASE_QA_STORE_SCOPE','1');vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('VERCEL_GIT_COMMIT_REF','preview/beauty-ui-alignment-20261021');});
 afterEach(()=>vi.unstubAllEnvs());
 it('enables only the designated QA store on its reviewed branch',()=>{expect(beautyCollectionIntentsEnabled('beauty-hosted-20261021')).toBe(true);expect(beautyCollectionIntentsEnabled('other-store')).toBe(false);expect(beautyCollectionIntentsEnabled()).toBe(false);});
 it.each(['production','development'])('rejects QA enablement in %s',environment=>{vi.stubEnv('VERCEL_ENV',environment);expect(beautyCollectionIntentsEnabled('beauty-hosted-20261021')).toBe(false);});
 it('rejects a copied QA setting on a different branch',()=>{vi.stubEnv('VERCEL_GIT_COMMIT_REF','main');expect(beautyCollectionIntentsEnabled('beauty-hosted-20261021')).toBe(false);});
 it('keeps the reviewed preview disabled when its scope setting is absent',()=>{vi.stubEnv('BEAUTY_PURCHASE_QA_STORE_SCOPE','0');expect(beautyCollectionIntentsEnabled('beauty-hosted-20261021')).toBe(false);});
 it('keeps all collection writes unguarded by intents when the master flag is off',()=>{vi.stubEnv('BEAUTY_COLLECTION_INTENTS_ENABLED','0');expect(beautyCollectionIntentsEnabled('beauty-hosted-20261021')).toBe(false);});
});
