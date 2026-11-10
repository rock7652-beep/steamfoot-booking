import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/server/actions/course-card-progress',()=>({loadCourseCardProgress:m.read}));
vi.mock('@/lib/permission-request-session',()=>({withPermissionRequestSession:(work:()=>unknown)=>work()}));
import {GET} from '@/app/(dashboard)/dashboard/courses/card-progress-read/route';
beforeEach(()=>vi.resetAllMocks());
it.each(['','?args=broken','?args='+('a'.repeat(4001))])('rejects malformed progress reads before invoking the authorized action (%s)',async query=>{
 const r=await GET(new Request('https://example.test/hq/dashboard/courses/card-progress-read'+query));expect(r.status).toBe(400);expect(m.read).not.toHaveBeenCalled();
});
it.each([true,false])('preserves the action authorization result and never caches progress (%s)',async success=>{
 const input={cardId:'card',customerId:'learner',expectedStoreId:'store'},result=success?{success:true,data:{available:true,total:8,completed:[]}}:{success:false,error:'無權限'};m.read.mockResolvedValue(result);
 const r=await GET(new Request('https://example.test/hq/dashboard/courses/card-progress-read?args='+encodeURIComponent(JSON.stringify(input))));
 expect(await r.json()).toEqual(result);expect(m.read).toHaveBeenCalledExactlyOnceWith(input);expect(r.headers.get('cache-control')).toBe('private, no-store');expect(r.headers.get('vary')).toBe('Cookie');
});
