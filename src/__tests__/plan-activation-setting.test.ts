import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({permission:vi.fn(),store:vi.fn(),feature:vi.fn(),raw:vi.fn(),execute:vi.fn(),upsert:vi.fn(),audit:vi.fn(),transaction:vi.fn()}));
vi.mock("@/lib/permissions",()=>({requirePermission:m.permission}));
vi.mock("@/lib/store",()=>({resolveWriteStoreId:m.store}));
vi.mock("@/lib/feature-gate",()=>({requireStoreFeature:m.feature}));
vi.mock("@/lib/db",()=>({prisma:{$transaction:m.transaction}}));
import {setPlanActivationNotificationEnabled} from "@/server/actions/plan-activation-notification";
beforeEach(()=>{
  vi.resetAllMocks();m.permission.mockResolvedValue({id:"manager"});m.store.mockResolvedValue("A");
  m.transaction.mockImplementation(cb=>cb({$queryRaw:m.raw,$executeRaw:m.execute,messageTemplate:{upsert:m.upsert},auditLog:{create:m.audit}}));
});
it("authorizes the active writable store and audits the independent preference",async()=>{
  expect(await setPlanActivationNotificationEnabled({expectedStoreId:"A",enabled:true})).toEqual({success:true});
  expect(m.permission).toHaveBeenCalledWith("business_hours.manage");expect(m.feature).toHaveBeenCalledWith("A","line_reminder");
  expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({create:expect.objectContaining({storeId:"A",body:"enabled"}),update:{body:"enabled"}}));expect(m.audit).toHaveBeenCalledOnce();
});
it("closing the switch terminates queued events in the same transaction",async()=>{
  expect(await setPlanActivationNotificationEnabled({expectedStoreId:"A",enabled:false})).toEqual({success:true});
  expect(m.execute).toHaveBeenCalledOnce();expect(m.execute.mock.calls[0].slice(1)).toEqual(["A"]);expect(m.upsert.mock.calls[0][0].update.body).toBe("disabled");
});
it.each(["switched-store","read-only","permission","feature"])("rejects %s before writing",async why=>{
  if(why==="switched-store")m.store.mockResolvedValue("B");
  if(why==="read-only")m.store.mockRejectedValue(new Error("read-only"));
  if(why==="permission")m.permission.mockRejectedValue(new Error("forbidden"));
  if(why==="feature")m.feature.mockRejectedValue(new Error("feature disabled"));
  expect(await setPlanActivationNotificationEnabled({expectedStoreId:"A",enabled:true})).toMatchObject({success:false});expect(m.upsert).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();
});
