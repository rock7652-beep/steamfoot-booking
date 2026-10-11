import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({save:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/server/actions/spa-resources",()=>({saveSpaLocation:m.save}));
vi.mock("@/server/actions/spa-service-staff",()=>({saveSpaServiceDetails:m.save}));
vi.mock("@/server/actions/spa-commerce",()=>({saveSpaPackage:m.save}));
import {POST as location} from "@/app/api/spa/settings/location/route";
import {POST as service} from "@/app/api/spa/settings/service/route";
import {POST as pkg} from "@/app/api/spa/settings/package/route";
const receipt={expectedStoreId:"store",requestKey:"123e4567-e89b-42d3-a456-426614174000"};
const cases=[{post:location,input:{name:"床",isActive:true,treatmentIds:[],...receipt}},{post:service,input:{baseName:"服務",variantLabel:"",price:0,serviceMinutes:60,bufferMinutes:0,isActive:true,publicVisible:false,staffIds:[],locationIds:[],...receipt}},{post:pkg,input:{name:"方案",treatmentId:"S",price:0,uses:10,validityDays:180,isActive:true,...receipt}}];
function request(body:unknown,origin="https://preview.invalid"){return new Request("https://preview.invalid/api/spa/settings",{method:"POST",headers:{origin,"Content-Type":"application/json"},body:JSON.stringify(body)});}
beforeEach(()=>{vi.resetAllMocks();});
it.each(cases)("rejects a foreign origin, invalid payload and unversioned edit before mutation",async ({post,input})=>{
 expect((await post(request(input,"https://other.invalid"))).status).toBe(403);
 expect((await post(request({}))).status).toBe(400);
 expect((await post(request({...input,id:"existing"}))).status).toBe(400);expect(m.save).not.toHaveBeenCalled();
});
it.each(cases)("returns a private committed response with server-validated store/key metadata",async({post,input})=>{
 m.save.mockResolvedValue({success:true,storeId:"store",data:{id:"saved"},syncWarning:true});
 const response=await post(request(input));expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("private, no-store");
 expect(await response.json()).toMatchObject({success:true,syncWarning:true,data:{id:"saved"}});
 expect(m.save).toHaveBeenCalledWith(expect.objectContaining({receipt}));
});
it.each(cases)("preserves uncertainty if the transaction response cannot be confirmed",async({post,input})=>{
 m.save.mockRejectedValue(new Error("disconnected"));const response=await post(request(input));expect(response.status).toBe(503);expect(await response.json()).toMatchObject({success:false,uncertain:true});
});
