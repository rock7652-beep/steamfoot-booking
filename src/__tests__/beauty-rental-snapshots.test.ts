import {expect,it,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({find:vi.fn()}));
vi.mock('@/lib/course-db',()=>({coursePrisma:{courseRental:{findMany:m.find}}}));
import {beautyRentalSnapshots} from '@/server/beauty/rental-snapshots';
beforeEach(()=>vi.clearAllMocks());
it('reads one authorized store batch and returns the complete usable detail',async()=>{
 const startsAt=new Date('2026-11-03T07:30:00Z'),endsAt=new Date('2026-11-03T08:30:00Z');
 m.find.mockResolvedValue([{id:'r',roomId:'bed',customerId:'c',customerName:'合成顧客',customerPhone:'0900000001',startsAt,endsAt,amount:200,note:'備註',revision:4,cancelledAt:null,hourlyRateSnapshot:200,payments:[{id:'p',amount:200,paymentMethod:'CASH'}]}]);
 expect(await beautyRentalSnapshots('store',['r'])).toMatchObject({r:{id:'r',revision:4,amount:200,startsAt:startsAt.toISOString(),payment:{id:'p',amount:200}}});
 expect(m.find).toHaveBeenCalledExactlyOnceWith({where:{storeId:'store',id:{in:['r']}},include:{payments:{where:{status:'SUCCESS'},take:1}}});
});
it('does not read empty calendars and falls back on a read failure',async()=>{expect(await beautyRentalSnapshots('store',[])).toEqual({});expect(m.find).not.toHaveBeenCalled();m.find.mockRejectedValue(Error('unavailable'));expect(await beautyRentalSnapshots('store',['r'])).toBeUndefined();});
