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
 it.each(['fix/calendar-restored-month-consistency','fix/beauty-collection-calendar-remount'])('confines regression Preview %s to its existing isolated QA store',(branch)=>{
  const url='postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co/postgres';
  for(const [key,value] of Object.entries({VERCEL:'1',VERCEL_GIT_COMMIT_REF:branch,VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',DATABASE_URL:url,DIRECT_URL:url}))vi.stubEnv(key,value);
  expect(beautyCollectionIntentsEnabled('beauty-hosted-20261021')).toBe(true);expect(beautyCollectionIntentsEnabled('other-store')).toBe(false);
  vi.stubEnv('DIRECT_URL','postgresql://postgres:synthetic@db.qijlnhtpbintanzpxkvf.supabase.co/postgres');expect(beautyCollectionIntentsEnabled('beauty-hosted-20261021')).toBe(false);
  vi.stubEnv('DIRECT_URL',url);vi.stubEnv('VERCEL_ENV','production');expect(beautyCollectionIntentsEnabled('beauty-hosted-20261021')).toBe(false);
 });
});
