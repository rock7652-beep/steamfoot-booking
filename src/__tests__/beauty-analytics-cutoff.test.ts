import {afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({raw:vi.fn(),visits:vi.fn(),cards:vi.fn(),store:vi.fn()}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{$queryRaw:m.raw,beautyAppointment:{findMany:m.visits},beautyCard:{findMany:m.cards}}}));
vi.mock('@/lib/db',()=>({prisma:{store:{findUniqueOrThrow:m.store}}}));
vi.mock('@/server/beauty/access',()=>({beautyManager:async()=>({storeId:'test-beauty'})}));
import {BeautyAnalytics} from '@/components/beauty/analytics';
import type {BeautyDashboardData} from '@/server/beauty/queries';
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
