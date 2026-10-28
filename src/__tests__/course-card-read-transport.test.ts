import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn(),fetch:vi.fn()}));
vi.mock('@/server/queries/course-card-browser',()=>({readCourseCards:m.read}));
import {GET} from '@/app/(dashboard)/dashboard/courses/card-read/route';
import {readNativeCourseCards} from '@/lib/course-card-read-client';
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal('fetch',m.fetch);vi.stubGlobal('window',{location:{pathname:'/s/own-store/admin/dashboard/courses'}});});
afterEach(()=>vi.unstubAllGlobals());
it('uses the current store path and an uncached read without a Server Action',async()=>{
 const input={customerId:'learner/a',search:'A & B',history:false,page:0},result={success:true,rows:[],hasMore:false,totals:[]};
 m.fetch.mockResolvedValue({ok:true,json:async()=>result});expect(await readNativeCourseCards(input)).toEqual(result);
 expect(m.fetch).toHaveBeenCalledWith('/s/own-store/admin/dashboard/courses/card-read?args='+encodeURIComponent(JSON.stringify(input)),{credentials:'same-origin',cache:'no-store'});expect(m.read).not.toHaveBeenCalled();
});
it('retains a permission denial and rejects failed HTTP reads',async()=>{
 m.fetch.mockResolvedValueOnce({ok:true,json:async()=>({success:false,error:'無權限'})}).mockResolvedValueOnce({ok:false});
 expect(await readNativeCourseCards({})).toEqual({success:false,error:'無權限'});await expect(readNativeCourseCards({})).rejects.toThrow('方案讀取失敗');
});
it.each(['','?args=broken','?args='+('a'.repeat(4001))])('rejects malformed transport input before the scoped loader (%s)',async query=>{
 const r=await GET(new Request('https://example.test/dashboard/courses/card-read'+query));expect(r.status).toBe(400);expect(m.read).not.toHaveBeenCalled();
});
it.each([true,false])('delegates every valid read to the authorization service without caching (%s)',async success=>{
 const input={customerId:'learner',page:1},result=success?{success:true,rows:[],hasMore:false}:{success:false,error:'其他門市'};m.read.mockResolvedValue(result);
 const r=await GET(new Request('https://example.test/dashboard/courses/card-read?args='+encodeURIComponent(JSON.stringify(input))));expect(await r.json()).toEqual(result);expect(m.read).toHaveBeenCalledWith(input);expect(r.headers.get('cache-control')).toBe('private, no-store');expect(r.headers.get('vary')).toBe('Cookie');
});
