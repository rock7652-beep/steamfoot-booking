import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({load:vi.fn(),fetch:vi.fn()}));
vi.mock('@/server/actions/music-periods',()=>({loadMusicPeriods:m.load}));
import {GET} from '@/app/(dashboard)/dashboard/courses/music-period-read/route';
import {readMusicPeriods} from '@/lib/music-period-read-client';
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal('fetch',m.fetch);vi.stubGlobal('window',{location:{pathname:'/s/music-store/admin/dashboard/courses'}});});
afterEach(()=>vi.unstubAllGlobals());
it('reads independently in the current tenant and preserves Date versus display-string fields',async()=>{
 const at='2026-10-28T04:00:00.000Z';m.fetch.mockResolvedValue({ok:true,text:async()=>JSON.stringify({success:true,data:[{closedAt:at,bookings:[{date:at,assignment:{releasedAt:at}}]}]})});
 const result=await readMusicPeriods('learner/a');expect(result).toMatchObject({success:true,data:[{closedAt:new Date(at),bookings:[{date:at,assignment:{releasedAt:new Date(at)}}]}]});
 expect(m.fetch).toHaveBeenCalledWith('/s/music-store/admin/dashboard/courses/music-period-read?customerId=learner%2Fa',{credentials:'same-origin',cache:'no-store'});expect(m.load).not.toHaveBeenCalled();
});
it('does not turn HTTP read failures into empty successful periods',async()=>{
 m.fetch.mockResolvedValue({ok:false});await expect(readMusicPeriods('learner')).rejects.toThrow('逐期資料讀取失敗');
});
it('preserves denied permissions and module eligibility results',async()=>{
 m.fetch.mockResolvedValue({ok:true,text:async()=>JSON.stringify({success:false,error:'此店尚未啟用逐期紀錄'})});expect(await readMusicPeriods('learner')).toEqual({success:false,error:'此店尚未啟用逐期紀錄'});
});
it.each(['','?customerId=','?customerId='+('a'.repeat(201))])('rejects invalid learner references before the scoped service (%s)',async query=>{
 const r=await GET(new Request('https://example.test/dashboard/courses/music-period-read'+query));expect(r.status).toBe(400);expect(m.load).not.toHaveBeenCalled();
});
it.each([true,false])('delegates grants, period eligibility and tenant scope to the unchanged service (%s)',async success=>{
 const result=success?{success:true,data:[],canCorrect:false}:{success:false,error:'找不到本店學員'};m.load.mockResolvedValue(result);
 const r=await GET(new Request('https://example.test/dashboard/courses/music-period-read?customerId=learner'));expect(await r.json()).toEqual(result);expect(m.load).toHaveBeenCalledWith('learner');expect(r.headers.get('cache-control')).toBe('private, no-store');expect(r.headers.get('vary')).toBe('Cookie');
});
