import {beforeEach,expect,it,vi} from 'vitest';
const read=vi.hoisted(()=>vi.fn());
vi.mock('@/server/actions/course-staff',()=>({readCourseStaffTeaching:read}));
vi.mock('@/lib/permission-request-session',()=>({withPermissionRequestSession:(work:()=>unknown)=>work()}));
import {GET} from '@/app/(dashboard)/dashboard/courses/staff-teaching-read/route';
beforeEach(()=>vi.resetAllMocks());
it.each(['','?staffId=','?staffId='+('a'.repeat(181))])('rejects an invalid read before accessing staff (%s)',async suffix=>{
 const response=await GET(new Request('https://example.test/hq/dashboard/courses/staff-teaching-read'+suffix));expect(response.status).toBe(400);expect(read).not.toHaveBeenCalled();
});
it.each([true,false])('preserves the guarded reader result and private no-store headers (%s)',async success=>{
 const result=success?{success:true,version:'v1',qualificationIds:['A'],fees:[]}:{success:false,error:'找不到本店人員'};read.mockResolvedValue(result);
 const response=await GET(new Request('https://example.test/hq/dashboard/courses/staff-teaching-read?staffId=teacher'));
 expect(await response.json()).toEqual(result);expect(read).toHaveBeenCalledExactlyOnceWith('teacher');expect(response.headers.get('cache-control')).toBe('private, no-store');expect(response.headers.get('vary')).toBe('Cookie');
});
