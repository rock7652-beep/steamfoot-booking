import { beforeEach, describe, expect, it, vi } from "vitest";
const mock=vi.hoisted(()=>({sessions:vi.fn(),staff:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{courseSession:{findMany:mock.sessions}}}));
vi.mock("@/lib/db",()=>({prisma:{staff:{findMany:mock.staff}}}));
import { getMusicHomeSchedule, musicSessionStatus } from "@/server/queries/music-home";
const now=new Date("2026-10-15T04:00:00Z");
const session={id:"lesson",nameSnapshot:"課程",coachId:"teacher",startsAt:new Date("2026-10-15T02:00:00Z"),endsAt:new Date("2026-10-15T03:00:00Z"),teacherAttendance:"SCHEDULED",room:{name:"教室"},bookings:[{status:"RESERVED"}]};
beforeEach(()=>{vi.clearAllMocks();mock.sessions.mockResolvedValue([session]);mock.staff.mockResolvedValue([{id:"teacher",displayName:"教師"}]);});
describe("music daily workbench",()=>{
  it("uses Taipei boundaries, store scope and excludes cancelled/released classes",async()=>{
    const result=await getMusicHomeSchedule("test-store","2026-10-15",now);
    expect(mock.sessions.mock.calls[0][0].where).toEqual({storeId:"test-store",startsAt:{gte:new Date("2026-10-14T16:00:00Z"),lte:new Date("2026-10-15T15:59:59.999Z")},cancelledAt:null,releasedAt:null});
    expect(mock.staff.mock.calls[0][0].where.storeId).toBe("test-store");
    expect(result.rows[0]).toMatchObject({teacher:"教師",room:"教室",people:1,pending:1,status:"課後待點名"});
    expect(result.rows[0]).not.toHaveProperty("bookings");
  });
  it("does not equate elapsed time with completed attendance",()=>{
    expect(musicSessionStatus(session,now)).toBe("課後待點名");
    expect(musicSessionStatus({...session,bookings:[{status:"ATTENDED"}]},now)).toBe("點名完成");
    expect(musicSessionStatus({...session,bookings:[]},now)).toBe("尚無預約");
    expect(musicSessionStatus({...session,teacherAttendance:"LEAVE"},now)).toBe("教師缺席／待處理");
    expect(musicSessionStatus(session,new Date("2026-10-15T01:00:00Z"))).toBe("未開始");
  });
  it("marks limited results and missing teacher data instead of claiming a complete total",async()=>{
    mock.sessions.mockResolvedValue(Array.from({length:201},(_,i)=>({...session,id:`s${i}`})));mock.staff.mockResolvedValue([]);
    const result=await getMusicHomeSchedule("test-store","2026-10-15",now);
    expect(result.truncated).toBe(true);expect(result.rows).toHaveLength(200);expect(result.rows[0].teacher).toBe("教師待核對");
  });
  it("propagates failure instead of returning zero classes",async()=>{
    mock.sessions.mockRejectedValue(new Error("offline"));await expect(getMusicHomeSchedule("test-store","2026-10-15",now)).rejects.toThrow("offline");
  });
});
