import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ blocked: vi.fn(), push: vi.fn(), probe: vi.fn(), quota: vi.fn(), config: vi.fn(), transaction: vi.fn(),
  event: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  order: vi.fn(), store: vi.fn(), setting: vi.fn(), connection: vi.fn(), customer: vi.fn(), account: vi.fn(), grants: vi.fn(),
  logs: { count: vi.fn(), upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn() }, lock: vi.fn(),
}));
const tx = { workOrderReadyNotification: m.event, inventoryOrder: {findFirst:m.order}, store: {findUnique:m.store}, shopConfig:{findUnique:m.setting}, storeMemberConnection:{findFirst:m.connection,findMany:m.connection}, customer:{findFirst:m.customer}, account:{findUnique:m.account}, storeFeatureEntitlement:{findMany:m.grants}, messageLog:m.logs, $queryRaw:m.lock };
vi.mock("@/lib/db", () => ({ prisma: { $transaction:m.transaction, workOrderReadyNotification:m.event } }));
vi.mock("@/lib/runtime-env", () => ({ isPreviewExternalIntegrationBlocked:m.blocked }));
vi.mock("@/lib/line", () => ({ pushMessage:m.push, probeStoreLineRecipient:m.probe }));
vi.mock("@/lib/reminder-send-limit", () => ({ checkReminderSendLimit:m.quota }));
vi.mock("@/lib/store-line-config", () => ({ getConfiguredStoreLine:m.config, storeLineIdentityProvider:()=>"line-provider:901" }));
import { dispatchWorkOrderReadyNotification, enqueueWorkOrderReady } from "@/server/services/work-order-ready-notification";
import { workOrderSchema } from "@/lib/work-orders";
import type { Prisma } from "@prisma/client";

