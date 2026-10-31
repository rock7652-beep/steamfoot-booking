import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  writable: vi.fn(),
  link: vi.fn(),
  session: vi.fn(),
  account: vi.fn(),
  customer: vi.fn(),
  store: vi.fn(),
  module: vi.fn(),
  resolve: vi.fn(),
  staff: vi.fn(),
  permission: vi.fn(),
  writeStore: vi.fn(),
  readStore: vi.fn(),
}));
vi.mock("@/lib/subscription-guard", () => ({ assertStoreSubscriptionWritable: m.writable }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/course-db", () => ({ coursePrisma: {} }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findFirst: m.account },
    customer: { findFirst: m.customer },
    staffMemberLink: { findUnique: m.link },
    staff: {findFirst:m.staff},
  },
}));
vi.mock("@/lib/session", () => ({ requireSession: m.session }));
vi.mock("@/lib/permissions", () => ({ requirePermission: m.permission }));
vi.mock("@/lib/store", () => ({ resolveWriteStoreId: m.writeStore,getActiveStoreForRead:m.readStore }));
vi.mock("@/lib/industry-module-server", () => ({
  requireCourseStore: m.module,
}));
vi.mock("@/server/services/member-request-store", () => ({
  resolveMemberRequestStoreId: m.store,
}));
vi.mock("@/server/services/central-member-resolver", () => ({
  resolveCentralMemberCustomerForStore: m.resolve,
}));
import { courseMember, courseAccount, courseManager, courseManagerRead } from "@/server/services/course-access";
import {withReadRequestMemo} from "@/server/services/read-request-memo";
beforeEach(() => {
  vi.clearAllMocks();
  m.writable.mockResolvedValue(undefined);
  m.link.mockResolvedValue(null);
  m.session.mockResolvedValue({ id: "a", storeId: "store-a" });
  m.account.mockResolvedValue({ id: "a" });
  m.store.mockResolvedValue("store-a");
  m.resolve.mockResolvedValue({ customerId: "learner-a" });
  m.customer.mockResolvedValue({ id: "learner-a", name: "A" });
  m.permission.mockResolvedValue({id:"u",staffId:"st",role:"OWNER"});
  m.readStore.mockResolvedValue("s");m.writeStore.mockResolvedValue("s");m.staff.mockResolvedValue({id:"st"});m.module.mockResolvedValue(undefined);
});
describe("course fixed member access", () => {
  it("uses the resolved fixed account and store, never contact matching", async () => {
    expect((await courseMember()).customer.id).toBe("learner-a");
    expect(m.customer).toHaveBeenCalledWith({
      where: {
        id: "learner-a",
        storeId: "store-a",
        mergedIntoCustomerId: null,
      },
      select: { id: true, name: true },
    });
  });
  it("does not bypass central unlink or conflict rejection with legacy fallback", async () => {
    m.resolve.mockResolvedValue(null);
    await expect(courseMember()).rejects.toThrow("帳號尚未連結");
    expect(m.customer).not.toHaveBeenCalled();
  });
  it("allows fixed coach identity but rejects member operations for coach-only mode", async () => {
    m.link.mockResolvedValue({ courseMemberEnabled: false });
    expect((await courseAccount()).user.id).toBe("a");
    await expect(courseMember()).rejects.toThrow("僅開放授課人員工作");
  });
  it("rejects suspended accounts before resolving membership", async () => {
    m.account.mockResolvedValue(null);
    await expect(courseMember()).rejects.toThrow("帳號已停用");
    expect(m.resolve).not.toHaveBeenCalled();
  });
});

 it("keeps expired account reads but rejects member and coach writes using the resolved store", async () => {
   m.writable.mockRejectedValue(new Error("目前為唯讀模式"));
   await expect(courseAccount()).resolves.toMatchObject({storeId:"store-a"});
   expect(m.writable).not.toHaveBeenCalled();
   await expect(courseMember({write:true})).rejects.toThrow("唯讀");
   await expect(courseAccount({write:true})).rejects.toThrow("唯讀");
   expect(m.writable).toHaveBeenLastCalledWith("store-a");
   m.writable.mockResolvedValue(undefined);
   await expect(courseMember({write:true})).resolves.toMatchObject({storeId:"store-a"});
 });

