import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({permission:vi.fn(),session:vi.fn(),booked:vi.fn(),context:vi.fn()}));
vi.mock('@/lib/session',()=>({requireSession:m.session}));
vi.mock('@/lib/permissions',()=>({requirePermission:m.permission}));
vi.mock('@/lib/store',()=>({validateStoreAccess:async()=> 'store',getActiveStoreForRead:async()=> 'store'}));
vi.mock('@/lib/store-view-context-server',()=>({resolveStoreViewContextFromCookie:async()=>null,storeIdForViewContext:()=> 'store',userForViewContext:(u:unknown)=>u}));
vi.mock('@/lib/db',()=>({prisma:{booking:{groupBy:m.booked}}}));
vi.mock('@/lib/date-utils',()=>({toLocalDateStr:()=> '2026-11-10',getNowTaipeiHHmm:()=> '15:00'}));
vi.mock('@/lib/manager-visibility',()=>({getStoreFilter:()=>({storeId:'store'})}));
vi.mock('@/lib/store-operating-status',()=>({isStoreBookable:async()=>true}));
vi.mock('@/lib/shop-config',()=>({isDutySchedulingEnabled:async()=>false}));
vi.mock('@/lib/business-hours-resolver',()=>({loadDayBusinessHoursContext:m.context,applySlotOverrides:()=>[{startTime:'10:00',capacity:3,isEnabled:true}]}));
import {fetchDaySlots} from '@/server/actions/slots';
beforeEach(()=>{vi.resetAllMocks();m.permission.mockResolvedValue({id:'manager',role:'OWNER',storeId:'store'});m.context.mockResolvedValue({rule:{closed:false},dateObj:new Date('2026-11-10'),slotOverrides:[]});m.booked.mockResolvedValue([{slotTime:'10:00',_sum:{people:2}}]);});
it('returns actual capacity for authorized backfill, while retaining the default deadline behavior',async()=>{
 expect((await fetchDaySlots('2026-11-10','store')).slots[0]).toMatchObject({isPast:true,available:0});
 expect((await fetchDaySlots('2026-11-10','store',{allowPast:true})).slots[0]).toMatchObject({isPast:true,available:1});
 expect(m.permission).toHaveBeenLastCalledWith('booking.create',undefined,{storeId:'store'});
 m.booked.mockResolvedValue([{slotTime:'10:00',_sum:{people:3}}]);
 expect((await fetchDaySlots('2026-11-10','store',{allowPast:true})).slots[0].available).toBe(0);
});
it('rejects a customer forging the backfill flag before reading slots',async()=>{
 m.permission.mockResolvedValue({role:'CUSTOMER',storeId:'store'});
 await expect(fetchDaySlots('2026-11-10','store',{allowPast:true})).rejects.toThrow('補登僅供');
 expect(m.booked).not.toHaveBeenCalled();
});
it('requires create permission in the resolved store',async()=>{
 m.permission.mockResolvedValueOnce({role:'OWNER',storeId:'store'}).mockRejectedValueOnce(new Error('no create permission'));
 await expect(fetchDaySlots('2026-11-10','store',{allowPast:true})).rejects.toThrow('no create permission');
 expect(m.booked).not.toHaveBeenCalled();
});
