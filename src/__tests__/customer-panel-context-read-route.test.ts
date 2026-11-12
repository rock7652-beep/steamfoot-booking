import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/server/actions/customer-panel-context',()=>({getCustomerPanelContext:m.read}));
import {GET} from '@/app/(dashboard)/dashboard/customers/panel-read/route';
beforeEach(()=>vi.clearAllMocks());
it.each(['','?customerId=','?customerId='+('a'.repeat(101))])('rejects invalid customer IDs before permission readers (%s)',async query=>{expect((await GET(new Request('https://test/read'+query))).status).toBe(400);expect(m.read).not.toHaveBeenCalled();});
it.each([true,false])('retains authorized context or denial and prevents shared HTTP caching (%s)',async success=>{
 m.read.mockResolvedValue({success});const response=await GET(new Request('https://test/read?customerId=customer'));
 expect(await response.json()).toEqual({success});expect(m.read).toHaveBeenCalledWith('customer');expect(response.headers.get('cache-control')).toBe('private, no-store');expect(response.headers.get('vary')).toBe('Cookie');
});
