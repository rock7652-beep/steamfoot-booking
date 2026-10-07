import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ get:vi.fn(), set:vi.fn(), user:vi.fn(), access:vi.fn(), store:vi.fn(), audit:vi.fn(), revalidate:vi.fn() }));
vi.mock("next/headers",()=>({cookies:async()=>({get:m.get,set:m.set})}));
vi.mock("next/cache",()=>({revalidatePath:m.revalidate}));
vi.mock("@/lib/session",()=>({requireHqStoreSwitchActor:m.user}));
vi.mock("@/lib/store",()=>({validateStoreAccess:m.access}));
vi.mock("@/lib/db",()=>({prisma:{store:{findUnique:m.store}}}));
vi.mock("@/server/services/operation-audit-outbox",()=>({persistFollowupAudit:m.audit}));
vi.mock("@/lib/errors",()=>({AppError:class extends Error { constructor(public code:string,message:string){super(message);} },handleActionError:(error:Error)=>({success:false,error:error.message})}));
import { switchActiveStore } from "@/server/actions/store-switch";
describe("HQ store view audit",()=>{
  beforeEach(()=>{ vi.resetAllMocks(); m.user.mockResolvedValue({id:"admin",name:"HQ",role:"ADMIN"}); m.store.mockResolvedValue({id:"s1",name:"測試店"}); });
  it("persists verified intent before the view cookie",async()=>{
    expect((await switchActiveStore("s1")).success).toBe(true);
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({actorUserId:"admin",storeId:"s1",action:"HQ_VIEW_STORE",before:{viewedStoreId:"__all__"},after:{viewedStoreId:"s1"}}));
    expect(m.audit.mock.invocationCallOrder[0]).toBeLessThan(m.set.mock.invocationCallOrder[0]);
  });
  it("leaves the view unchanged if evidence cannot be persisted",async()=>{
    m.audit.mockRejectedValue(new Error("queue unavailable"));
    expect((await switchActiveStore("s1")).success).toBe(false);
    expect(m.set).not.toHaveBeenCalled(); expect(m.revalidate).not.toHaveBeenCalled();
  });
  it("records returning to HQ against the previous concrete store",async()=>{
    m.get.mockReturnValue({value:"s1"});
    expect((await switchActiveStore("__all__")).success).toBe(true);
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({storeId:"s1",action:"HQ_VIEW_ALL_STORES",after:{viewedStoreId:"__all__"}}));
  });
  it("does not create another event for an unchanged view",async()=>{
    m.get.mockReturnValue({value:"s1"}); await switchActiveStore("s1");
    expect(m.audit).not.toHaveBeenCalled(); expect(m.store).not.toHaveBeenCalled();
  });
  it("keeps the existing ADMIN permission guard",async()=>{
    m.user.mockResolvedValue({id:"owner",role:"OWNER"}); await switchActiveStore("s1");
    expect(m.audit).not.toHaveBeenCalled(); expect(m.set).not.toHaveBeenCalled();
  });
});
