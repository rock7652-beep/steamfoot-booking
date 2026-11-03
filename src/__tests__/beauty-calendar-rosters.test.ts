import {it,expect,vi} from 'vitest';
import {preparedRoster} from './fixtures/prepared-roster';
vi.mock('server-only',()=>({}));
const m=vi.hoisted(()=>({context:vi.fn(),read:vi.fn(),groups:vi.fn()}));
vi.mock('@/server/beauty/roster-read',()=>({beautyRosterContext:m.context,loadBeautyRoster:m.read}));
vi.mock('@/lib/beauty-db',()=>({beautyPrisma:{beautyAppointment:{findMany:m.groups}}}));
vi.mock('@/server/services/read-request-memo',()=>({withReadRequestMemo:(read:()=>unknown)=>read()}));
vi.mock('@/lib/permission-request-session',()=>({withPermissionRequestSession:(read:()=>unknown)=>read()}));
import {preloadBeautyCalendarRosters} from '@/server/beauty/calendar-rosters';
it('reads all selected groups once and preserves full rows for both groups and calendar days',async()=>{
 const data=preparedRoster();
 data.roster=['a','outside','b'].map((id,index)=>({...data.roster[0],id,service:{revision:1,startsAt:index===1?'2026-12-02T02:00:00Z':'2026-11-08T02:00:00Z',endsAt:'2026-11-08T03:00:00Z',occupiedEndsAt:'2026-11-08T03:00:00Z',serviceName:'服務',technicianName:'技師',locationName:'教室',price:300,debit:false,available:7,payment:{reduction:0,netPrice:300,collected:100,due:200,status:'未收款'}}}));
 m.context.mockResolvedValue({a:{storeId:'s'}});m.read.mockResolvedValue({success:true,data});m.groups.mockResolvedValue([{id:'a',groupId:'g1'},{id:'outside',groupId:'g1'},{id:'b',groupId:'g2'}]);
 const result=await preloadBeautyCalendarRosters('s',[{id:'a',groupId:'g1'},{id:'b',groupId:'g2'}],['2026-11-08','2026-11-09']);
 expect(m.read).toHaveBeenCalledTimes(1);expect(m.read).toHaveBeenCalledWith({a:{storeId:'s'}},{groupId:{in:['g1','g2']}});
 expect(result.details['booking:a'].roster).toEqual(data.roster.slice(0,2));expect(result.details['booking:b'].roster).toEqual([data.roster[2]]);
 expect(result.details['day:2026-11-08'].roster).toEqual([data.roster[0],data.roster[2]]);expect(result.details['day:2026-11-09'].roster).toEqual([]);
 expect(result.details['booking:a'].roster[0]).toMatchObject({service:{payment:{reduction:0,netPrice:300,collected:100,due:200,status:'未收款'}}});
});
it('rejects a switched store before querying groups or balances',async()=>{
 m.read.mockClear();m.groups.mockClear();m.context.mockResolvedValue({a:{storeId:'different'}});
 await expect(preloadBeautyCalendarRosters('s',[],[])).rejects.toThrow('店家已切換');expect(m.groups).not.toHaveBeenCalled();expect(m.read).not.toHaveBeenCalled();
});
