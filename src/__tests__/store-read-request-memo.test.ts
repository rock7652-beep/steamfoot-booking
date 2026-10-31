import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({plan:vi.fn(),module:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{store:{findUnique:m.plan},$queryRaw:m.module}}));
vi.mock('@/lib/sports-native-preview',()=>({sportsNativePreview:async()=>false}));
vi.mock('@/lib/store',()=>({getActiveStoreForRead:vi.fn()}));
vi.mock('@/lib/session',()=>({requireStaffSession:vi.fn()}));
import {getStoreForPlanByStoreId} from '@/lib/store-plan';
import {getStoreIndustryModule} from '@/lib/industry-module-server';
import {withReadRequestMemo} from '@/server/services/read-request-memo';
beforeEach(()=>{vi.clearAllMocks();m.plan.mockImplementation(async({where}:{where:{id:string}})=>({id:where.id,plan:'ALLIANCE'}));m.module.mockResolvedValue([{industryModule:'COURSE'}]);});
it('deduplicates simultaneous same-store reads only for one explicit HTTP read',async()=>{
 await withReadRequestMemo(()=>Promise.all([getStoreForPlanByStoreId('a'),getStoreForPlanByStoreId('a'),getStoreIndustryModule('a'),getStoreIndustryModule('a')]));
 expect(m.plan).toHaveBeenCalledTimes(1);expect(m.module).toHaveBeenCalledTimes(1);
 m.plan.mockResolvedValue({id:'a',plan:'EXPERIENCE'});m.module.mockResolvedValue([{industryModule:'BEAUTY'}]);
 await withReadRequestMemo(async()=>{expect((await getStoreForPlanByStoreId('a')).plan).toBe('EXPERIENCE');expect(await getStoreIndustryModule('a')).toBe('beauty')});
 expect(m.plan).toHaveBeenCalledTimes(2);expect(m.module).toHaveBeenCalledTimes(2);
});
it('keeps different stores and unscoped reads independent',async()=>{
 await withReadRequestMemo(()=>Promise.all(['a','b'].map(id=>getStoreForPlanByStoreId(id))));expect(m.plan).toHaveBeenCalledTimes(2);
 await getStoreForPlanByStoreId('a');await getStoreForPlanByStoreId('a');expect(m.plan).toHaveBeenCalledTimes(4);
});
it('never reuses the ordinary reader for a transaction client',async()=>{
 const tx={store:{findUnique:vi.fn(async()=>({id:'a',plan:'TRIAL'}))}} as unknown as Parameters<typeof getStoreForPlanByStoreId>[1];
 await withReadRequestMemo(async()=>{await getStoreForPlanByStoreId('a');await getStoreForPlanByStoreId('a',tx);await getStoreForPlanByStoreId('a',tx)});
 expect(m.plan).toHaveBeenCalledTimes(1);expect(tx!.store.findUnique).toHaveBeenCalledTimes(2);
});
it('does not carry a rejected module lookup into later requests',async()=>{
 m.module.mockRejectedValueOnce(new Error('unavailable'));
 await expect(withReadRequestMemo(()=>getStoreIndustryModule('a'))).rejects.toThrow('unavailable');
 expect(await withReadRequestMemo(()=>getStoreIndustryModule('a'))).toBe('course');
});