it("shares one current staff membership read while every grant and store check remains independent",async()=>{
 await withReadRequestMemo(()=>Promise.all([courseManager("booking.read"),courseManager("customer.read"),courseManager("wallet.read")]));
 expect(m.staff).toHaveBeenCalledOnce();expect(m.staff).toHaveBeenCalledWith({where:{id:"st",userId:"u",storeId:"s",status:"ACTIVE",user:{status:"ACTIVE"}},select:{id:true}});
 expect(m.permission).toHaveBeenCalledTimes(3);expect(m.module).toHaveBeenCalledTimes(3);expect(m.writeStore).toHaveBeenCalledTimes(3);
 m.staff.mockResolvedValue(null);await expect(withReadRequestMemo(()=>courseManager("booking.read"))).rejects.toThrow("工作權限已停用");expect(m.staff).toHaveBeenCalledTimes(2);
});
it("does not merge membership checks in ordinary writes or across actor/store keys",async()=>{
 await courseManager("booking.read");await courseManager("wallet.read");expect(m.staff).toHaveBeenCalledTimes(2);
 m.staff.mockClear();m.writeStore.mockResolvedValueOnce("other").mockResolvedValue("s");
 await withReadRequestMemo(()=>Promise.all([courseManager("booking.read"),courseManager("wallet.read")]));expect(m.staff).toHaveBeenCalledTimes(2);
 m.staff.mockClear();m.permission.mockResolvedValueOnce({id:"other",staffId:"st",role:"OWNER"});
 await withReadRequestMemo(()=>Promise.all([courseManager("booking.read"),courseManager("wallet.read")]));expect(m.staff).toHaveBeenCalledTimes(2);
});
it("retains a membership read denial within a request and rechecks the next one",async()=>{
 m.staff.mockRejectedValueOnce(new Error("membership unavailable"));
 const denied=await withReadRequestMemo(()=>Promise.allSettled([courseManager("booking.read"),courseManager("wallet.read")]));
 expect(denied.every(x=>x.status==="rejected")).toBe(true);expect(m.staff).toHaveBeenCalledOnce();expect(m.permission).toHaveBeenCalledTimes(2);
 await expect(withReadRequestMemo(()=>courseManager("booking.read"))).resolves.toMatchObject({storeId:"s"});expect(m.staff).toHaveBeenCalledTimes(2);
});

import {rememberVerifiedStaffRead} from '@/server/services/read-request-memo';
it('uses the current auth membership only for its exact actor/store read and rechecks the next request',async()=>{
 await withReadRequestMemo(async()=>{rememberVerifiedStaffRead({userId:'u',role:'OWNER',staffId:'st',storeId:'s',industryModule:'COURSE'});await Promise.all([courseManager('booking.read'),courseManager('wallet.read')]);});
 expect(m.staff).not.toHaveBeenCalled();expect(m.permission).toHaveBeenCalledTimes(2);expect(m.module).toHaveBeenCalledTimes(2);expect(m.writeStore).toHaveBeenCalledTimes(2);
 m.staff.mockResolvedValueOnce(null);await expect(withReadRequestMemo(()=>courseManager('booking.read'))).rejects.toThrow('工作權限已停用');expect(m.staff).toHaveBeenCalledOnce();
});
it.each([{userId:'another'},{role:'STAFF'},{staffId:'another'},{storeId:'another'}])('does not use auth membership from a different actor/store: %j',async mismatch=>{
 await withReadRequestMemo(async()=>{rememberVerifiedStaffRead({userId:'u',role:'OWNER',staffId:'st',storeId:'s',industryModule:'COURSE',...mismatch});await courseManager('booking.read');});expect(m.staff).toHaveBeenCalledOnce();
});

it('shares exact fresh auth membership with the read counterpart while retaining independent grants',async()=>{
 await withReadRequestMemo(async()=>{rememberVerifiedStaffRead({userId:'u',role:'OWNER',staffId:'st',storeId:'s',industryModule:'COURSE'});await courseManagerRead('booking.read');await courseManager('wallet.read');});expect(m.staff).not.toHaveBeenCalled();expect(m.permission).toHaveBeenCalledTimes(2);expect(m.module).toHaveBeenCalledTimes(2);
 m.staff.mockResolvedValueOnce(null);await expect(withReadRequestMemo(()=>courseManagerRead('booking.read'))).rejects.toThrow('工作權限已停用');expect(m.staff).toHaveBeenCalledOnce();
});
