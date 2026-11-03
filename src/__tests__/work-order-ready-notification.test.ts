import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { dispatchWorkOrderReadyNotification, dispatchWorkOrderReadyIsolatedFixture, enqueueWorkOrderReady } from "@/server/services/work-order-ready-notification";
import { workOrderSchema } from "@/lib/work-orders";
import type { Prisma } from "@prisma/client";

const details = () => ({...workOrderSchema.parse({requestId:"11111111-1111-4111-8111-111111111111",date:"2026-10-12",partyId:"c",details:{item:"調整"}}).details,status:"READY"});
beforeEach(() => {
  vi.resetAllMocks();
  m.blocked.mockReturnValue(false); m.quota.mockReturnValue({allowed:true}); m.config.mockReturnValue({destination:"channel"});
  m.transaction.mockImplementation(async (work: (db: typeof tx)=>Promise<unknown>) => work(tx));
  m.event.findUnique.mockResolvedValue({id:"e",storeId:"a",orderId:"o",customerId:"c",connectionId:"r",createdAt:new Date("2026-10-30T12:00:00Z"),status:"PENDING",nextAttemptAt:new Date(0),retryUntil:new Date(Date.now()+3600000),attempts:0,retryKey:"fixed-key",snapshot:{body:"原始通知",recipient:"line",channelKey:"channel",provider:"line-provider:901"}});
  m.order.mockResolvedValue({id:"o",partyId:"c",workOrderNumber:"261012001",workOrder:details()});
  m.store.mockResolvedValue({id:"a",name:"測試門市",plan:"GROWTH"}); m.setting.mockResolvedValue({workOrderReadyNotificationEnabled:true});
  m.connection.mockResolvedValue({id:"r",centralUserId:"u",lineUserId:"line",channelKey:"channel",identityProvider:"line-provider:901"});
  m.customer.mockResolvedValue({id:"c",userId:null,lineLinkStatus:"LINKED",mergedIntoCustomerId:null,identityLinks:[{userId:"u",provider:"line-provider:901",providerAccountId:"line"}]});
  m.account.mockResolvedValue({userId:"u",user:{status:"ACTIVE"}}); m.logs.count.mockResolvedValue(0);
  m.grants.mockResolvedValue([{featureKey:"work_orders",status:"ENABLED"},{featureKey:"line_reminder",status:"ENABLED"}]);
  m.probe.mockResolvedValue({status:"COMPATIBLE"}); m.push.mockResolvedValue({success:true});
});
describe("actual work-order notification dispatcher with isolated transports", () => {
  it("excludes Login review approvals when selecting a notification recipient", async () => {
    m.event.findUnique.mockResolvedValue(null);
    m.connection.mockResolvedValue([]);
    await enqueueWorkOrderReady(tx as unknown as Prisma.TransactionClient, "a", { id: "o", partyId: "c" });
    expect(m.connection).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      status: "APPROVED", channelKey: { not: { startsWith: "login:" } },
    }) }));
    expect(m.event.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SKIPPED", connectionId: null }) }));
  });
  it("rechecks notification-only connection selection immediately before sending", async () => {
    await dispatchWorkOrderReadyNotification("e");
    expect(m.connection).toHaveBeenCalledWith({ where: expect.objectContaining({ channelKey: { not: { startsWith: "login:" } } }) });
  });
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
  it("uses the fixed retry key and frozen body; records API acceptance separately",async()=>{ await dispatchWorkOrderReadyNotification("e"); expect(m.push).toHaveBeenCalledWith("a","line",[{type:"text",text:"原始通知"}],"fixed-key",new Date("2026-10-30T12:00:00Z")); expect(m.event.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"SENT",sentAt:expect.any(Date)})})); expect(m.order).toHaveBeenCalledOnce(); });
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

afterEach(() => vi.unstubAllEnvs());
describe("isolated coordinator never opens a real transport", () => {
  function fixtureEnv() {
    const values={VERCEL:"1",VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"feat/store-member-link-workorder-line-20261012",VERCEL_GIT_REPO_OWNER:"rock7652-beep",VERCEL_GIT_REPO_SLUG:"steamfoot-booking",CONSULTATION_PREVIEW_INTAKE_ENABLED:"false",DATABASE_URL:"postgresql://postgres:fake@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres",DIRECT_URL:"postgresql://postgres:fake@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres"};
    for(const [key,value] of Object.entries(values))vi.stubEnv(key,value);
    vi.stubEnv("WORKERS_CI_BRANCH","");vi.stubEnv("CF_PAGES_BRANCH","");
  }
  it("refuses main without accessing a delivery",async()=>{vi.stubEnv("VERCEL_GIT_COMMIT_REF","main");await expect(dispatchWorkOrderReadyIsolatedFixture("e","accepted")).rejects.toThrow("unavailable");expect(m.event.findUnique).not.toHaveBeenCalled();});
  it("refuses non-synthetic customers on the isolated branch",async()=>{fixtureEnv();await expect(dispatchWorkOrderReadyIsolatedFixture("e","accepted")).rejects.toThrow("synthetic");expect(m.push).not.toHaveBeenCalled();expect(m.probe).not.toHaveBeenCalled();});
  it.each(["accepted","failed","uncertain"] as const)("uses only local stubs for %s",async outcome=>{fixtureEnv();m.event.findUnique.mockResolvedValueOnce({customerId:"qa-member-workorder-20261012:s",orderId:"o"});await dispatchWorkOrderReadyIsolatedFixture("e",outcome);expect(m.push).not.toHaveBeenCalled();expect(m.probe).not.toHaveBeenCalled();expect(m.event.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:outcome==="accepted"?"SENT":"FAILED"})}));});
});
