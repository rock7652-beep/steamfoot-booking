import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {FEATURES,hasFeature} from '@/lib/feature-flags';
import {coreFeatureForPermission} from '@/lib/core-feature-permissions';
const m=vi.hoisted(()=>({grant:vi.fn(),catalog:vi.fn(),raw:vi.fn(),store:vi.fn()}));
vi.mock('next/cache',()=>({unstable_cache:<T>(fn:T)=>fn}));
vi.mock('@/lib/db',()=>({prisma:{store:{findUnique:m.store},$queryRaw:m.raw,storeFeatureEntitlement:{findUnique:m.grant},serviceAddOnCatalog:{findUnique:m.catalog}}}));
vi.mock('@/lib/store-plan',()=>({getCurrentStoreForPlan:vi.fn(),getStoreForPlanByStoreId:vi.fn()}));
import {hasStoreFeature,getStoreFeaturePresentation} from '@/lib/feature-gate';
import {requireAddOnSelection,isAddOnSelectionEnabled,requireBeautyAddOnSelection} from '@/server/services/add-on-access';
import type {Prisma} from '@prisma/client';
const now=new Date('2026-10-31T12:00:00Z');
const tx={storeFeatureEntitlement:{findUnique:m.grant},serviceAddOnCatalog:{findUnique:m.catalog}} as unknown as Prisma.TransactionClient;
beforeEach(()=>{vi.resetAllMocks();vi.useFakeTimers();vi.setSystemTime(now);m.catalog.mockResolvedValue({enabled:true});m.raw.mockResolvedValue([]);m.store.mockResolvedValue({industryModule:"BEAUTY"});});
afterEach(()=>vi.useRealTimers());
it.each(['EXPERIENCE','BASIC','GROWTH','ALLIANCE'] as const)('%s never opens add-ons without HQ',plan=>{
 expect(hasFeature(plan,FEATURES.ADD_ONS)).toBe(false);
 expect(coreFeatureForPermission('add_ons.manage')).toBeUndefined();
});
it.each([
 [null,false,'HIDDEN'],
 [{status:'ENABLED',startsAt:null,expiresAt:null},true,'ENABLED'],
 [{status:'DISABLED',startsAt:null,expiresAt:null},false,'LOCKED'],
 [{status:'LOCKED',startsAt:null,expiresAt:null},false,'LOCKED'],
 [{status:'HIDDEN',startsAt:null,expiresAt:null},false,'HIDDEN'],
 [{status:'ENABLED',startsAt:new Date('2026-11-01'),expiresAt:null},false,'LOCKED'],
 [{status:'ENABLED',startsAt:null,expiresAt:new Date('2026-10-30')},false,'LOCKED'],
] as const)('applies uncached HQ grant %j',async(grant,enabled,presentation)=>{
 m.grant.mockResolvedValue(grant);
 expect(await hasStoreFeature('store-a',FEATURES.ADD_ONS)).toBe(enabled);
 expect(await getStoreFeaturePresentation('store-a',FEATURES.ADD_ONS)).toBe(presentation);
 if(enabled)await expect(requireAddOnSelection(tx,'store-a','STEAMFOOT')).resolves.toBeUndefined();
 else {await expect(requireAddOnSelection(tx,'store-a','STEAMFOOT')).rejects.toThrow();expect(m.catalog).not.toHaveBeenCalled();}
 expect(m.grant).toHaveBeenCalledWith(expect.objectContaining({where:{uq_store_feature_entitlement:{storeId:'store-a',featureKey:'add_ons'}}}));
});
it('rechecks HQ revocation even after a successful earlier check',async()=>{
 m.grant.mockResolvedValueOnce({status:'ENABLED',startsAt:null,expiresAt:null}).mockResolvedValue({status:'HIDDEN',startsAt:null,expiresAt:null});
 expect(await hasStoreFeature('store-a',FEATURES.ADD_ONS)).toBe(true);
 await expect(requireAddOnSelection(tx,'store-a','STEAMFOOT')).rejects.toThrow('尚未開通');
});
it.each(['STEAMFOOT','FITNESS','MUSIC','BEAUTY'])('requires local activation and isolates %s catalogs',async module=>{
 m.grant.mockResolvedValue({status:'ENABLED',startsAt:null,expiresAt:null});
 m.catalog.mockResolvedValue({enabled:false});
 await expect(requireAddOnSelection(tx,'store-b',module)).rejects.toThrow('門市尚未啟用');
 expect(m.catalog).toHaveBeenCalledWith({where:{storeId_module:{storeId:'store-b',module}}});
 m.catalog.mockResolvedValue(null);await expect(requireAddOnSelection(tx,'store-b',module)).rejects.toThrow('門市尚未啟用');
});

it('uses both HQ and local activation for the independent beauty domain',async()=>{
 m.grant.mockResolvedValue({status:'ENABLED',startsAt:null,expiresAt:null});
 expect(await isAddOnSelectionEnabled('beauty-store','BEAUTY')).toBe(true);
 m.catalog.mockResolvedValue({enabled:false});
 await expect(requireBeautyAddOnSelection('beauty-store')).rejects.toThrow('附加選購已關閉');
 m.catalog.mockClear();m.grant.mockResolvedValue({status:'HIDDEN',startsAt:null,expiresAt:null});
 expect(await isAddOnSelectionEnabled('beauty-store','BEAUTY')).toBe(false);
 expect(m.catalog).not.toHaveBeenCalled();
});

it('requires explicit beauty HQ access and hides it on other modules',async()=>{
 m.grant.mockResolvedValue({status:'ENABLED',startsAt:null,expiresAt:null});expect(await hasStoreFeature('beauty',FEATURES.BEAUTY_SERVICE_ADD_ONS)).toBe(true);
 m.store.mockResolvedValue({industryModule:'COURSE'});expect(await hasStoreFeature('course',FEATURES.BEAUTY_SERVICE_ADD_ONS)).toBe(false);expect(await getStoreFeaturePresentation('course',FEATURES.BEAUTY_SERVICE_ADD_ONS)).toBe('HIDDEN');
});

vi.mock('@/lib/addons-db',async()=>({addonsPrisma:(await vi.importMock<{prisma:unknown}>('@/lib/db')).prisma}));
