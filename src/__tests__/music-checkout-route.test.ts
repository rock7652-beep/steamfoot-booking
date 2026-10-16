import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({purchase:vi.fn(),receipt:vi.fn(),manager:vi.fn(),scope:vi.fn()}));
vi.mock("@/server/actions/course-members",()=>({assignCoursePointCard:mocks.purchase}));
vi.mock("@/server/actions/music-tuition",()=>({recordMusicTuitionReceipt:mocks.receipt}));
vi.mock("@/server/services/course-access",()=>({courseManager:mocks.manager}));
vi.mock("@/server/services/music-data-scope",()=>({musicDataSeparationEnabled:mocks.scope}));
vi.mock("@/lib/errors",()=>({handleActionError:()=>({success:false,error:"denied"})}));
import {POST} from "@/app/api/music-preview/checkout/route";
const request=(operation="purchase",origin="https://preview.example",contract="1")=>new Request("https://preview.example/s/lubymusic/admin/dashboard/music-checkout",{method:"POST",headers:{origin,"content-type":"application/json","x-music-contract":contract},body:JSON.stringify({operation,input:{requestKey:"unchanged"}})});
beforeEach(()=>{vi.clearAllMocks();mocks.manager.mockResolvedValue({storeId:"store-lubymusic"});mocks.scope.mockReturnValue(true);mocks.purchase.mockResolvedValue({success:true});mocks.receipt.mockResolvedValue({success:true});});
it("rejects cross-origin submissions before authorization or mutation",async()=>{expect((await POST(request("purchase","https://evil.example"))).status).toBe(403);expect(mocks.manager).not.toHaveBeenCalled();expect(mocks.purchase).not.toHaveBeenCalled();});
it("rejects unsupported contract before mutation",async()=>{expect((await POST(request("purchase","https://preview.example","0"))).status).toBe(409);expect(mocks.purchase).not.toHaveBeenCalled();});
it("rejects other stores/environments",async()=>{mocks.scope.mockReturnValue(false);expect((await POST(request())).status).toBe(403);expect(mocks.purchase).not.toHaveBeenCalled();});
it("retains existing permissions and purchase validation",async()=>{expect(await (await POST(request())).json()).toEqual({success:true});expect(mocks.manager).toHaveBeenCalledWith("transaction.create");expect(mocks.purchase).toHaveBeenCalledWith({requestKey:"unchanged"});});
it("routes receipts without purchase side effects",async()=>{await POST(request("receipt"));expect(mocks.receipt).toHaveBeenCalledWith({requestKey:"unchanged"});expect(mocks.purchase).not.toHaveBeenCalled();});
it("does not run mutations when authorization fails",async()=>{mocks.manager.mockRejectedValue(new Error("forbidden"));expect((await (await POST(request())).json()).success).toBe(false);expect(mocks.purchase).not.toHaveBeenCalled();});

it("keeps POST body through a fixed same-origin store route",async()=>{const req=new Request("https://preview.example/api/music-preview/checkout",request());const result=await POST(req);expect(result.status).toBe(307);expect(result.headers.get("location")).toBe("https://preview.example/s/lubymusic/admin/dashboard/music-checkout");expect(mocks.manager).not.toHaveBeenCalled();});
