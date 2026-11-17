import {beforeEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({access:vi.fn(),find:vi.fn()}));
vi.mock("@/server/services/customer-message-access",()=>({customerMessageAccess:m.access}));
vi.mock("@/lib/db",()=>({prisma:{customer:{findMany:m.find}}}));
vi.mock("@/lib/feature-gate",()=>({hasStoreFeature:vi.fn()}));
vi.mock("@/server/services/music-data-scope",()=>({musicCustomerWhere:()=>({scope:"current-module"})}));
import {loadMessageSelection} from "@/server/actions/customer-messages";
beforeEach(()=>{vi.clearAllMocks();m.access.mockResolvedValue({user:{id:"manager"}});m.find.mockResolvedValue([{id:"b",name:"B",phone:null,lineLinkStatus:"LINKED",customerStage:"ACTIVE"},{id:"a",name:"A",phone:null,lineLinkStatus:"LINKED",customerStage:"ACTIVE"}]);});
it("reauthorizes the store and module, returning only the exact requested customers in order",async()=>{
 const result=await loadMessageSelection("shop-a",["a","b"]);
 expect(m.access).toHaveBeenCalledWith("shop-a");
 expect(m.find.mock.calls[0][0].where).toEqual({AND:[{storeId:"shop-a",id:{in:["a","b"]},mergedIntoCustomerId:null},{scope:"current-module"}]});
 expect(result.success&&result.data.map(p=>p.id)).toEqual(["a","b"]);
});
it("rejects revoked access before reading customer data",async()=>{
 m.access.mockRejectedValue(new Error("forbidden"));expect((await loadMessageSelection("shop-a",["a"])).success).toBe(false);expect(m.find).not.toHaveBeenCalled();
});
it("rejects duplicated or incomplete selections rather than silently changing recipients",async()=>{
 expect((await loadMessageSelection("shop-a",["a","a"])).success).toBe(false);expect(m.find).not.toHaveBeenCalled();
 m.find.mockResolvedValue([{id:"a",name:"A",phone:null,lineLinkStatus:"LINKED",customerStage:"ACTIVE"}]);
 expect((await loadMessageSelection("shop-a",["a","foreign-or-merged"])).success).toBe(false);
});
