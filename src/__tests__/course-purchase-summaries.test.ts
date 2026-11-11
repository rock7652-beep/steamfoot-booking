import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({orders:vi.fn(),tuition:vi.fn()}));
vi.mock('@/lib/course-db',()=>({coursePrisma:{coursePurchase:{findMany:m.orders}}}));
vi.mock('@/server/services/music-tuition',()=>({readMusicTuition:m.tuition}));
import {readCoursePurchaseSummaries} from '@/server/queries/course-purchase-summaries';
beforeEach(()=>{vi.resetAllMocks();m.orders.mockResolvedValue([]);m.tuition.mockResolvedValue(new Map());});
it('does not query purchases without authorized cards',async()=>{
 expect((await readCoursePurchaseSummaries('store','learner',[])).size).toBe(0);expect(m.orders).not.toHaveBeenCalled();
});
it('uses the learner purchase snapshot, not the current catalog price or another shared-card payer',async()=>{
 m.orders.mockResolvedValue([{id:'order',cardId:'card',createdAt:new Date('2026-10-27T02:00Z'),price:4800}]);
 expect((await readCoursePurchaseSummaries('store','learner',['card'])).get('card')).toEqual({date:'2026-10-27T02:00:00.000Z',amount:4800});
 expect(m.orders.mock.calls[0][0]).toEqual({where:{storeId:'store',customerId:'learner',cardId:{in:['card']},status:{in:['CONFIRMED','REFUNDED']}},distinct:['cardId'],orderBy:[{createdAt:'desc'},{id:'desc'}],select:{id:true,cardId:true,createdAt:true,price:true}});
});
it('shows the agreed plan amount for installments instead of just the first receipt, and preserves genuinely free purchases',async()=>{
 m.orders.mockResolvedValue([{id:'partial',cardId:'card',createdAt:new Date('2026-11-01T02:00Z'),price:200},{id:'free',cardId:'free-card',createdAt:new Date('2026-11-01T02:00Z'),price:0}]);
 m.tuition.mockResolvedValue(new Map([['partial',{due:4800,checkoutFingerprint:'private',discountTeacherFee:true}]]));
 const result=await readCoursePurchaseSummaries('store','learner',['card','free-card']);expect(result.get('card')?.amount).toBe(4800);expect(result.get('free-card')?.amount).toBe(0);expect(JSON.stringify([...result])).not.toContain('private');
});
it('keeps unavailable purchase details unknown rather than inventing a zero amount or card creation date',async()=>{
 expect((await readCoursePurchaseSummaries('store','learner',['shared-card'])).get('shared-card')).toBeUndefined();
});
