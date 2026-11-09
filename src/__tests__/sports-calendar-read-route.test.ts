import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({user:vi.fn(),store:vi.fn(),scope:vi.fn(),read:vi.fn(),music:vi.fn()}));
vi.mock("@/lib/session",()=>({getCurrentUser:m.user}));
vi.mock("@/lib/store",()=>({getActiveStoreForRead:m.store}));
vi.mock("@/lib/sports-native-preview",()=>({sportsNativePreview:m.scope}));
vi.mock("@/server/actions/sports-calendar",()=>({loadSportsCalendar:m.read,loadMusicCalendar:m.music}));
import {POST} from "@/app/(dashboard)/dashboard/courses/calendar-read/route";
const req=(body=JSON.stringify({date:"2026-11-12"}),origin="https://qa.test")=>new Request("https://qa.test/s/sports-live-flow/admin/dashboard/courses/calendar-read",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body});
beforeEach(()=>{vi.resetAllMocks();m.user.mockResolvedValue({id:"owner"});m.store.mockResolvedValue("sports-live-flow-store");m.scope.mockReturnValue(true);m.read.mockResolvedValue({success:true,data:{sessions:[]}});});
it("rejects cross-origin reads before loading identity",async()=>{expect((await POST(req(undefined,"https://other.test"))).status).toBe(403);expect(m.user).not.toHaveBeenCalled();expect(m.read).not.toHaveBeenCalled();});
it("requires a login",async()=>{m.user.mockResolvedValue(null);expect((await POST(req())).status).toBe(401);expect(m.read).not.toHaveBeenCalled();});
it("refuses production and unrelated stores",async()=>{m.scope.mockReturnValue(false);expect((await POST(req())).status).toBe(403);expect(m.read).not.toHaveBeenCalled();});
it.each(["null","not-json",JSON.stringify({date:"2026"}),"a".repeat(201)])("rejects malformed or oversized input %s",async body=>{expect((await POST(req(body))).status).toBe(400);expect(m.read).not.toHaveBeenCalled();});
it("delegates to the existing authorized read and never caches account data",async()=>{const r=await POST(req());expect(m.read).toHaveBeenCalledExactlyOnceWith("2026-11-12");expect(await r.json()).toEqual({success:true,data:{sessions:[]}});expect(r.headers.get("Cache-Control")).toBe("private, no-store");});
it("preserves the reader's booking permission rejection",async()=>{m.read.mockResolvedValue({success:false,error:"無權限"});expect(await (await POST(req())).json()).toEqual({success:false,error:"無權限"});});

it('music reads bypass the sports-only gate but retain the module-specific authorized reader',async()=>{
 m.scope.mockReturnValue(false);m.music.mockResolvedValue({success:true,data:{month:'2026-11',sessions:[]}});
 const result=await POST(req(JSON.stringify({date:'2026-11-12',profile:'MUSIC',dataScope:'legacy'})));
 expect(result.status).toBe(200);expect(m.music).toHaveBeenCalledExactlyOnceWith('2026-11-12','legacy');expect(m.read).not.toHaveBeenCalled();expect(result.headers.get('Server-Timing')).toContain('calendar;dur=');
});
it.each([{profile:'BEAUTY'},{profile:'MUSIC',dataScope:'other'}])('rejects unsupported calendar request scope %s',async scope=>{
 expect((await POST(req(JSON.stringify({date:'2026-11-12',...scope})))).status).toBe(400);expect(m.music).not.toHaveBeenCalled();expect(m.read).not.toHaveBeenCalled();
});
