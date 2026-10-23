import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({manager:vi.fn(),permission:vi.fn(),feature:vi.fn(),transaction:vi.fn(),raw:vi.fn(),reserve:vi.fn(),rental:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/server/beauty/access',()=>({beautyManager:m.manager,beautyTransaction:m.transaction}));
vi.mock('@/lib/permissions',()=>({requirePermission:m.permission}));
vi.mock('@/lib/feature-gate',()=>({requireStoreFeature:m.feature}));
vi.mock('@/server/beauty/native-schedule',()=>({reserveNativeBeautySchedule:m.reserve}));
vi.mock('@/server/actions/course-rental',()=>({saveCourseRental:m.rental}));
import {scheduleNativeBeautyService} from '@/server/actions/beauty-native-schedule';
const actor={storeId:'a',userId:'owner',manager:true};
const payload={requestKey:'00000000-0000-4000-8000-000000000001',subject:'service',kind:'單次',mode:'指定學員',date:'2026-12-10',time:'10:00',duration:60,count:1,coach:'',coachId:'tech',room:'位置 A',capacity:1,students:['customer'],waitlistLimit:0,waitlistStopMinutes:240,price:0,customer:'',phone:'',customerId:null as string|null};
const input={operation:'schedule',expectedServiceRevision:7,payload};
beforeEach(()=>{vi.clearAllMocks();m.manager.mockResolvedValue(actor);m.permission.mockResolvedValue({});m.feature.mockResolvedValue(undefined);m.raw.mockResolvedValue([{id:'room-a'}]);m.transaction.mockImplementation(async(_a:unknown,work:(tx:unknown)=>unknown)=>work({$queryRaw:m.raw}));m.reserve.mockResolvedValue({groupId:'group',ids:['item']});m.rental.mockResolvedValue({success:true,id:'rental'});});
it('authorizes a write and customer reads before opening a Beauty transaction',async()=>{
 expect(await scheduleNativeBeautyService(input)).toEqual({success:true});
 expect(m.manager).toHaveBeenCalledWith('booking.create',true);expect(m.permission).toHaveBeenCalledWith('customer.read');expect(m.transaction).toHaveBeenCalledWith(actor,expect.any(Function));expect(m.reserve).toHaveBeenCalledWith(expect.anything(),actor,input);expect(m.rental).not.toHaveBeenCalled();
});
it('cannot replace the actor store with client input',async()=>{
 expect(await scheduleNativeBeautyService({...input,storeId:'foreign'})).toEqual({success:true});expect(m.reserve.mock.calls[0][1].storeId).toBe('a');expect(m.reserve.mock.calls[0][2]).not.toHaveProperty('storeId');
});
it.each(['permission','feature','manager'] as const)('denies %s failures before querying or writing',async key=>{
 m[key].mockRejectedValueOnce(Error('denied'));expect(await scheduleNativeBeautyService(input)).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();expect(m.reserve).not.toHaveBeenCalled();expect(m.rental).not.toHaveBeenCalled();
});
it('keeps Beauty rental on the existing explicitly scoped rental core without creating a service or card entry',async()=>{
 const rental={...input,payload:{...payload,kind:'空間出租',customerId:'renter',price:700,customer:'untrusted',phone:'untrusted'}};
 expect(await scheduleNativeBeautyService(rental)).toEqual({success:true});expect(m.rental).toHaveBeenCalledWith(expect.objectContaining({roomId:'room-a',customerId:'renter',amount:700}), 'beauty');expect(m.reserve).not.toHaveBeenCalled();expect(m.feature).not.toHaveBeenCalled();
});
it('rejects an ambiguous or foreign rental room before the rental writer',async()=>{
 m.raw.mockResolvedValue([{id:'room-a'},{id:'room-b'}]);expect(await scheduleNativeBeautyService({...input,payload:{...payload,kind:'空間出租',customerId:'renter'}})).toMatchObject({success:false});expect(m.rental).not.toHaveBeenCalled();expect(m.reserve).not.toHaveBeenCalled();
});
it('requires a named rental customer and rejects malformed native intents',async()=>{
 expect(await scheduleNativeBeautyService({...input,payload:{...payload,kind:'空間出租'}})).toMatchObject({success:false});
 expect(await scheduleNativeBeautyService({...input,payload:{...payload,time:'25:00'}})).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();
});
