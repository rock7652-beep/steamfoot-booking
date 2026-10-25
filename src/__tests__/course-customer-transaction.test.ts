import {beforeEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({actor:vi.fn(),customer:vi.fn(),purchase:vi.fn(),staff:vi.fn(),read:vi.fn(),view:vi.fn(),permission:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseManagerRead:m.actor}));
vi.mock("@/lib/db",()=>({prisma:{customer:{findFirst:m.customer},staff:{findMany:m.staff}}}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{coursePurchase:{findFirst:m.purchase}}}));
vi.mock("@/lib/permissions",()=>({checkPermission:m.permission}));
vi.mock("@/server/queries/music-revenue-transactions",()=>({getMusicRevenueTransactions:m.read}));
vi.mock("@/lib/store-view-context-server",()=>({resolveStoreViewContextFromCookie:m.view}));
import {loadCourseCustomerTransaction} from "@/server/actions/course-customer-transaction";
const input={customerId:"person",purchaseId:"order"};
beforeEach(()=>{
 vi.resetAllMocks();m.actor.mockResolvedValue({storeId:"store",user:{id:"admin",role:"ADMIN",staffId:null},isChildStoreView:false});
 m.customer.mockResolvedValue({id:"person"});m.purchase.mockResolvedValue({createdAt:new Date("2026-10-23T18:00:00Z")});
 m.staff.mockResolvedValue([]);m.permission.mockResolvedValue(true);m.view.mockResolvedValue(null);
 m.read.mockResolvedValue({rows:[{id:"order",remaining:4,reserved:0,refunds:[]}]});
});
it("authorizes both reads and obtains fresh finance using the exact store, person and purchase",async()=>{
 expect(await loadCourseCustomerTransaction(input)).toMatchObject({success:true,canRefund:true});
 expect(m.actor.mock.calls.map(c=>c[0])).toEqual(["customer.read","transaction.read"]);
 expect(m.purchase).toHaveBeenCalledWith({where:{storeId:"store",id:"order",customerId:"person"},select:{createdAt:true}});
 expect(m.read).toHaveBeenCalledWith("store",expect.objectContaining({customerId:"person",purchaseId:"order",from:"2026-10-24",to:"2026-10-24"}));
});
it("rejects a foreign/merged customer before reading transactions",async()=>{
 m.customer.mockResolvedValue(null);expect(await loadCourseCustomerTransaction(input)).toMatchObject({success:false});expect(m.read).not.toHaveBeenCalled();
});
it("rejects an order that does not belong to this person",async()=>{
 m.purchase.mockResolvedValue(null);expect(await loadCourseCustomerTransaction(input)).toMatchObject({success:false});expect(m.read).not.toHaveBeenCalled();
});
it("does not expose financial data if either permission fails",async()=>{
 m.actor.mockRejectedValue(new Error("denied"));expect(await loadCourseCustomerTransaction(input)).toMatchObject({success:false});expect(m.customer).not.toHaveBeenCalled();
});
it.each(["legacy","child","view"])("disables all mutations for %s scope",async scope=>{
 if(scope==="child")m.actor.mockResolvedValue({storeId:"store",user:{id:"admin",role:"OWNER"},isChildStoreView:true});
 if(scope==="view")m.view.mockResolvedValue({isViewMode:true});
 expect(await loadCourseCustomerTransaction({...input,...(scope==="legacy"?{dataScope:"legacy"}:{})})).toMatchObject({success:true,canRefund:false,canConfirm:false,canEdit:false,canVoid:false});
});
it("omits capabilities the actor does not have",async()=>{
 m.permission.mockResolvedValue(false);expect(await loadCourseCustomerTransaction(input)).toMatchObject({success:true,canRefund:false,canConfirm:false,canEdit:false,canVoid:false});
});
