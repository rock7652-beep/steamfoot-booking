import {it,expect,vi,beforeEach,afterEach} from 'vitest';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({actor:vi.fn(),detail:vi.fn()}));
vi.mock('@/server/services/course-access',()=>({courseManager:m.actor}));
vi.mock('@/server/queries/authorized-course-session-detail',()=>({readAuthorizedCourseSessionDetail:m.detail}));
vi.mock('@/server/services/read-request-memo',()=>({withReadRequestMemo:(read:()=>unknown)=>read()}));
vi.mock('@/lib/permission-request-session',()=>({withPermissionRequestSession:(read:()=>unknown)=>read()}));
import {preloadCourseCalendarRosters} from '@/server/services/course-calendar-rosters';
import {preparedRoster} from './fixtures/prepared-roster';
beforeEach(()=>vi.clearAllMocks());
afterEach(()=>vi.restoreAllMocks());
it('loads complete roster-only data for every session before returning the calendar snapshot',async()=>{
 m.actor.mockResolvedValue({storeId:'s'});m.detail.mockImplementation(async(_actor:unknown,id:string)=>{const data=preparedRoster(id);return {success:true,data:{...data,roster:data.roster.map(row=>({...row,available:10,planName:'十堂'}))}};});
 const result=await preloadCourseCalendarRosters('s',['a','b']);expect(result.storeId).toBe('s');expect(Object.keys(result.details)).toEqual(['a','b']);
 expect(m.actor).toHaveBeenCalledTimes(1);expect(m.detail).toHaveBeenCalledWith({storeId:'s'},'a',true,false);expect(m.detail).toHaveBeenCalledWith({storeId:'s'},'b',true,false);
 expect(result.details.a.roster[0]).toMatchObject({available:10,planName:'十堂'});
});
it('rejects a changed store before reading any detail',async()=>{
 m.detail.mockClear();m.actor.mockResolvedValue({storeId:'other'});await expect(preloadCourseCalendarRosters('s',['a'])).rejects.toThrow('店家已切換');expect(m.detail).not.toHaveBeenCalled();
});
it('logs failed preload diagnostics without returning a partial snapshot or leaking detail errors',async()=>{
 const log=vi.spyOn(console,'info').mockImplementation(()=>{});
 m.actor.mockResolvedValue({storeId:'s'});m.detail.mockResolvedValue({success:false,error:'private failure'});
 await expect(preloadCourseCalendarRosters('s',['private-session'])).rejects.toThrow('private failure');
 expect(log).toHaveBeenCalledWith('[calendar-roster-preload]',expect.any(String));
 expect(JSON.parse(log.mock.calls[0][1])).toMatchObject({sessions:1,completed:false,authorizationMs:expect.any(Number),elapsedMs:expect.any(Number),reads:[]});
 expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-/);
});
it('starts fresh authorization while page sessions are pending but reads no roster until both finish',async()=>{
 let supplyIds!:(ids:string[])=>void;
 const ids=new Promise<string[]>(resolve=>{supplyIds=resolve;});
 m.actor.mockResolvedValue({storeId:'s'});m.detail.mockImplementation(async(_actor:unknown,id:string)=>({success:true,data:preparedRoster(id)}));
 const pending=preloadCourseCalendarRosters('s',ids);
 expect(m.actor).toHaveBeenCalledOnce();await Promise.resolve();expect(m.detail).not.toHaveBeenCalled();
 supplyIds(['a']);expect(await pending).toMatchObject({storeId:'s',details:{a:{roster:[{id:'a'}]}}});
});
it('does not read details before authorization or after a rejected session read',async()=>{
 let authorize!:(actor:{storeId:string})=>void;
 m.actor.mockImplementationOnce(()=>new Promise(resolve=>{authorize=resolve;}));
 m.detail.mockResolvedValue({success:true,data:preparedRoster('a')});
 const pending=preloadCourseCalendarRosters('s',Promise.resolve(['a']));
 await Promise.resolve();expect(m.detail).not.toHaveBeenCalled();authorize({storeId:'s'});await pending;
 m.detail.mockClear();m.actor.mockResolvedValue({storeId:'s'});
 await expect(preloadCourseCalendarRosters('s',Promise.reject(new Error('session read failed')))).rejects.toThrow('session read failed');
 expect(m.detail).not.toHaveBeenCalled();
});
