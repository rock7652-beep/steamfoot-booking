import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('node:fs',()=>({readFileSync:()=>JSON.stringify({version:1,overrides:[{walletId:'public-fixture',decision:'CONFIRM_AS_IS'}]})}));
import {getOverrideForWallet,_resetOverrideCacheForTesting} from '@/server/services/settlement-overrides';
beforeEach(()=>_resetOverrideCacheForTesting());
afterEach(()=>{vi.unstubAllEnvs();_resetOverrideCacheForTesting();});
it('loads private decisions alongside legacy decisions without requiring public identifiers',()=>{
 vi.stubEnv('SETTLEMENT_PRIVATE_OVERRIDES',JSON.stringify({version:1,overrides:[{walletId:'private-fixture',decision:'CONFIRM_AS_IS'}]}));
 expect(getOverrideForWallet('private-fixture')?.decision).toBe('CONFIRM_AS_IS');expect(getOverrideForWallet('public-fixture')?.decision).toBe('CONFIRM_AS_IS');expect(getOverrideForWallet('absent')).toBeNull();
});
it('fails closed on invalid configuration without disclosing its contents',()=>{
 vi.stubEnv('SETTLEMENT_PRIVATE_OVERRIDES','sensitive-fixture-invalid');
 expect(()=>getOverrideForWallet('private-fixture')).toThrow('Private override configuration is invalid');
 try{getOverrideForWallet('private-fixture');}catch(error){expect(String(error)).not.toContain('sensitive-fixture-invalid');}
});
it('rejects duplicate decisions rather than silently replacing an existing one',()=>{
 vi.stubEnv('SETTLEMENT_PRIVATE_OVERRIDES',JSON.stringify({version:1,overrides:[{walletId:'public-fixture',decision:'EXCLUDE_FROM_SETTLEMENT'}]}));
 expect(()=>getOverrideForWallet('public-fixture')).toThrow('duplicates an existing decision');
});
