import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({auth:vi.fn(),scope:vi.fn(),permission:vi.fn(),query:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseManagerRead:m.auth}));
vi.mock("@/server/services/music-data-scope",()=>({musicDataSeparationEnabled:m.scope}));
vi.mock("@/server/services/music-native-workflow",()=>({musicNativeWorkflowEnabled:m.scope}));
vi.mock("@/lib/permissions",()=>({checkPermission:m.permission}));
vi.mock("@/server/queries/course-customer-page",()=>({getCourseCustomerPage:m.query}));
import {GET} from "@/app/(dashboard)/dashboard/music-customers/route";
beforeEach(()=>{vi.clearAllMocks();m.auth.mockResolvedValue({storeId:"allowed",user:{role:"MANAGER",staffId:"staff"}});m.scope.mockReturnValue(true);m.permission.mockResolvedValue(false);m.query.mockResolvedValue({rows:[],total:0,page:1});});
it("uses authorized store, real wallet visibility and original filters",async()=>{
 const r=await GET(new Request("https://preview.example/music-customers?search=A&dataScope=legacy"));expect(r.headers.get("cache-control")).toBe("private, no-store");expect((await r.json()).success).toBe(true);expect(m.auth).toHaveBeenCalledWith("customer.read",{reuseVerifiedStore:true});expect(m.query).toHaveBeenCalledWith("allowed","MANAGER","staff",expect.any(URLSearchParams),false,expect.any(Date),true);expect(m.query.mock.calls[0][3].get("dataScope")).toBe("legacy");
});
it.each(["permission","preview"])("rejects %s before reading",async kind=>{
 if(kind==="permission")m.auth.mockRejectedValue(new Error("denied"));else m.scope.mockReturnValue(false);
 expect((await GET(new Request("https://preview.example/music-customers"))).status).toBe(403);expect(m.query).not.toHaveBeenCalled();
});
