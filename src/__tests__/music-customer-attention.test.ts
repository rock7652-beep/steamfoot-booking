import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),customer:vi.fn(),music:vi.fn(),orders:vi.fn(),tuition:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{customer:{findFirst:m.customer},storeFeatureEntitlement:{findFirst:m.music}}}));
vi.mock('@/lib/course-db',()=>({coursePrisma:{coursePurchase:{findMany:m.orders}}}));
vi.mock('@/server/services/course-access',()=>({courseManagerRead:m.auth}));
vi.mock('@/server/services/music-tuition',()=>({readMusicTuition:m.tuition}));
vi.mock('@/lib/manager-visibility',()=>({getManagerCustomerWhere:()=>({visible:true})}));
import {loadMusicCustomerAttention} from '@/server/actions/music-customer-attention';
beforeEach(()=>{vi.resetAllMocks();m.auth.mockResolvedValue({storeId:'store',user:{id:'user',role:'OWNER'}});m.customer.mockResolvedValue({id:'customer'});m.music.mockResolvedValue({storeId:'store'});m.orders.mockResolvedValue([]);m.tuition.mockResolvedValue(new Map());});
it('checks both permissions and customer visibility before reading all outstanding purchases',async()=>{
 m.orders.mockResolvedValue([{id:'older-no-card',status:'CONFIRMED',price:800},{id:'settled',status:'CONFIRMED',price:1000},{id:'pending',status:'PENDING',price:0}]);
 m.tuition.mockResolvedValue(new Map([['older-no-card',{due:2300}],['settled',{due:1000}]]));
 expect(await loadMusicCustomerAttention('customer')).toEqual({success:true,data:{outstanding:1500,pending:1}});
 expect(m.auth.mock.calls.map(c=>c[0])).toEqual(['customer.read','transaction.read']);
 expect(m.customer.mock.calls[0][0].where).toMatchObject({storeId:'store',id:'customer',visible:true,mergedIntoCustomerId:null});
 expect(m.orders.mock.calls[0][0]).toEqual({where:{storeId:'store',customerId:'customer',status:{in:['CONFIRMED','PENDING']},voidedAt:null},select:{id:true,status:true,price:true}});
});
it('does not treat a zero price or missing tuition terms as an outstanding amount',async()=>{
 m.orders.mockResolvedValue([{id:'zero',status:'CONFIRMED',price:0},{id:'imported',status:'CONFIRMED',price:800}]);
 expect(await loadMusicCustomerAttention('customer')).toEqual({success:true,data:{outstanding:0,pending:0}});
});
it('rejects mixed actor/store scopes before reading customer or money',async()=>{
 m.auth.mockResolvedValueOnce({storeId:'store',user:{id:'user'}}).mockResolvedValueOnce({storeId:'other',user:{id:'user'}});
 expect((await loadMusicCustomerAttention('customer')).success).toBe(false);expect(m.customer).not.toHaveBeenCalled();expect(m.orders).not.toHaveBeenCalled();
});
it.each(['permission','customer','module'])('does not read purchases outside the %s boundary',async boundary=>{
 if(boundary==='permission')m.auth.mockRejectedValue(new Error('denied'));else if(boundary==='customer')m.customer.mockResolvedValue(null);else m.music.mockResolvedValue(null);
 expect((await loadMusicCustomerAttention('customer')).success).toBe(false);expect(m.orders).not.toHaveBeenCalled();expect(m.tuition).not.toHaveBeenCalled();
});
