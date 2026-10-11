import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({save:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/server/services/music-subject-save",()=>({saveMusicSubjectWithReceipt:m.save}));
vi.mock("next/cache",()=>({revalidatePath:m.revalidate}));
import {POST} from "@/app/api/courses/subjects/route";
const input={expectedStoreId:"store-a",requestKey:"123e4567-e89b-42d3-a456-426614174000",name:"吉他",category:"",description:"",isActive:true};
const row={...input,id:"s1",updatedAt:"2026-10-10T00:00:00.000Z"};
function request(origin="https://preview.example",body:unknown=input){return new Request("https://preview.example/api/courses/subjects",{method:"POST",headers:{origin,"Content-Type":"application/json"},body:JSON.stringify(body)});}
beforeEach(()=>{vi.clearAllMocks();m.save.mockResolvedValue({storeId:"store-a",data:row});m.revalidate.mockReset();});
it("rejects cross-origin and invalid bodies before invoking a write",async()=>{
 expect((await POST(request("https://evil.example"))).status).toBe(403);
 expect((await POST(request("https://preview.example",{name:""}))).status).toBe(400);
 expect(m.save).not.toHaveBeenCalled();
});
it("returns the committed row even if marking the next visit stale fails",async()=>{
 m.revalidate.mockImplementation(()=>{throw new Error("cache unavailable");});
 const response=await POST(request());expect(response.status).toBe(200);
 expect(response.headers.get("cache-control")).toBe("private, no-store");
 expect(await response.json()).toMatchObject({success:true,storeId:"store-a",data:{id:"s1"},syncWarning:true});
 expect(m.save).toHaveBeenCalledTimes(1);
});
it("classifies unknown commit failures as uncertain so retries keep their receipt",async()=>{
 m.save.mockRejectedValue(new Error("connection lost"));const response=await POST(request());expect(response.status).toBe(503);expect(await response.json()).toMatchObject({success:false,uncertain:true});
});
