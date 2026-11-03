import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({store:vi.fn(),feature:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{store:{findUnique:m.store},storeFeatureEntitlement:{findFirst:m.feature}}}));
import { requireSportsPublicTrialStore } from '@/server/services/sports-public-trial-store';
beforeEach(()=>{vi.resetAllMocks();m.store.mockResolvedValue({id:'store',slug:'silverlily',industryModule:'COURSE',archivedAt:null,operatingStatus:'ACTIVE'});m.feature.mockImplementation(async({where}:{where:{featureKey:string}})=>where.featureKey==='business.fitness'?{id:'fitness'}:null)});
it('accepts an active fitness course store',async()=>{expect((await requireSportsPublicTrialStore('silverlily')).id).toBe('store')});
it.each([null,{industryModule:'BEAUTY',operatingStatus:'ACTIVE'},{industryModule:'COURSE',operatingStatus:'SUSPENDED'},{industryModule:'COURSE',operatingStatus:'ACTIVE',archivedAt:new Date()}])('rejects missing, wrong-module, suspended and archived stores',async store=>{m.store.mockResolvedValue(store);await expect(requireSportsPublicTrialStore('silverlily')).rejects.toThrow()});
it('does not extend the public form to music or an unactivated course module',async()=>{m.feature.mockResolvedValue(null);await expect(requireSportsPublicTrialStore('silverlily')).rejects.toThrow();m.feature.mockResolvedValue({id:'enabled'});await expect(requireSportsPublicTrialStore('silverlily')).rejects.toThrow()});
