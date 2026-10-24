import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({manager:vi.fn(),permission:vi.fn(),feature:vi.fn(),limits:vi.fn(),owns:vi.fn(),find:vi.fn(),tx:vi.fn(),command:vi.fn(),link:vi.fn(),raw:vi.fn(),write:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{customer:{findMany:m.find}}}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{}}));
vi.mock('@/lib/permissions',()=>({requirePermission:m.permission,checkPermission:vi.fn()}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:m.feature,hasStoreFeature:vi.fn(),getStoreLimitsByStoreId:m.limits}));
vi.mock('@/server/beauty/access',()=>({beautyManager:m.manager,beautyTransaction:m.tx,command:m.command,audit:vi.fn(),requireBeauty:vi.fn()}));
vi.mock('@/server/beauty/booking',()=>({ownsItem:m.owns,assertCustomerAvailable:vi.fn(),reserveParty:vi.fn(),findAllocation:vi.fn(),loadAvailability:vi.fn(),settings:vi.fn(),transition:vi.fn()}));
vi.mock('@/server/beauty/companions',()=>({linkCompanion:m.link}));
import {findBeautyCompanionByPhone,createBeautyCompanion,attachBeautyCompanion} from '@/server/actions/beauty';
const input={bookingId:'booking',revision:2,name:'親友',phone:'0912-345-678'};
beforeEach(()=>{vi.clearAllMocks();m.manager.mockResolvedValue({storeId:'verified-store',userId:'manager',manager:true});m.permission.mockResolvedValue({});m.feature.mockResolvedValue(undefined);m.limits.mockResolvedValue({maxCustomers:null});m.owns.mockResolvedValue({id:'booking',revision:2,customerId:null});m.find.mockResolvedValue([{id:'customer',name:'親友',phone:'0912345678'}]);m.tx.mockImplementation((_a,work)=>work({$queryRaw:m.raw,$executeRaw:m.write}));m.command.mockImplementation((_tx,_a,_key,_d,work)=>work());m.raw.mockResolvedValue([]);m.link.mockResolvedValue({id:'booking',customerId:'customer',name:'親友'});});
it('scopes exact phone search to the verified store and masks the result',async()=>{
 expect(await findBeautyCompanionByPhone({...input,storeId:'foreign'})).toEqual({success:true,data:[{id:'customer',name:'親友',phoneMasked:'0912***678'}]});expect(m.find.mock.calls[0][0].where).toEqual({storeId:'verified-store',phone:'0912345678',mergedIntoCustomerId:null});
});
it('denies low-privilege create and lookup before reading or writing identities',async()=>{
 m.permission.mockRejectedValueOnce(Error('denied'));expect((await findBeautyCompanionByPhone(input)).success).toBe(false);expect(m.find).not.toHaveBeenCalled();m.permission.mockRejectedValueOnce(Error('denied'));expect((await createBeautyCompanion(input)).success).toBe(false);expect(m.tx).not.toHaveBeenCalled();
});
it('rejects a foreign booking before disclosing customer data or creating an orphan identity',async()=>{
 m.owns.mockRejectedValue(Error('找不到本店預約'));expect((await findBeautyCompanionByPhone(input)).success).toBe(false);expect(m.find).not.toHaveBeenCalled();expect((await createBeautyCompanion(input)).success).toBe(false);expect(m.write).not.toHaveBeenCalled();
});
it('uses a stable command identity on retries, and changes it for another person or revision',async()=>{
 await attachBeautyCompanion({...input,customerId:'friend'});await attachBeautyCompanion({...input,customerId:'friend'});await attachBeautyCompanion({...input,customerId:'other'});expect(m.command.mock.calls[0][2]).toBe(m.command.mock.calls[1][2]);expect(m.command.mock.calls[0][2]).not.toBe(m.command.mock.calls[2][2]);expect(m.link.mock.calls[0][2]).toEqual({id:'booking',revision:2,customerId:'friend'});
});
it('checks stale revisions and existing phones before customer creation',async()=>{
 m.owns.mockResolvedValueOnce({id:'booking',revision:3,customerId:null});expect((await createBeautyCompanion(input)).success).toBe(false);expect(m.write).not.toHaveBeenCalled();m.raw.mockResolvedValueOnce([{id:'existing'}]);expect(await createBeautyCompanion(input)).toMatchObject({success:false,error:expect.stringContaining('此手機已在本店建檔')});expect(m.write).not.toHaveBeenCalled();
});
