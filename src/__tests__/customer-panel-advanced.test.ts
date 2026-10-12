import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({customer:vi.fn(),request:vi.fn(),permission:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{customer:{findFirst:m.customer},lineRebindRequest:{findFirst:m.request}}}));
vi.mock("@/lib/permissions",()=>({requirePermission:async()=>({role:"OWNER",staffId:"staff"}),checkPermission:m.permission}));
vi.mock("@/lib/store",()=>({getActiveStoreForRead:async()=>"store-a"}));
vi.mock("@/lib/manager-visibility",()=>({getStoreFilter:()=>({storeId:"store-a"})}));
vi.mock("@/lib/store-view-context-server",()=>({resolveStoreViewContextFromCookie:async()=>({isViewMode:true}),storeIdForViewContext:(id:string)=>id,userForViewContext:(user:unknown)=>user}));
vi.mock("@/lib/line-config",()=>({getLineConfigForStore:()=>({expectedBasicId:"test"})}));
import { getCustomerPanelAdvanced } from "@/server/actions/customer-panel-advanced";
beforeEach(()=>{vi.clearAllMocks();m.permission.mockResolvedValue(true);m.request.mockResolvedValue(null);});
it("rejects customers outside the active store before reading rebind requests",async()=>{
  m.customer.mockResolvedValue(null);
  expect((await getCustomerPanelAdvanced("customer-b")).success).toBe(false);
  expect(m.customer).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:"customer-b",storeId:"store-a",mergedIntoCustomerId:null})}));
  expect(m.request).not.toHaveBeenCalled();
});
it("keeps HQ view mode read-only even when the actor has rebind permission",async()=>{
  m.customer.mockResolvedValue({id:"customer-a",storeId:"store-a",user:null,followUps:[]});
  const result=await getCustomerPanelAdvanced("customer-a");
  expect(result.success&&result.data.canManageLineRebind).toBe(false);
  expect(m.request).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({customerId:"customer-a",storeId:"store-a"})}));
});
