import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({store:vi.fn(),customer:vi.fn(),count:vi.fn(),previous:vi.fn(),entry:vi.fn(),reserve:vi.fn(),notify:vi.fn(),transaction:vi.fn(),finalize:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{store:{findUnique:m.store},customer:{findFirst:m.customer,count:m.count}}}));
vi.mock("@/lib/beauty-db",()=>({beautyPrisma:{beautyCommand:{findUnique:m.previous}}}));
vi.mock("@/lib/permissions",()=>({requirePermission:vi.fn(),checkPermission:vi.fn()}));
vi.mock("@/lib/feature-gate",()=>({requireStoreFeature:vi.fn(),hasStoreFeature:vi.fn()}));
vi.mock("@/server/beauty/service-charges",()=>({serviceCharges:vi.fn()}));
vi.mock("@/server/services/trial-booking-chat-link",()=>({resolveTrialBookingChatLink:m.entry}));
vi.mock("@/server/services/beauty-booking-line-finalization",()=>({finalizeBeautyBookingLine:m.finalize}));
vi.mock("@/server/beauty/manager-notifications",()=>({notifyBeautyBookingManagers:m.notify}));
vi.mock("@/server/beauty/access",()=>({requireBeauty:vi.fn(),beautyTransaction:m.transaction,beautyManager:vi.fn(),beautyMember:vi.fn(),beautyWorker:vi.fn(),command:vi.fn(),audit:vi.fn()}));
vi.mock("@/server/beauty/booking",()=>({reserveParty:m.reserve,findAllocation:vi.fn(),loadAvailability:vi.fn(),settings:vi.fn(),transition:vi.fn(),ownsItem:vi.fn(),assertCustomerAvailable:vi.fn()}));
import { submitBeautyTrial } from "@/server/actions/beauty";
const input={requestKey:"11111111-1111-4111-8111-111111111111",policyRevision:0,date:"2026-11-01",time:"10:00",contactName:"範例",phone:"0900000000",isTrial:true,people:[{name:"範例",phone:"0900000000",serviceId:"service",preference:"ANY"}]};
beforeEach(()=>{
  vi.resetAllMocks();m.store.mockResolvedValue({id:"s"});m.customer.mockResolvedValue(null);m.count.mockResolvedValue(0);m.previous.mockResolvedValue(null);
  m.entry.mockResolvedValue({linkId:"link",storeId:"s",channel:"LINE",chatIdentity:"verified-subject"});
  m.transaction.mockImplementation(async(_actor,work)=>work({}));m.reserve.mockResolvedValue({groupId:"g",ids:["b"]});m.finalize.mockResolvedValue({status:"linked"});
});
it("passes a store-verified entry to booking and reports the identity service's confirmed status",async()=>{
  expect(await submitBeautyTrial("beauty",input,"entry")).toMatchObject({success:true,data:{notificationSetup:{status:"linked"}}});
  expect(m.reserve.mock.calls[0][3]).toMatchObject({linkId:"link",storeId:"s",channel:"LINE",chatIdentity:"verified-subject"});
});
it("keeps the reservation successful when notification linkage needs assistance",async()=>{
  m.finalize.mockResolvedValue({status:"needs_help"});
  expect(await submitBeautyTrial("beauty",input,"entry")).toMatchObject({success:true,data:{groupId:"g",notificationSetup:{status:"needs_help"}}});
  expect(m.reserve).toHaveBeenCalledOnce();
});
it.each([null,{linkId:"foreign",storeId:"other",channel:"LINE",chatIdentity:"other"}])("does not reserve with an expired or cross-store entry",async entry=>{
  m.entry.mockResolvedValue(entry);expect((await submitBeautyTrial("beauty",input,"entry")).success).toBe(false);expect(m.transaction).not.toHaveBeenCalled();
});
it("never attaches an existing phone row to a newly verified LINE subject",async()=>{
  m.count.mockResolvedValue(1);expect((await submitBeautyTrial("beauty",input,"entry")).success).toBe(false);expect(m.reserve).not.toHaveBeenCalled();
});
it("never treats a blocked identity as verified membership",async()=>{
  m.customer.mockResolvedValue({id:"c",lineLinkStatus:"BLOCKED"});expect((await submitBeautyTrial("beauty",input,"entry")).success).toBe(false);expect(m.reserve).not.toHaveBeenCalled();
});
it("reuses an identical committed result without consuming the entry twice",async()=>{
  const stored={groupId:"g",ids:["b"],notificationSetup:{status:"linked"}};
  await submitBeautyTrial("beauty",input,"entry");const parsed=m.reserve.mock.calls[0][2];const actor=m.transaction.mock.calls[0][0];
  m.previous.mockResolvedValue({actorKey:actor.actorKey,intent:JSON.stringify(parsed),result:stored});m.entry.mockClear();m.reserve.mockClear();
  expect(await submitBeautyTrial("beauty",input,"entry")).toEqual({success:true,data:stored});expect(m.entry).not.toHaveBeenCalled();expect(m.reserve).not.toHaveBeenCalled();
});
