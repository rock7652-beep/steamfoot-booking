import {expect,it,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({load:vi.fn()}));
vi.mock('@/server/actions/sports-staging',()=>({loadSportsStaging:m.load}));
import {GET} from '@/app/(dashboard)/dashboard/courses/schedule-options/route';
beforeEach(()=>m.load.mockReset());
it('uses the same form-only authorized loader and disallows shared caching',async()=>{
 m.load.mockResolvedValue({success:true,data:{storeId:'store'}});const response=await GET();
 expect(m.load).toHaveBeenCalledExactlyOnceWith(true,true);expect(await response.json()).toEqual({success:true,data:{storeId:'store'}});
 expect(response.headers.get('Cache-Control')).toBe('private, no-store');expect(response.headers.get('Vary')).toBe('Cookie');expect(response.headers.get('Server-Timing')).toMatch(/^scheduleoptions;dur=\d+$/);
});
it('preserves authorization rejection without returning metadata',async()=>{
 m.load.mockResolvedValue({success:false,error:'無權限'});expect(await (await GET()).json()).toEqual({success:false,error:'無權限'});
});