const details = () => ({...workOrderSchema.parse({requestId:"11111111-1111-4111-8111-111111111111",date:"2026-10-12",partyId:"c",details:{item:"調整"}}).details,status:"READY"});
beforeEach(() => {
  vi.resetAllMocks();
  m.blocked.mockReturnValue(false); m.quota.mockReturnValue({allowed:true}); m.config.mockReturnValue({destination:"channel"});
  m.transaction.mockImplementation(async (work: (db: typeof tx)=>Promise<unknown>) => work(tx));
  m.event.findUnique.mockResolvedValue({id:"e",storeId:"a",orderId:"o",customerId:"c",connectionId:"r",status:"PENDING",nextAttemptAt:new Date(0),retryUntil:new Date(Date.now()+3600000),attempts:0,retryKey:"fixed-key",snapshot:{body:"原始通知",recipient:"line",channelKey:"channel",provider:"line-provider:901"}});
  m.order.mockResolvedValue({id:"o",partyId:"c",workOrderNumber:"261012001",workOrder:details()});
  m.store.mockResolvedValue({id:"a",name:"測試門市",plan:"GROWTH"}); m.setting.mockResolvedValue({workOrderReadyNotificationEnabled:true});
  m.connection.mockResolvedValue({id:"r",centralUserId:"u",lineUserId:"line",channelKey:"channel",identityProvider:"line-provider:901"});
  m.customer.mockResolvedValue({id:"c",userId:null,lineLinkStatus:"LINKED",mergedIntoCustomerId:null,identityLinks:[{userId:"u",provider:"line-provider:901",providerAccountId:"line"}]});
  m.account.mockResolvedValue({userId:"u",user:{status:"ACTIVE"}}); m.logs.count.mockResolvedValue(0);
  m.grants.mockResolvedValue([{featureKey:"work_orders",status:"ENABLED"},{featureKey:"line_reminder",status:"ENABLED"}]);
  m.probe.mockResolvedValue({status:"COMPATIBLE"}); m.push.mockResolvedValue({success:true});
});
describe("actual work-order notification dispatcher with isolated transports", () => {
  it("blocks Preview before any reads or external probes", async () => { m.blocked.mockReturnValue(true); await dispatchWorkOrderReadyNotification("e"); expect(m.event.findUnique).not.toHaveBeenCalled(); expect(m.probe).not.toHaveBeenCalled(); expect(m.push).not.toHaveBeenCalled(); });
  it.each(["COLLECTED","CANCELLED","PROCESSING"])("does not send queued work changed to %s", async status => {m.order.mockResolvedValue({id:"o",partyId:"c",workOrder:{...details(),status}}); await dispatchWorkOrderReadyNotification("e"); expect(m.push).not.toHaveBeenCalled(); expect(m.event.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"SKIPPED"})}));});
  it.each(["setting","blocked","quota","identity","channel"])("rechecks %s immediately before sending", async guard => {
    if(guard==="setting")m.setting.mockResolvedValue({workOrderReadyNotificationEnabled:false});
    if(guard==="blocked")m.customer.mockResolvedValue({lineLinkStatus:"BLOCKED",userId:null,mergedIntoCustomerId:null,identityLinks:[{userId:"u"}]});
    if(guard==="quota")m.quota.mockReturnValue({allowed:false});
    if(guard==="identity")m.account.mockResolvedValue({userId:"other",user:{status:"ACTIVE"}});
    if(guard==="channel")m.config.mockReturnValue({destination:"other-channel"});
    await dispatchWorkOrderReadyNotification("e"); expect(m.push).not.toHaveBeenCalled();
  });
  it("uses the fixed retry key and frozen body; records API acceptance separately",async()=>{ await dispatchWorkOrderReadyNotification("e"); expect(m.push).toHaveBeenCalledWith("a","line",[{type:"text",text:"原始通知"}],"fixed-key"); expect(m.event.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"SENT",sentAt:expect.any(Date)})})); expect(m.order).toHaveBeenCalledOnce(); });
  it("API failure keeps READY and records the specific reason for retry",async()=>{m.push.mockResolvedValue({success:false,error:"LINE API 429: quota"});await dispatchWorkOrderReadyNotification("e"); expect(m.event.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"FAILED",errorMessage:"LINE API 429: quota"})})); expect(tx.inventoryOrder).not.toHaveProperty("update");});
  it("terminal acceptance and exhausted safety deadline never call LINE again",async()=>{m.event.findUnique.mockResolvedValue({storeId:"a",status:"SENT",nextAttemptAt:new Date(0)});await dispatchWorkOrderReadyNotification("e");expect(m.push).not.toHaveBeenCalled();});
  it("does not create another event on repeated READY",async()=>{await enqueueWorkOrderReady(tx as unknown as Prisma.TransactionClient,"a",{id:"o",partyId:"c"});expect(m.event.create).not.toHaveBeenCalled();});
  it("keeps uncertain API outcomes reserved instead of presenting them as sent",async()=>{m.push.mockResolvedValue({success:false,error:"request timed out"});await dispatchWorkOrderReadyNotification("e");expect(m.logs.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"PENDING",sentAt:null,errorMessage:"request timed out"})}));expect(m.event.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"FAILED"})}));});
  it("does not turn a temporary channel-verification outage into a binding failure",async()=>{m.probe.mockResolvedValue({status:"UNAVAILABLE",httpStatus:503});await dispatchWorkOrderReadyNotification("e");expect(m.push).not.toHaveBeenCalled();expect(m.event.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"FAILED",errorMessage:expect.stringContaining("503")})}));});
  it("freezes content and reserves quota before the first external probe",async()=>{
    m.event.findUnique.mockResolvedValueOnce({storeId:"a"}).mockResolvedValueOnce({id:"e",storeId:"a",orderId:"o",customerId:"c",connectionId:"r",status:"PENDING",snapshot:null}).mockResolvedValueOnce({id:"e",storeId:"a",orderId:"o",customerId:"c",connectionId:"r",status:"SENT",nextAttemptAt:new Date(0)});
    await dispatchWorkOrderReadyNotification("e");
    expect(m.event.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({snapshot:expect.objectContaining({channelKey:"channel",recipient:"line"})})}));
    expect(m.logs.upsert).toHaveBeenCalledWith(expect.objectContaining({create:expect.objectContaining({status:"PENDING",storeId:"a",customerId:"c"})}));
    expect(m.push).not.toHaveBeenCalled();
  });
});
