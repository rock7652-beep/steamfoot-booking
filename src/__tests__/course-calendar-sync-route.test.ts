import {beforeEach,expect,it,vi} from "vitest";
const h=vi.hoisted(()=>({sync:vi.fn()}));
vi.mock("@/server/actions/sports-series",()=>({syncSportsPermanentCalendar:h.sync}));
import {POST} from "@/app/(dashboard)/dashboard/courses/calendar-sync/route";
const request=(body=JSON.stringify({date:"2026-11-03"}),origin="https://test.example")=>new Request("https://test.example/hq/dashboard/courses/calendar-sync",{method:"POST",headers:{Origin:origin},body});
beforeEach(()=>{vi.resetAllMocks();h.sync.mockResolvedValue({success:true,warning:null});});
it("rejects cross-origin sync before invoking the authorized write",async()=>{expect((await POST(request(undefined,"https://other.example"))).status).toBe(403);expect(h.sync).not.toHaveBeenCalled();});
it.each(["null","bad-json","x".repeat(201),JSON.stringify({date:"2026"})])("rejects invalid requests %s before syncing",async body=>{expect((await POST(request(body))).status).toBe(400);expect(h.sync).not.toHaveBeenCalled();});
it("calls the original sync once and returns JSON without rendering the dashboard",async()=>{
 const result=await POST(request());expect(await result.json()).toEqual({success:true,warning:null});expect(h.sync).toHaveBeenCalledExactlyOnceWith("2026-11-03");expect(result.headers.get("Cache-Control")).toBe("private, no-store");
});
it("preserves the original permission, readiness and conflict failures",async()=>{h.sync.mockResolvedValue({success:false,error:"無排課權限"});expect(await (await POST(request())).json()).toEqual({success:false,error:"無排課權限"});});
