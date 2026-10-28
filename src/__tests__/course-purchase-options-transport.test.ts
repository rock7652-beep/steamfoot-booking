import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({load:vi.fn(),fetch:vi.fn()}));
vi.mock('@/server/actions/course-members',()=>({loadCourseStudentPurchase:m.load}));
import {GET} from '@/app/(dashboard)/dashboard/courses/purchase-options/route';
import {readCoursePurchaseOptions} from '@/lib/course-purchase-options-client';
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal('fetch',m.fetch);vi.stubGlobal('window',{location:{pathname:'/s/own-store/admin/dashboard/courses'}});});
afterEach(()=>vi.unstubAllGlobals());
it('reads the current dashboard tenant without joining the mutation queue or caching options',async()=>{
 const result={success:true,data:{plans:[]}};m.fetch.mockResolvedValue({ok:true,json:async()=>result});
 expect(await readCoursePurchaseOptions('booking/a?b')).toEqual(result);
 expect(m.fetch).toHaveBeenCalledWith('/s/own-store/admin/dashboard/courses/purchase-options?bookingId=booking%2Fa%3Fb',{credentials:'same-origin',cache:'no-store'});
 expect(m.load).not.toHaveBeenCalled();
});
it('does not treat an HTTP read failure as purchasable options',async()=>{
 m.fetch.mockResolvedValue({ok:false});await expect(readCoursePurchaseOptions('booking')).rejects.toThrow('方案讀取失敗');
});
it('retains an explicit backend permission denial in the client result',async()=>{
 const result={success:false,error:'權限不足'};m.fetch.mockResolvedValue({ok:true,json:async()=>result});
 expect(await readCoursePurchaseOptions('booking')).toEqual(result);
});
it.each(['','?bookingId=','?bookingId='+('a'.repeat(101))])('rejects malformed booking references before invoking the scoped loader (%s)',async query=>{
 const response=await GET(new Request('https://example.test/dashboard/courses/purchase-options'+query));
 expect(response.status).toBe(400);expect(m.load).not.toHaveBeenCalled();
});
it.each([true,false])('delegates to the full scoped permission loader and never caches its result (%s)',async success=>{
 const result=success?{success:true,data:{plans:[]}}:{success:false,error:'無本店權限'};m.load.mockResolvedValue(result);
 const response=await GET(new Request('https://example.test/dashboard/courses/purchase-options?bookingId=booking'));
 expect(await response.json()).toEqual(result);expect(m.load).toHaveBeenCalledWith('booking');
 expect(response.headers.get('cache-control')).toBe('private, no-store');expect(response.headers.get('vary')).toBe('Cookie');
});
