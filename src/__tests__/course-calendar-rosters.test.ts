import {it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({actor:vi.fn(),detail:vi.fn()}));
vi.mock('@/server/services/course-access',()=>({courseManager:m.actor}));
vi.mock('@/server/actions/course-members',()=>({loadCourseSessionDetail:m.detail}));
vi.mock('@/server/services/read-request-memo',()=>({withReadRequestMemo:(read:()=>unknown)=>read()}));
vi.mock('@/lib/permission-request-session',()=>({withPermissionRequestSession:(read:()=>unknown)=>read()}));
import {preloadCourseCalendarRosters} from '@/server/services/course-calendar-rosters';
it('loads complete roster-only data for every session before returning the calendar snapshot',async()=>{
 m.actor.mockResolvedValue({storeId:'s'});m.detail.mockImplementation(async(id:string)=>({success:true,data:{roster:[{id,available:10,planName:'十堂'}],trial:{canCollect:true},session:{pointCost:1}}}));
 const result=await preloadCourseCalendarRosters('s',['a','b']);expect(result.storeId).toBe('s');expect(Object.keys(result.details)).toEqual(['a','b']);
 expect(m.detail).toHaveBeenCalledWith('a',true,false);expect(m.detail).toHaveBeenCalledWith('b',true,false);
 expect(result.details.a.roster[0]).toMatchObject({available:10,planName:'十堂'});
});
it('rejects a changed store before reading any detail',async()=>{
 m.detail.mockClear();m.actor.mockResolvedValue({storeId:'other'});await expect(preloadCourseCalendarRosters('s',['a'])).rejects.toThrow('店家已切換');expect(m.detail).not.toHaveBeenCalled();
});
