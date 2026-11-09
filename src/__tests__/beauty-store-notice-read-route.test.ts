import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';

const mocks=vi.hoisted(()=>({load:vi.fn()}));
vi.mock('@/server/actions/beauty-store-notices',()=>({loadBeautyStoreNotices:mocks.load}));
import {POST} from '@/app/api/beauty/store-notices/read/route';

beforeEach(()=>mocks.load.mockReset());

it('forwards the store and filters to the authorized loader without caching',async()=>{
 const input={storeId:'store-a',handled:false,summaryOnly:true,offset:0};
 const result={success:true,storeId:'store-a',enabled:true,count:2,items:[],canHandle:false,more:false};
 mocks.load.mockResolvedValue(result);
 const response=await POST(new NextRequest('http://localhost/api/beauty/store-notices/read',{method:'POST',body:JSON.stringify(input)}));
 expect(mocks.load).toHaveBeenCalledOnce();expect(mocks.load).toHaveBeenCalledWith(input);
 expect(await response.json()).toEqual(result);expect(response.headers.get('cache-control')).toBe('private, no-store');
});

it('preserves denied reads and rejects malformed input without invoking the loader',async()=>{
 mocks.load.mockResolvedValue({success:false,error:'門市已切換'});
 const denied=await POST(new NextRequest('http://localhost/api/beauty/store-notices/read',{method:'POST',body:'{}'}));
 expect(await denied.json()).toEqual({success:false,error:'門市已切換'});
 mocks.load.mockClear();
 const malformed=await POST(new NextRequest('http://localhost/api/beauty/store-notices/read',{method:'POST',body:'{'}));
 expect(malformed.status).toBe(400);expect(mocks.load).not.toHaveBeenCalled();
});
