import {beforeEach,expect,it,vi} from "vitest";
const h=vi.hoisted(()=>({sync:vi.fn(),read:vi.fn()}));
vi.mock("@/server/actions/sports-series",()=>({syncSportsPermanentCalendar:h.sync}));
vi.mock("@/server/actions/sports-calendar",()=>({loadSportsCalendar:h.read}));
import {POST} from "@/app/(dashboard)/dashboard/courses/calendar-sync/route";
const request=(body=JSON.stringify({date:"2026-11-03"}),origin="https://test.example")=>new Request("https://test.example/hq/dashboard/courses/calendar-sync",{method:"POST",headers:{Origin:origin},body});
beforeEach(()=>{vi.resetAllMocks();h.sync.mockResolvedValue({success:true,warning:null});h.read.mockResolvedValue({success:true,data:{storeId:'sports-live-flow-store',month:'2026-11',sessions:[]}});});
it("rejects cross-origin sync before invoking the authorized write",async()=>{expect((await POST(request(undefined,"https://other.example"))).status).toBe(403);expect(h.sync).not.toHaveBeenCalled();});
it.each(["null","bad-json","x".repeat(201),JSON.stringify({date:"2026"})])("rejects invalid requests %s before syncing",async body=>{expect((await POST(request(body))).status).toBe(400);expect(h.sync).not.toHaveBeenCalled();});
it("returns the freshly authorized complete month after sync in one response",async()=>{
 let finish!:(value:unknown)=>void;h.sync.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
 const pending=POST(request());await vi.waitFor(()=>expect(h.sync).toHaveBeenCalledOnce());expect(h.read).not.toHaveBeenCalled();
 finish({success:true,warning:'部分固定課需核對'});const result=await pending;
 expect(await result.json()).toEqual({success:true,data:{storeId:'sports-live-flow-store',month:'2026-11',sessions:[]},warning:'部分固定課需核對'});
 expect(h.sync).toHaveBeenCalledExactlyOnceWith("2026-11-03");expect(h.read).toHaveBeenCalledExactlyOnceWith("2026-11-03");expect(result.headers.get("Cache-Control")).toBe("private, no-store");
 expect(result.headers.get('Server-Timing')).toMatch(/sync;dur=\d+, read;dur=\d+, calendar;dur=\d+/);
});
it("preserves sync permission, readiness and conflict failures without reading",async()=>{h.sync.mockResolvedValue({success:false,error:"無排課權限"});expect(await (await POST(request())).json()).toEqual({success:false,error:"無排課權限"});expect(h.read).not.toHaveBeenCalled();});
it('does not report success when the subsequent live read is denied',async()=>{
 h.read.mockResolvedValue({success:false,error:'無讀取權限'});
 expect(await (await POST(request())).json()).toEqual({success:false,error:'無讀取權限'});
});
