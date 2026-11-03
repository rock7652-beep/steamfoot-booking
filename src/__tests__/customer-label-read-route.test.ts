import {beforeEach,expect,it,vi} from 'vitest';
const load=vi.hoisted(()=>vi.fn());
vi.mock('@/server/actions/customer-labels',()=>({loadCustomerLabels:load}));
import {POST} from '@/app/api/customer-labels/read/route';
const request=(data:unknown)=>new Request('https://example.test/api/customer-labels/read',{method:'POST',body:JSON.stringify(data)});
beforeEach(()=>{vi.clearAllMocks();load.mockResolvedValue({storeId:'store',enabled:true,assignments:{visible:['label']}});});
it('uses the independently authorized store reader with private no-store responses',async()=>{
 const r=await POST(request({ids:['visible'],storeId:'store'}));expect(r.status).toBe(200);expect(r.headers.get('Cache-Control')).toBe('private, no-store');expect(load).toHaveBeenCalledWith(['visible'],'store');
});
it('rejects too many ids and authorization failures rather than returning a previous store snapshot',async()=>{
 expect((await POST(request({ids:Array(501).fill('x')}))).status).toBe(400);expect(load).not.toHaveBeenCalled();
 load.mockRejectedValue(Error('denied'));const r=await POST(request({ids:['foreign'],storeId:'other'}));expect(r.status).toBe(400);expect(await r.json()).toHaveProperty('error');
});
