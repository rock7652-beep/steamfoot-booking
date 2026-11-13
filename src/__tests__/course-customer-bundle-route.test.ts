import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({cards:vi.fn(),progress:vi.fn()}));
vi.mock('@/server/queries/course-card-browser',()=>({readCourseCards:m.cards}));
vi.mock('@/server/services/course-card-progress-batch',()=>({readCourseCardProgressBatch:m.progress}));
vi.mock('@/lib/permission-request-session',()=>({withPermissionRequestSession:(work:()=>unknown)=>work()}));
import {GET} from '@/app/(dashboard)/dashboard/courses/card-read/route';
const request=(args:unknown,store='store')=>new Request('https://test.invalid/hq/dashboard/courses/card-read?args='+encodeURIComponent(JSON.stringify(args))+'&progressStoreId='+store);
beforeEach(()=>{vi.resetAllMocks();m.cards.mockResolvedValue({success:true,rows:[{id:'card'}],hasMore:false});m.progress.mockResolvedValue([{cardId:'card',result:{success:true,data:{available:true,total:8,completed:[]}}}]);});
it('returns cards and progress together with the same customer, store and data scope',async()=>{
 const response=await GET(request({customerId:'student',dataScope:'legacy'}));
 expect(await response.json()).toMatchObject({success:true,rows:[{id:'card'}],progress:[{cardId:'card',result:{success:true,data:{total:8}}}]});
 expect(m.progress).toHaveBeenCalledExactlyOnceWith({cardIds:['card'],customerId:'student',expectedStoreId:'store',dataScope:'legacy'});
 expect(response.headers.get('cache-control')).toBe('private, no-store');expect(response.headers.get('vary')).toBe('Cookie');
});
it('never reads progress after a denied customer read',async()=>{
 m.cards.mockResolvedValue({success:false,error:'無權限'});
 expect(await (await GET(request({customerId:'hidden'}))).json()).toEqual({success:false,error:'無權限'});expect(m.progress).not.toHaveBeenCalled();
});
it('retains denied progress as an error rather than presenting empty dates',async()=>{
 m.progress.mockResolvedValue([{cardId:'card',result:{success:false,error:'門市或權限已變更'}}]);
 expect(await (await GET(request({customerId:'student'},'other'))).json()).toMatchObject({progress:[{result:{success:false,error:'門市或權限已變更'}}]});
});
it.each([{}, {cardId:'card'}, {customerId:'student',cardId:'card'}])('does not bundle a catalog or card-detail read (%j)',async args=>{
 await GET(request(args));expect(m.progress).not.toHaveBeenCalled();
});
it('passes only the displayed twenty card IDs to one bounded progress batch',async()=>{
 m.cards.mockResolvedValue({success:true,rows:Array.from({length:40},(_,id)=>({id:String(id)})),hasMore:true});
 m.progress.mockImplementation(async(input:{cardIds:string[]})=>input.cardIds.map(cardId=>({cardId,result:{success:true,data:{available:false}}})));
 const result=await (await GET(request({customerId:'student'}))).json();expect(result.progress).toHaveLength(20);expect(m.progress).toHaveBeenCalledOnce();expect(m.progress.mock.calls[0][0].cardIds).toEqual(Array.from({length:20},(_,id)=>String(id)));
});
it('rejects invalid input before reading any customer data',async()=>{
 for(const url of ['?args=null&progressStoreId=', '?args=broken','?args='+('x'.repeat(4001))])expect((await GET(new Request('https://test.invalid/card-read'+url))).status).toBe(400);
 expect(m.cards).not.toHaveBeenCalled();expect(m.progress).not.toHaveBeenCalled();
});
