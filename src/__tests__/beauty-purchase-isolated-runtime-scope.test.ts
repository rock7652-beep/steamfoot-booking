import {afterEach,expect,it,vi} from 'vitest';
import {assertBeautyIsolatedPurchaseStore,validateBeautyIsolatedPurchaseStore} from '@/lib/beauty/isolated-purchase-scope';
const store='qa-beauty-purchase-isolated-20261028';
const ref='abcdefghijklmnopqrst',url=`postgresql://postgres.${ref}:synthetic@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require`;
const env={NODE_ENV:'test' as const,VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'preview/beauty-purchase-isolated-20261028',VERCEL_GIT_REPO_OWNER:'rock7652-beep',VERCEL_GIT_REPO_SLUG:'steamfoot-booking',BEAUTY_ISOLATED_PURCHASE_QA:'1',BEAUTY_ISOLATED_QA_STORE_ID:store,BEAUTY_MODULE_ENABLED:'1',BEAUTY_DATABASE_MODE:'legacy',BEAUTY_NOTIFICATIONS_ENABLED:'0',BEAUTY_PLAN_PURCHASE_INTENTS_ENABLED:'1',BEAUTY_MEMBER_PURCHASE_INTENTS_ENABLED:'1',AUTH_SECRET:'synthetic',DATABASE_URL:url,DIRECT_URL:url};
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
it('limits the dedicated acceptance runtime to the exact configured test store',()=>{
  expect(()=>validateBeautyIsolatedPurchaseStore('other',env,ref)).toThrow('僅開放指定測試門市');
  expect(()=>validateBeautyIsolatedPurchaseStore(store,env,ref)).not.toThrow();
  expect(()=>assertBeautyIsolatedPurchaseStore(store,env)).toThrow('僅開放指定測試門市');
});
it('fails closed when the acceptance marker is enabled with a changed store setting',()=>{
  expect(()=>validateBeautyIsolatedPurchaseStore(store,{...env,BEAUTY_ISOLATED_QA_STORE_ID:'other'},ref)).toThrow('僅開放指定測試門市');
  expect(()=>validateBeautyIsolatedPurchaseStore(store,{...env,DATABASE_URL:url.replace(ref,'qijlnhtpbintanzpxkvf')},ref)).toThrow('僅開放指定測試門市');
  expect(()=>validateBeautyIsolatedPurchaseStore(store,{...env,BEAUTY_NOTIFICATIONS_ENABLED:'1'},ref)).toThrow('僅開放指定測試門市');
  expect(()=>validateBeautyIsolatedPurchaseStore(store,{...env,LINE_CHANNEL_ACCESS_TOKEN:'secret'},ref)).toThrow('僅開放指定測試門市');
});
it('does not restrict ordinary non-acceptance stores',()=>{
  vi.stubEnv('BEAUTY_ISOLATED_PURCHASE_QA','0');vi.stubEnv('BEAUTY_MODULE_ENABLED','1');
  expect(()=>assertBeautyIsolatedPurchaseStore('regular')).not.toThrow();
});
