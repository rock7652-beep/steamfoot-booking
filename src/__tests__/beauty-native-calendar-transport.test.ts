import {afterEach,expect,it,vi} from 'vitest';
import {readBeautyNativeCalendar,beautyCalendarSnapshotVersion} from '@/lib/beauty/native-calendar';
afterEach(()=>vi.unstubAllGlobals());
it('rejects a stale date receipt instead of replacing the current calendar',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({success:true,data:{date:'2026-10-26',calendar:'month',items:[]}})})));
 await expect(readBeautyNativeCalendar('2026-10-27','soulife')).rejects.toThrow('日期已變更');
});
it('uses an authenticated GET with the selected store and accepts only its requested date',async()=>{
 const fetch=vi.fn(async()=>({ok:true,json:async()=>({success:true,data:{date:'2026-10-27',calendar:'month',items:[]}})}));
 vi.stubGlobal('fetch',fetch);
 expect(await readBeautyNativeCalendar('2026-10-27','soulife')).toMatchObject({success:true});
 expect(fetch).toHaveBeenCalledWith(expect.stringContaining('store=soulife'),expect.objectContaining({credentials:'same-origin',cache:'no-store'}));
});

it('retains the same monthly snapshot when only the selected day changes',()=>{
 const data={date:'2026-11-04',items:[],rentals:[]};
 const version=beautyCalendarSnapshotVersion(data,true,{});
 expect(beautyCalendarSnapshotVersion({...data,date:'2026-11-05'},true,{})).toBe(version);
 expect(beautyCalendarSnapshotVersion({...data,date:'2026-12-01'},true,{})).not.toBe(version);
 expect(beautyCalendarSnapshotVersion(data,false,{})).not.toBe(version);
});
