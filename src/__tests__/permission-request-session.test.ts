import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({session:vi.fn(),grant:vi.fn(),feature:vi.fn()}));
vi.mock("react",()=>({cache:(fn:unknown)=>fn}));
vi.mock("next/cache",()=>({unstable_cache:(fn:unknown)=>fn}));
vi.mock("@/lib/db",()=>({prisma:{staffPermission:{findMany:m.grant}}}));
vi.mock("@/lib/session",()=>({requireStaffSession:m.session}));
vi.mock("@/lib/auth",()=>({auth:vi.fn()}));
vi.mock("@/lib/store",()=>({getActiveStoreForRead:async()=>"store-a"}));
vi.mock("@/lib/feature-gate",()=>({requireStoreFeature:m.feature}));
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>undefined}),headers:async()=>new Headers()}));
vi.mock("@/lib/hq-store-view",()=>({isHqStoreView:async()=>false}));
vi.mock("@/lib/subscription-guard",()=>({assertStoreSubscriptionWritable:async()=>{}}));
import {requirePermission} from "@/lib/permissions";
import {withPermissionRequestSession,permissionRequestSession} from "@/lib/permission-request-session";
import {withCourseCheckoutRequest,musicCheckoutWriteStore} from "@/server/services/music-checkout-request";
beforeEach(async()=>{await import("@/lib/session");await import("@/lib/store");await import("@/lib/feature-gate");await import("@/lib/errors");vi.resetAllMocks();m.session.mockResolvedValue({id:"a",role:"STAFF",staffId:"staff-a",storeId:"store-a"});m.grant.mockResolvedValue([{permission:"customer.read"},{permission:"transaction.read"}]);m.feature.mockResolvedValue(undefined);});
const check=(p:"customer.read"|"transaction.read")=>requirePermission(p,undefined,{deferSubscriptionGuard:true});
it("authenticates once but evaluates each permission and feature",async()=>{
 await withPermissionRequestSession(async()=>{await check("customer.read");await check("transaction.read");});
 expect(m.session).toHaveBeenCalledOnce();expect(m.grant).toHaveBeenCalledTimes(2);expect(m.feature).toHaveBeenCalledWith("store-a","customer_management");
});
it("rejects missing financial permission despite an authenticated customer reader",async()=>{
 m.grant.mockResolvedValue([{permission:"customer.read"}]);
 await withPermissionRequestSession(async()=>{await check("customer.read");await expect(check("transaction.read")).rejects.toThrow("權限");});
});
it("does not reuse sessions outside the scope or in a later request",async()=>{
 await check("transaction.read");await check("transaction.read");expect(m.session).toHaveBeenCalledTimes(2);
 await withPermissionRequestSession(()=>check("transaction.read"));m.session.mockRejectedValue(new Error("revoked"));
 await expect(withPermissionRequestSession(()=>check("transaction.read"))).rejects.toThrow("revoked");expect(m.session).toHaveBeenCalledTimes(4);
});
it("isolates concurrent requests and keeps failed authentication rejected",async()=>{
 const a=vi.fn().mockResolvedValue({id:"a"}),b=vi.fn().mockResolvedValue({id:"b"});
 expect(await Promise.all([withPermissionRequestSession(()=>permissionRequestSession(a)),withPermissionRequestSession(()=>permissionRequestSession(b))])).toEqual([{id:"a"},{id:"b"}]);
 const denied=vi.fn().mockRejectedValue(new Error("denied"));
 await withPermissionRequestSession(async()=>{await expect(permissionRequestSession(denied)).rejects.toThrow("denied");await expect(permissionRequestSession(denied)).rejects.toThrow("denied");});expect(denied).toHaveBeenCalledOnce();
});

it("shares checkout identity and write-store policy while checking each grant and feature",async()=>{
 m.session.mockImplementation(async()=>({id:"a",role:"STAFF",staffId:"staff-a",storeId:"store-a"}));
 m.grant.mockResolvedValue([{permission:"wallet.create"},{permission:"transaction.create"}]);
 const resolve=vi.fn().mockResolvedValue("store-a");
 await withCourseCheckoutRequest(async()=>{
  const users=await Promise.all([requirePermission("wallet.create",undefined,{deferSubscriptionGuard:true}),requirePermission("transaction.create",undefined,{deferSubscriptionGuard:true})]);
  expect(users[0]).toBe(users[1]);
  await Promise.all(users.map(user=>musicCheckoutWriteStore(user,resolve)));
 });
 expect(m.session).toHaveBeenCalledOnce();expect(m.grant).toHaveBeenCalledTimes(2);expect(m.feature).toHaveBeenCalledOnce();expect(resolve).toHaveBeenCalledOnce();
});
it("does not turn wallet permission into receipt permission during checkout",async()=>{
 m.grant.mockResolvedValue([{permission:"wallet.create"}]);
 await withCourseCheckoutRequest(async()=>{
  await requirePermission("wallet.create",undefined,{deferSubscriptionGuard:true});
  await expect(requirePermission("transaction.create",undefined,{deferSubscriptionGuard:true})).rejects.toThrow("權限");
 });
 expect(m.session).toHaveBeenCalledOnce();expect(m.grant).toHaveBeenCalledTimes(2);
});
it("starts fresh after a read scope and reauthenticates revoked identities on the next checkout",async()=>{
 m.grant.mockResolvedValue([{permission:"customer.read"},{permission:"wallet.create"}]);
 await withPermissionRequestSession(async()=>{
  await check("customer.read");
  await withCourseCheckoutRequest(()=>requirePermission("wallet.create",undefined,{deferSubscriptionGuard:true}));
 });
 expect(m.session).toHaveBeenCalledTimes(2);
 m.session.mockRejectedValue(new Error("revoked"));
 await expect(withCourseCheckoutRequest(()=>requirePermission("wallet.create",undefined,{deferSubscriptionGuard:true}))).rejects.toThrow("revoked");
 expect(m.session).toHaveBeenCalledTimes(3);
});
