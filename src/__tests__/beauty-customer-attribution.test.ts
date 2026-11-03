import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({manager:vi.fn(),feature:vi.fn(),lock:vi.fn(),staff:vi.fn(),customer:vi.fn(),list:vi.fn(),update:vi.fn(),bulk:vi.fn(),audit:vi.fn(),search:vi.fn(),transaction:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/server/beauty/access',()=>({beautyManager:m.manager}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:m.feature}));
vi.mock('@/lib/db',()=>({prisma:{$transaction:m.transaction,customer:{findMany:m.search}}}));
import {bulkAssignBeautyCustomers,saveBeautyCustomerAttribution,searchBeautyReferrerCandidates} from '@/server/actions/beauty-customer-attribution';
const input={customerId:'customer',assignedStaffId:'manager',referredByCustomerId:'sponsor'};
beforeEach(()=>{
 vi.clearAllMocks();m.manager.mockResolvedValue({storeId:'a',userId:'actor'});m.feature.mockResolvedValue(undefined);m.lock.mockResolvedValue([{id:'a'}]);m.staff.mockResolvedValue({id:'manager'});m.customer.mockResolvedValue({id:'customer'});m.list.mockResolvedValue([{id:'customer',assignedStaffId:null}]);m.bulk.mockResolvedValue({count:1});m.audit.mockResolvedValue({});m.search.mockResolvedValue([]);
 m.transaction.mockImplementation(async(work:(tx:unknown)=>unknown)=>work({$queryRaw:m.lock,staff:{findFirst:m.staff},customer:{findFirst:m.customer,findMany:m.list,update:m.update,updateMany:m.bulk},auditLog:{create:m.audit}}));
});
it('shares the original atomic bulk flow with store-bound active staff and customer validation',async()=>{
 expect(await bulkAssignBeautyCustomers({customerIds:['customer','customer'],assignedStaffId:'manager'})).toEqual({success:true,data:{count:1}});
 expect(m.manager).toHaveBeenCalledWith('customer.assign',true);
 expect(m.staff).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({storeId:'a',status:'ACTIVE',user:{status:'ACTIVE'},NOT:{user:{role:'CUSTOMER'}}})}));
 expect(m.list.mock.calls[0][0].where).toMatchObject({storeId:'a',id:{in:['customer']},mergedIntoCustomerId:null});
 expect(m.bulk).toHaveBeenCalledWith({where:{id:{in:['customer']},storeId:'a'},data:{assignedStaffId:'manager'}});
 expect(m.audit.mock.calls[0][0].data).toMatchObject({actorUserId:'actor',action:'BEAUTY_BULK_ASSIGN'});
});
it('refuses the whole batch for foreign, merged or inactive customer selections before any update',async()=>{
 m.list.mockResolvedValue([]);expect(await bulkAssignBeautyCustomers({customerIds:['foreign'],assignedStaffId:'manager'})).toMatchObject({success:false});expect(m.bulk).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();
});
it('denies a foreign or inactive manager in both single and batch paths',async()=>{
 m.staff.mockResolvedValue(null);expect(await bulkAssignBeautyCustomers({customerIds:['customer'],assignedStaffId:'foreign'})).toMatchObject({success:false});expect(await saveBeautyCustomerAttribution({...input,assignedStaffId:'foreign'})).toMatchObject({success:false});expect(m.update).not.toHaveBeenCalled();expect(m.bulk).not.toHaveBeenCalled();
});
it('validates customer and referrer inside the authorized store without changing plans or sponsor during batch updates',async()=>{
 expect(await saveBeautyCustomerAttribution(input)).toEqual({success:true,data:undefined});
 expect(m.customer).toHaveBeenNthCalledWith(1,{where:{id:'customer',storeId:'a',mergedIntoCustomerId:null},select:{id:true}});
 expect(m.customer).toHaveBeenNthCalledWith(2,{where:{id:'sponsor',storeId:'a',mergedIntoCustomerId:null},select:{id:true}});
 expect(m.update).toHaveBeenCalledWith({where:{id:'customer',storeId:'a'},data:{assignedStaffId:'manager',sponsorId:'sponsor'}});
});
it('rejects foreign customers, foreign referrers and self referrals without updating data',async()=>{
 m.customer.mockResolvedValueOnce(null);expect(await saveBeautyCustomerAttribution(input)).toMatchObject({success:false});expect(m.update).not.toHaveBeenCalled();
 m.customer.mockResolvedValueOnce({id:'customer'}).mockResolvedValueOnce(null);expect(await saveBeautyCustomerAttribution(input)).toMatchObject({success:false});expect(m.update).not.toHaveBeenCalled();
 expect(await saveBeautyCustomerAttribution({...input,referredByCustomerId:'customer'})).toMatchObject({success:false});expect(m.update).not.toHaveBeenCalled();
});
it('blocks disabled or changed stores after acquiring the original store lock',async()=>{
 m.lock.mockResolvedValue([]);expect(await bulkAssignBeautyCustomers({customerIds:['customer'],assignedStaffId:'manager'})).toMatchObject({success:false});expect(await saveBeautyCustomerAttribution(input)).toMatchObject({success:false});expect(m.staff).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();expect(m.bulk).not.toHaveBeenCalled();
});
it('denies permission, readonly context and feature before transactions',async()=>{
 m.manager.mockRejectedValueOnce(Error('read only'));expect(await saveBeautyCustomerAttribution(input)).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();
 m.feature.mockRejectedValueOnce(Error('disabled'));expect(await bulkAssignBeautyCustomers({customerIds:['customer'],assignedStaffId:'manager'})).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();
});
it('does not let a supplied store selector change the actor store',async()=>{
 expect(await saveBeautyCustomerAttribution({...input,storeId:'b'} as typeof input)).toMatchObject({success:true});expect(m.customer.mock.calls[0][0].where.storeId).toBe('a');
});
it('uses the original bounded, masked referrer search in the Beauty store',async()=>{
 m.search.mockResolvedValue([{id:'ref',name:'合成推薦人',phone:'0900000001'}]);
 expect(await searchBeautyReferrerCandidates('0900','customer')).toMatchObject({success:true,data:[{id:'ref',phoneMasked:'0900•••001'}]});
 expect(m.manager).toHaveBeenCalledWith('customer.read');expect(m.search.mock.calls[0][0]).toMatchObject({where:{storeId:'a',id:{not:'customer'},mergedIntoCustomerId:null},take:10});
});
