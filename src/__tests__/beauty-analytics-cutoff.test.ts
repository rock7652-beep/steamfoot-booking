import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({raw:vi.fn(),visits:vi.fn(),cards:vi.fn(),store:vi.fn(),staff:vi.fn(),customers:vi.fn(),refunds:vi.fn(),user:vi.fn()}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{$queryRaw:m.raw,beautyAppointment:{findMany:m.visits},beautyCard:{findMany:m.cards},beautyPayment:{findMany:m.refunds}}}));
vi.mock('@/lib/db',()=>({prisma:{store:{findUniqueOrThrow:m.store},staff:{findMany:m.staff},customer:{findMany:m.customers}}}));
vi.mock('@/lib/session',()=>({getCurrentUser:m.user}));
vi.mock('@/server/beauty/access',()=>({beautyManager:async()=>({storeId:'test-beauty'})}));
import {BeautyAnalytics} from '@/components/beauty/analytics';
import type {BeautyDashboardData} from '@/server/beauty/queries';
beforeEach(()=>{m.user.mockResolvedValue({id:'owner',role:'OWNER',staffId:'owner-staff'});m.raw.mockResolvedValue([]);m.visits.mockResolvedValue([]);m.cards.mockResolvedValue([]);m.refunds.mockResolvedValue([]);m.staff.mockResolvedValue([{id:'own',displayName:'本人',user:{role:'STAFF'}},{id:'peer',displayName:'其他',user:{role:'STAFF'}}]);m.customers.mockResolvedValue([]);m.store.mockResolvedValue({createdAt:new Date('2026-10-01T00:00:00Z')});});
afterEach(()=>{vi.useRealTimers();vi.resetAllMocks();});
it('reads completed services, cards and receipts only up to now while upcoming reservations remain in their own aggregate',async()=>{
 vi.useFakeTimers();const now=new Date('2026-10-22T01:00:00Z');vi.setSystemTime(now);
 m.raw.mockResolvedValue([]);m.visits.mockResolvedValue([]);m.cards.mockResolvedValue([]);m.store.mockResolvedValue({createdAt:new Date('2026-10-01T00:00:00Z')});
 const data={access:{planAccess:true,customerAccess:true,financeAccess:true},customers:[],techs:[],cards:[],now:+now} as unknown as BeautyDashboardData;
 await BeautyAnalytics({data,query:{month:'2026-10'}});
 expect(m.visits).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({storeId:'test-beauty',startsAt:{lte:now},status:'COMPLETED'})}));
 expect(m.cards).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({storeId:'test-beauty',createdAt:{lte:now}})}));
 const reservations=m.raw.mock.calls[0],receipts=m.raw.mock.calls[1];
 expect(reservations.at(-1)).toEqual(new Date('2026-10-31T15:59:59.999Z'));
 expect(receipts.at(-1)).toEqual(now);
});

it('applies the original sports manager scope before executing data queries',async()=>{
 m.user.mockResolvedValue({id:'worker',role:'STAFF',staffId:'own'});
 const data={access:{planAccess:true,customerAccess:false,financeAccess:false},customers:[],techs:[],cards:[],now:Date.now()} as unknown as BeautyDashboardData;
 await BeautyAnalytics({data,query:{perspective:'manager',person:'peer'}});
 expect(m.raw).not.toHaveBeenCalled();expect(m.visits).not.toHaveBeenCalled();
 await BeautyAnalytics({data,query:{perspective:'store'}});
 expect(m.raw).not.toHaveBeenCalled();
 const view=await BeautyAnalytics({data,query:{perspective:'manager',person:'own'}});
 expect(view?.props.all).toBe(false);expect(view?.props.data.scope).toEqual({view:'manager',person:'own'});
 expect(view?.props.data.staff.map((s:{id:string})=>s.id)).toEqual(['own']);
 expect(view?.props.data.segments).toBeNull();expect(view?.props.data.netRevenue).toBeNull();
});
