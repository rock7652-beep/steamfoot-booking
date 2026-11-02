import {beforeEach,expect,it,vi,afterEach} from 'vitest';
const m=vi.hoisted(()=>({raw:vi.fn(),catalog:vi.fn(),goodsAllowed:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{$queryRaw:m.raw,serviceAddOnCatalog:{findUnique:m.catalog}}}));
vi.mock('@/lib/feature-gate',()=>({hasStoreFeature:m.goodsAllowed}));
import {isBeautyServiceAddOnsEnabled,isAddOnSelectionEnabled,requireBeautyServiceAddOnManagement} from '@/server/services/add-on-access';
import {FEATURES,hasFeature} from '@/lib/feature-flags';
const grant={industry:'BEAUTY',status:'ENABLED',startsAt:null,expiresAt:null,localEnabled:true};
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));});afterEach(()=>vi.useRealTimers());
it.each([[true,true],[true,false],[false,true],[false,false]])('keeps service=%s and goods=%s independent',async(service,goods)=>{
 m.raw.mockResolvedValue([{...grant,localEnabled:service}]);m.goodsAllowed.mockResolvedValue(true);m.catalog.mockResolvedValue({enabled:goods});
 expect(await isBeautyServiceAddOnsEnabled('beauty')).toBe(service);expect(await isAddOnSelectionEnabled('beauty','BEAUTY')).toBe(goods);
 expect(m.raw.mock.calls[0][1]).toBe(FEATURES.BEAUTY_SERVICE_ADD_ONS);
});
it.each(['HIDDEN','LOCKED','DISABLED'])('rejects service HQ %s even while goods is enabled',async status=>{
 m.raw.mockResolvedValue([{...grant,status}]);m.goodsAllowed.mockResolvedValue(true);m.catalog.mockResolvedValue({enabled:true});expect(await isBeautyServiceAddOnsEnabled('beauty')).toBe(false);expect(await isAddOnSelectionEnabled('beauty','BEAUTY')).toBe(true);
});
it.each(['STEAMFOOT','COURSE'])('never activates a beauty service switch for %s',async industry=>{m.raw.mockResolvedValue([{...grant,industry}]);expect(await isBeautyServiceAddOnsEnabled('other')).toBe(false);await expect(requireBeautyServiceAddOnManagement('other',{$queryRaw:m.raw})).rejects.toThrow('尚未開通');});
it('denies absent and expired grants without hiding configuration for locally disabled stores',async()=>{
 m.raw.mockResolvedValue([]);expect(await isBeautyServiceAddOnsEnabled('beauty')).toBe(false);
 m.raw.mockResolvedValue([{...grant,expiresAt:new Date('2026-10-31')}]);expect(await isBeautyServiceAddOnsEnabled('beauty')).toBe(false);
 m.raw.mockResolvedValue([{...grant,localEnabled:false}]);await expect(requireBeautyServiceAddOnManagement('beauty',{$queryRaw:m.raw})).resolves.toBeUndefined();
});
it.each(['EXPERIENCE','BASIC','GROWTH','ALLIANCE'] as const)('does not implicitly include service add-ons in %s',plan=>expect(hasFeature(plan,FEATURES.BEAUTY_SERVICE_ADD_ONS)).toBe(false));

vi.mock('@/lib/addons-db',async()=>({addonsPrisma:(await vi.importMock<{prisma:unknown}>('@/lib/db')).prisma}));
