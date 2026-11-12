import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/server/actions/course-roster-customer',()=>({loadCourseRosterCustomer:m.read}));
import {GET} from '@/app/(dashboard)/dashboard/courses/roster-customer-read/route';
beforeEach(()=>vi.clearAllMocks());
it.each(['','?args=invalid','?args='+('x'.repeat(4001))])('rejects malformed input before reading (%s)',async query=>{expect((await GET(new Request('https://test/read'+query))).status).toBe(400);expect(m.read).not.toHaveBeenCalled();});
it.each([true,false])('retains the scoped authorization result and disables shared HTTP caching (%s)',async success=>{
 const input={customerId:'student',cardId:'card',sessionId:'session',expectedStoreId:'store'},result={success,error:success?undefined:'FORBIDDEN'};m.read.mockResolvedValue(result);
 const response=await GET(new Request('https://test/read?args='+encodeURIComponent(JSON.stringify(input))));
 expect(await response.json()).toEqual(JSON.parse(JSON.stringify(result)));expect(m.read).toHaveBeenCalledWith(input);expect(response.headers.get('cache-control')).toBe('private, no-store');expect(response.headers.get('vary')).toBe('Cookie');
});
