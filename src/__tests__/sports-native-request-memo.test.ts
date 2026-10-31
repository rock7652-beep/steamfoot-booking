import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({production:vi.fn(),staging:vi.fn()}));
vi.mock('@/lib/sports-production-store',()=>({sportsProductionStore:m.production}));
vi.mock('@/lib/sports-staging',()=>({sportsStagingEnabled:m.staging}));
import {sportsNativePreview} from '@/lib/sports-native-preview';
import {withReadRequestMemo} from '@/server/services/read-request-memo';
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('VERCEL_ENV','production');m.production.mockResolvedValue(true);m.staging.mockResolvedValue(true);});
afterEach(()=>vi.unstubAllEnvs());
it('shares eligibility only inside one read and rechecks revocation on the next',async()=>{
 expect(await withReadRequestMemo(()=>Promise.all([sportsNativePreview('a'),sportsNativePreview('a')]))).toEqual([true,true]);expect(m.production).toHaveBeenCalledOnce();
 m.production.mockResolvedValue(false);expect(await withReadRequestMemo(()=>sportsNativePreview('a'))).toBe(false);expect(m.production).toHaveBeenCalledTimes(2);
});
it('keeps different stores and ordinary writes independent',async()=>{
 await withReadRequestMemo(()=>Promise.all([sportsNativePreview('a'),sportsNativePreview('b')]));expect(m.production).toHaveBeenCalledTimes(2);await sportsNativePreview('a');await sportsNativePreview('a');expect(m.production).toHaveBeenCalledTimes(4);
});
it('retains activation denial and exact isolated-preview selection',async()=>{
 m.production.mockRejectedValueOnce(new Error('activation denied'));await expect(withReadRequestMemo(()=>sportsNativePreview('a'))).rejects.toThrow('activation denied');
 vi.stubEnv('VERCEL_ENV','preview');expect(await withReadRequestMemo(()=>sportsNativePreview('other'))).toBe(false);expect(m.staging).not.toHaveBeenCalled();expect(await withReadRequestMemo(()=>sportsNativePreview('sports-live-flow-store'))).toBe(true);expect(m.staging).toHaveBeenCalledWith('sports-live-flow-store');
});
