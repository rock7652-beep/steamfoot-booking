import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({permission:vi.fn(),context:vi.fn(),active:vi.fn(),filter:vi.fn(),customer:vi.fn(),feature:vi.fn(),summary:vi.fn()}));
vi.mock("@/lib/permissions",()=>({requirePermission:m.permission,checkPermission:vi.fn()}));
vi.mock("@/lib/store",()=>({getActiveStoreForRead:m.active}));
vi.mock("@/lib/store-view-context-server",()=>({resolveStoreViewContextFromCookie:m.context,storeIdForViewContext:(id:string)=>id,userForViewContext:(user:unknown)=>user}));
vi.mock("@/lib/manager-visibility",()=>({getStoreFilter:m.filter}));
vi.mock("@/lib/db",()=>({prisma:{customer:{findFirst:m.customer}}}));
vi.mock("@/lib/feature-gate",()=>({hasStoreFeature:m.feature}));
vi.mock("@/lib/native-health-service",()=>({getNativeHealthSummary:m.summary,getLatestNativeHealthRecord:vi.fn()}));
import {getCustomerHealthTracking} from "@/server/actions/customer-panel-summary";
import {AppError} from "@/lib/errors";
beforeEach(()=>{vi.clearAllMocks();m.permission.mockResolvedValue({role:"OWNER"});m.context.mockResolvedValue(null);m.active.mockResolvedValue("store-a");m.filter.mockReturnValue({storeId:"store-a"});m.customer.mockResolvedValue({id:"customer-a",storeId:"store-a",user:null});m.feature.mockResolvedValue(true);m.summary.mockResolvedValue({latest:null,trend:[]});});
it("requires customer read permission and confines history to the verified customer/store",async()=>{
 expect((await getCustomerHealthTracking("customer-a")).success).toBe(true);
 expect(m.permission).toHaveBeenCalledWith("customer.read");
 expect(m.customer.mock.calls[0][0].where).toEqual({id:"customer-a",storeId:"store-a",mergedIntoCustomerId:null});
 expect(m.summary).toHaveBeenCalledWith("customer-a","store-a");
});
it.each([null,{id:"customer-a",storeId:"store-a",user:{status:"SUSPENDED"}}])("rejects an invisible or suspended customer before reading history",async customer=>{
 m.customer.mockResolvedValue(customer);expect((await getCustomerHealthTracking("foreign")).success).toBe(false);expect(m.summary).not.toHaveBeenCalled();
});
it("does not read measurements when health tracking is disabled",async()=>{
 m.feature.mockResolvedValue(false);expect((await getCustomerHealthTracking("customer-a")).success).toBe(false);expect(m.summary).not.toHaveBeenCalled();
});
it("stops before querying customers when permission is denied",async()=>{
 m.permission.mockRejectedValue(new AppError("FORBIDDEN","無權限"));expect((await getCustomerHealthTracking("customer-a")).success).toBe(false);expect(m.customer).not.toHaveBeenCalled();expect(m.summary).not.toHaveBeenCalled();
});
it.each(["",undefined,null])("never treats a missing customer id as the first customer in the store",async id=>{
 expect((await getCustomerHealthTracking(id as string)).success).toBe(false);expect(m.customer).not.toHaveBeenCalled();expect(m.summary).not.toHaveBeenCalled();
});
