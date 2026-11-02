import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({feature:vi.fn(),raw:vi.fn(),catalog:vi.fn(),store:vi.fn(),customerCatalog:vi.fn()}));
vi.mock('@/lib/feature-gate',()=>({hasStoreFeature:m.feature}));
vi.mock('@/lib/db',()=>({prisma:{$queryRaw:m.raw,store:{findUnique:m.store}}}));
vi.mock('@/lib/addons-db',()=>({addonsPrisma:{serviceAddOnCatalog:{findUnique:m.catalog}}}));
vi.mock('@/server/services/customer-booking-goods',()=>({customerGoodsCatalog:m.customerCatalog}));
import {readBeautyGoodsCatalog} from '@/server/beauty/shared-goods-catalog';
import {isBeautyServiceAddOnsEnabled} from '@/server/services/add-on-access';
import {readCustomerBookingGoods} from '@/server/actions/customer-booking-goods';
const grant={industry:'BEAUTY',status:'ENABLED',startsAt:null,expiresAt:null};
beforeEach(()=>{vi.resetAllMocks();m.feature.mockResolvedValue(false);m.store.mockResolvedValue({id:'store'});});
it('closed Beauty catalog does not touch a missing dedicated connection',async()=>{
 m.catalog.mockRejectedValue(Error('missing dedicated connection'));
 expect(await readBeautyGoodsCatalog('store')).toEqual({revision:0,enabled:false,groups:[]});
 expect(m.catalog).not.toHaveBeenCalled();
});
it('closed public booking catalog returns no optional goods without the dedicated reader',async()=>{
 m.customerCatalog.mockRejectedValue(Error('missing dedicated connection'));
 expect(await readCustomerBookingGoods({slug:'store'})).toEqual({success:true,data:null});
 expect(m.customerCatalog).not.toHaveBeenCalled();expect(m.feature).toHaveBeenCalledWith('store','add_ons');
});
it('enabled public catalog keeps the dedicated live authorization reader',async()=>{
 m.feature.mockResolvedValue(true);m.customerCatalog.mockResolvedValue({revision:2,groups:[]});
 expect(await readCustomerBookingGoods({slug:'store',sessionId:'session'})).toEqual({success:true,data:{revision:2,groups:[]}});
 expect(m.customerCatalog).toHaveBeenCalledWith(expect.anything(),'store','session');
});
it.each(['DISABLED','LOCKED','HIDDEN',null])('closed Beauty grant %s avoids the uninstalled local column',async status=>{
 const tx={$queryRaw:vi.fn().mockResolvedValueOnce([{...grant,status}]).mockRejectedValueOnce(Error('missing column'))};
 expect(await isBeautyServiceAddOnsEnabled('store',tx)).toBe(false);
 expect(tx.$queryRaw).toHaveBeenCalledOnce();
 const query=tx.$queryRaw.mock.calls[0][0] as TemplateStringsArray;
 expect(query.join('')).not.toContain('serviceAddOnsEnabled');expect(m.raw).not.toHaveBeenCalled();
});
it('enabled grant uses the same transaction and rechecks revocation with the local switch',async()=>{
 const tx={$queryRaw:vi.fn().mockResolvedValueOnce([grant]).mockResolvedValueOnce([{...grant,status:'DISABLED',localEnabled:true}])};
 expect(await isBeautyServiceAddOnsEnabled('store',tx)).toBe(false);expect(tx.$queryRaw).toHaveBeenCalledTimes(2);expect(m.raw).not.toHaveBeenCalled();
});
it('enabled Beauty catalog does not disguise a database failure as a closed feature',async()=>{
 const unavailable=Error('database unavailable');m.feature.mockResolvedValue(true);m.catalog.mockRejectedValue(unavailable);
 await expect(readBeautyGoodsCatalog('store')).rejects.toBe(unavailable);
});
it('enabled Beauty service does not swallow a missing required schema',async()=>{
 const unavailable=Error('missing column');const tx={$queryRaw:vi.fn().mockResolvedValueOnce([grant]).mockRejectedValueOnce(unavailable)};
 await expect(isBeautyServiceAddOnsEnabled('store',tx)).rejects.toBe(unavailable);
});
