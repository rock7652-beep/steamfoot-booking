import {beforeEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({permission:vi.fn(),store:vi.fn(),module:vi.fn(),staff:vi.fn()}));
vi.mock("@/lib/permissions",()=>({requirePermission:m.permission}));
vi.mock("@/lib/store",()=>({getActiveStoreForRead:m.store,resolveWriteStoreId:vi.fn()}));
vi.mock("@/lib/industry-module-server",()=>({requireCourseStore:m.module}));
vi.mock("@/lib/db",()=>({prisma:{staff:{findFirst:m.staff}}}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{}}));
vi.mock("@/lib/session",()=>({requireSession:vi.fn()}));
vi.mock("@/server/services/course-coach-notification-kick",()=>({kickCoachNotifications:vi.fn()}));
import {courseManagerRead,courseManager} from "@/server/services/course-access";
import {withMusicCheckoutRequest} from "@/server/services/music-checkout-request";
import {resolveWriteStoreId} from "@/lib/store";
import {registerHqStoreViewContext} from "@/lib/hq-store-view-context";
beforeEach(()=>{vi.clearAllMocks();m.store.mockResolvedValue("authorized-store");m.module.mockResolvedValue(undefined);m.staff.mockResolvedValue({id:"staff"});});
it("reuses only a server-registered actor object after permission and retains module checks",async()=>{
 const user={id:"hq",role:"ADMIN",storeId:null,staffId:null};registerHqStoreViewContext(user,"verified-store");m.permission.mockResolvedValue(user);
 const measure=vi.fn(async(_name:string,work:()=>Promise<unknown>)=>work());
 const result=await courseManagerRead("transaction.read",{reuseVerifiedStore:true,timing:{measure} as any});
 expect(result.storeId).toBe("verified-store");expect(m.permission).toHaveBeenCalledWith("transaction.read",expect.any(Object),{deferSubscriptionGuard:true});
 expect(m.store).not.toHaveBeenCalled();expect(m.module).toHaveBeenCalledWith("verified-store");
 expect(measure.mock.calls.map(c=>c[0])).toEqual(["store.verified","store.module"]);
});
it("does not reuse a prior request's same account or serialized scope",async()=>{
 const previous={id:"hq",role:"ADMIN"};registerHqStoreViewContext(previous,"old-store");
 m.permission.mockResolvedValue({id:"hq",role:"ADMIN",storeId:null,staffId:null,verifiedStoreId:"old-store"});
 expect((await courseManagerRead("transaction.read",{reuseVerifiedStore:true})).storeId).toBe("authorized-store");expect(m.store).toHaveBeenCalledOnce();
});
it("denies revoked permission before consuming verified context",async()=>{
 m.permission.mockRejectedValue(new Error("permission revoked"));await expect(courseManagerRead("transaction.read",{reuseVerifiedStore:true})).rejects.toThrow("permission revoked");expect(m.store).not.toHaveBeenCalled();expect(m.module).not.toHaveBeenCalled();
});
it("denies a non-course store even with a verified store context",async()=>{
 const user={id:"hq",role:"ADMIN"};registerHqStoreViewContext(user,"verified-store");m.permission.mockResolvedValue(user);m.module.mockRejectedValue(new Error("wrong module"));
 await expect(courseManagerRead("transaction.read",{reuseVerifiedStore:true})).rejects.toThrow("wrong module");
});
it("retains active staff and active user membership checks for store staff",async()=>{
 m.permission.mockResolvedValue({id:"owner",role:"OWNER",storeId:"authorized-store",staffId:"staff"});m.staff.mockResolvedValue(null);
 await expect(courseManagerRead("transaction.read",{reuseVerifiedStore:true})).rejects.toThrow("本店工作權限已停用");
 expect(m.staff).toHaveBeenCalledWith(expect.objectContaining({where:{id:"staff",userId:"owner",storeId:"authorized-store",status:"ACTIVE",user:{status:"ACTIVE"}}}));
});
it("leaves the existing resolver path unchanged unless explicitly enabled",async()=>{
 const user={id:"hq",role:"ADMIN"};registerHqStoreViewContext(user,"verified-store");m.permission.mockResolvedValue(user);
 expect((await courseManagerRead("transaction.read")).storeId).toBe("authorized-store");expect(m.store).toHaveBeenCalledOnce();
});
it("shares the write-store resolver while still checking each permission and module",async()=>{
 const user={id:"hq",role:"ADMIN",staffId:null,storeId:null};
 m.permission.mockResolvedValue(user);vi.mocked(resolveWriteStoreId).mockResolvedValue("authorized-store");
 await withMusicCheckoutRequest(()=>Promise.all([courseManager("transaction.create"),courseManager("wallet.create")]));
 expect(m.permission.mock.calls.map(c=>c[0])).toEqual(["transaction.create","wallet.create"]);
 expect(resolveWriteStoreId).toHaveBeenCalledOnce();expect(m.module).toHaveBeenCalledTimes(2);
});
