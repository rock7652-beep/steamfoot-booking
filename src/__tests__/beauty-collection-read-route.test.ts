import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {AppError} from '@/lib/errors';
const m=vi.hoisted(()=>({manager:vi.fn(),quote:vi.fn(),status:vi.fn()}));
vi.mock('@/server/beauty/access',()=>({beautyManager:m.manager}));
vi.mock('@/server/actions/beauty',()=>({readBeautyCollection:m.quote}));
vi.mock('@/server/actions/beauty-collection-intent',()=>({readBeautyCollectionPurchaseIntent:m.status}));
import {POST} from '@/app/api/beauty/collection-read/route';
const input={store:'store-a',operation:'quote',ids:['appointment']};
const request=(body:unknown)=>new NextRequest('https://example.invalid/api/beauty/collection-read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();m.manager.mockResolvedValue({storeId:'store-a',userId:'owner'});m.quote.mockResolvedValue({success:true,data:[{id:'appointment',due:750}]});m.status.mockResolvedValue({success:true,data:null});});
it('reuses the authoritative quote action with no-store headers and request timing',async()=>{
 const response=await POST(request(input));expect(await response.json()).toEqual({success:true,data:[{id:'appointment',due:750}]});expect(m.manager).toHaveBeenCalledWith('transaction.create');expect(m.quote).toHaveBeenCalledWith(['appointment']);expect(m.status).not.toHaveBeenCalled();expect(response.headers.get('Cache-Control')).toBe('private, no-store');expect(response.headers.get('Vary')).toBe('Cookie');expect(response.headers.get('Server-Timing')).toContain('handler;dur=');
});
it('reads recovery status using exactly the selected store, targets and original key',async()=>{
 const key=crypto.randomUUID();await POST(request({...input,operation:'status',requestKey:key}));expect(m.status).toHaveBeenCalledWith({expectedStoreId:'store-a',ids:['appointment'],requestKey:key});expect(m.quote).not.toHaveBeenCalled();
});
it('rejects a changed store before either financial read',async()=>{
 const response=await POST(request({...input,store:'other-store'}));expect(response.status).toBe(403);expect(m.quote).not.toHaveBeenCalled();expect(m.status).not.toHaveBeenCalled();
});
it('denies access when the original collection permission fails',async()=>{
 m.manager.mockRejectedValue(new AppError('FORBIDDEN','denied'));expect((await POST(request(input))).status).toBe(403);expect(m.quote).not.toHaveBeenCalled();
});
it.each([{...input,operation:'collect'},{...input,amounts:[750]},{...input,ids:['a','a']},{...input,ids:[]},{...input,requestKey:'invalid'}])('rejects malformed or write-shaped requests before authorization %#',async body=>{
 expect((await POST(request(body))).status).toBe(403);expect(m.manager).not.toHaveBeenCalled();expect(m.quote).not.toHaveBeenCalled();expect(m.status).not.toHaveBeenCalled();
});
