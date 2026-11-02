import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({feature:vi.fn(),catalog:vi.fn(),groups:vi.fn()}));
vi.mock('@/lib/addons-db',()=>({addonsPrisma:{serviceAddOnCatalog:{findUnique:m.catalog}}}));
vi.mock('@/lib/feature-gate',()=>({hasStoreFeature:m.feature}));
vi.mock('@/lib/add-ons',()=>({moduleAddOnGroups:m.groups}));
vi.mock('@/server/beauty/access',()=>({audit:vi.fn()}));
import {AddOnsDatabaseConfigurationError,addOnsDatabaseSelection} from '@/lib/addons-database-url';
import {readBeautyGoodsCatalog} from '@/server/beauty/shared-goods-catalog';
import {prepareBeautyBookingGoods,publicBeautyGoodsCatalog} from '@/server/beauty/booking-shared-goods';
beforeEach(()=>{vi.resetAllMocks();m.feature.mockResolvedValue(true);m.groups.mockReturnValue([{kind:'SHARED_GOODS',id:'goods'}]);});
it('keeps the optional selection catalog closed when its dedicated connection is missing',async()=>{
 expect(()=>addOnsDatabaseSelection({})).toThrow(AddOnsDatabaseConfigurationError);
 m.catalog.mockRejectedValue(new AddOnsDatabaseConfigurationError());
 await expect(readBeautyGoodsCatalog('store')).resolves.toEqual({revision:0,enabled:false,groups:[]});
});
it('does not connect or expose selections for a store without entitlement',async()=>{
 m.feature.mockResolvedValue(false);
 expect(await readBeautyGoodsCatalog('store')).toEqual({revision:0,enabled:false,groups:[]});
 expect(m.catalog).not.toHaveBeenCalled();
});
it('allows a basic booking without goods but rejects selected goods when unconfigured',async()=>{
 m.catalog.mockRejectedValue(new AddOnsDatabaseConfigurationError());
 expect(await prepareBeautyBookingGoods('store')).toBeNull();
 expect(m.catalog).not.toHaveBeenCalled();
 await expect(prepareBeautyBookingGoods('store',{revision:0,selections:[{id:'goods',quantity:1}]})).rejects.toThrow('共同商品已停止選購');
});
it('allows public trial data to load without optional goods metadata',async()=>{
 m.catalog.mockRejectedValue(new AddOnsDatabaseConfigurationError());
 await expect(publicBeautyGoodsCatalog('store')).resolves.toBeNull();
});
it('preserves unexpected database errors instead of treating them as an empty catalog',async()=>{
 m.catalog.mockRejectedValue(new Error('database disconnected'));
 await expect(readBeautyGoodsCatalog('store')).rejects.toThrow('database disconnected');
});
it('retains configured catalogs and checks the live grant again',async()=>{
 m.catalog.mockResolvedValue({enabled:true,revision:7,groups:[]});
 expect(await readBeautyGoodsCatalog('store')).toEqual({enabled:true,revision:7,groups:[{kind:'SHARED_GOODS',id:'goods'}]});
 expect(m.feature).toHaveBeenCalledTimes(2);
 m.feature.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
 expect(await readBeautyGoodsCatalog('store')).toEqual({enabled:false,revision:7,groups:[]});
});
