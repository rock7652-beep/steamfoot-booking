import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({preview:true,snapshot:vi.fn(),access:vi.fn(),review:vi.fn(),knowledge:vi.fn(),setting:vi.fn(),handoffs:vi.fn(),resume:vi.fn(),handoff:vi.fn(),test:vi.fn()}));
vi.mock("../../scripts/ai-digital-butler-preview-scope.mjs",()=>({assertAiPreview:()=>{if(!mocks.preview)throw Error("OUTSIDE");}}));
vi.mock("@/server/ai/brand-management",()=>({brandManagementRuntime:()=>({snapshot:mocks.snapshot,assertAccess:mocks.access,reviewKnowledge:mocks.review,changeKnowledge:mocks.knowledge,saveSetting:mocks.setting,readHandoffs:mocks.handoffs,resume:mocks.resume,setHandoff:mocks.handoff,test:mocks.test}),brandManagementError:()=>({success:false,error:"操作未確認"})}));
import { GET, POST } from "@/app/api/ai/brand/route";
const url="https://isolated-preview.invalid/api/ai/brand";
const post=(value:unknown,headers:Record<string,string|undefined>={})=>{const h=new Headers({origin:"https://isolated-preview.invalid","content-type":"application/json"});for(const [key,value]of Object.entries(headers)){if(value!==undefined)h.set(key,value);}return new Request(url,{method:"POST",headers:h,body:JSON.stringify(value)});};
beforeEach(()=>{vi.clearAllMocks();mocks.preview=true;mocks.access.mockResolvedValue(undefined);mocks.snapshot.mockResolvedValue({serviceId:"ai-preview-brand-steamfoot",globalStopped:true});mocks.review.mockResolvedValue({success:true,token:"fixture"});});
it("returns only the authenticated snapshot with private no-store headers",async()=>{
 const response=await GET(new Request(url));expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("private, no-store");expect(response.headers.get("vary")).toBe("Cookie");expect((await response.json()).snapshot.globalStopped).toBe(true);
});
it("is absent outside the exact Preview",async()=>{mocks.preview=false;expect((await GET(new Request(url))).status).toBe(404);expect((await POST(post({command:"review",input:{revision:0}}))).status).toBe(404);expect(mocks.snapshot).not.toHaveBeenCalled();expect(mocks.access).not.toHaveBeenCalled();});
it("does not accept URL Store/service overrides",async()=>{expect((await GET(new Request(url+"?storeId=foreign"))).status).toBe(400);expect(mocks.snapshot).not.toHaveBeenCalled();});
it("denies failed session/role checks without returning private data",async()=>{mocks.snapshot.mockRejectedValue(Error("FORBIDDEN"));expect((await GET(new Request(url))).status).toBe(403);mocks.access.mockRejectedValue(Error("FORBIDDEN"));expect((await POST(post({command:"review",input:{revision:0}}))).status).toBe(403);expect(mocks.review).not.toHaveBeenCalled();});
it.each([{origin:"https://foreign.invalid"},{origin:""},{"sec-fetch-site":"cross-site"}])("rejects an untrusted POST origin %j",async headers=>{expect((await POST(post({command:"review",input:{revision:0}},headers))).status).toBe(403);expect(mocks.access).not.toHaveBeenCalled();});
it("routes only the named operation and never switches an owner",async()=>{const response=await POST(post({command:"review",input:{revision:0}}));expect(response.status).toBe(200);expect(mocks.review).toHaveBeenCalledWith({revision:0});expect(mocks.setting).not.toHaveBeenCalled();expect((await POST(post({command:"review",input:{revision:0},storeId:"forged"}))).status).toBe(403);expect(mocks.review).toHaveBeenCalledTimes(1);});
it("bounds streamed request data even without a trustworthy Content-Length",async()=>{
 let cancelled=false;const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(9000));},cancel(){cancelled=true;}});
 const request=new Request(url,{method:"POST",headers:{origin:"https://isolated-preview.invalid","content-type":"application/json"},body,duplex:"half"} as RequestInit);
 expect((await POST(request)).status).toBe(403);expect(cancelled).toBe(true);expect(mocks.review).not.toHaveBeenCalled();
});
