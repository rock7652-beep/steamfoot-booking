import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const m = vi.hoisted(() => ({ manager: vi.fn(), transaction: vi.fn(), read: vi.fn(), write: vi.fn(), audit: vi.fn(), writable: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/server/services/course-access", () => ({ courseManager: m.manager, courseTransaction: m.transaction }));
vi.mock("@/server/services/operation-audit-outbox", () => ({ enqueueOperationAudit: m.audit }));
vi.mock("@/lib/subscription-guard", () => ({ assertStoreSubscriptionWritable: m.writable }));
vi.mock("@/lib/revalidation", () => ({ revalidateShopConfig: vi.fn() }));
vi.mock("@/server/actions/shop", () => ({ updateShopBankInfo: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
import { AppError } from "@/lib/errors";
import { saveCourseSelfBookingSettings, saveCourseSettingsSection } from "@/server/actions/course-settings";
const tx = { courseBookingRule: { findUnique: m.read, upsert: m.write } };
beforeEach(() => {
  vi.resetAllMocks();
  m.manager.mockResolvedValue({ user: { id: "owner", name: "店長" }, storeId: "course-a" });
  m.transaction.mockImplementation(async (_id, work) => work(tx));
  m.read.mockResolvedValue(null);
  m.write.mockResolvedValue({selfBookingRevision:1});
});
describe("course student self-booking setting", () => {
  it("checks permission and subscription, then writes only the chosen store flag under the shared lock", async () => {
    expect(await saveCourseSelfBookingSettings({ enabled: false })).toEqual({ success: true, enabled: false, revision: 1 });
    expect(m.manager).toHaveBeenCalledExactlyOnceWith("business_hours.manage");
    expect(m.writable).toHaveBeenCalledExactlyOnceWith("course-a");
    expect(m.transaction).toHaveBeenCalledExactlyOnceWith("course-a", expect.any(Function));
    expect(m.read).toHaveBeenCalledWith({ where: { storeId: "course-a" } });
    expect(m.write).toHaveBeenCalledExactlyOnceWith({ where: { storeId: "course-a" }, create: { storeId: "course-a", selfBookingEnabled: false, selfBookingRevision: 1 }, update: { selfBookingEnabled: false, selfBookingRevision: { increment: 1 } }, select: { selfBookingRevision: true } });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({storeId:"course-a",before:{selfBookingEnabled:true},after:{selfBookingEnabled:false}}),tx);
    expect(m.revalidate).toHaveBeenCalledWith("/dashboard", "layout");
    expect(m.revalidate).toHaveBeenCalledWith("/book");
  });
  it("re-enables without changing cutoffs or restoring/deleting queue entries", async () => {
    m.read.mockResolvedValue({ selfBookingEnabled: false, bookingLeadMinutes: 30, cancellationLeadMinutes: 120 });
    expect(await saveCourseSelfBookingSettings({ enabled: true })).toEqual({ success: true, enabled: true, revision: 1 });
    expect(m.write.mock.calls[0][0].update).toEqual({ selfBookingEnabled: true, selfBookingRevision: {increment:1} });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({before:{selfBookingEnabled:false},after:{selfBookingEnabled:true}}),tx);
  });
  it.each([null,{selfBookingEnabled:true}])("treats repeated enable / missing legacy rules as a no-op: %j", async before => {
    m.read.mockResolvedValue(before);
    expect(await saveCourseSelfBookingSettings({enabled:true})).toEqual({success:true,enabled:true,revision:0});
    expect(m.write).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();
  });
  it("does not let an unrelated cutoff edit re-enable a disabled store",async()=>{
    m.read.mockResolvedValue({selfBookingEnabled:false});
    expect(await saveCourseSettingsSection({section:"booking",bookingLeadMinutes:0,cancellationLeadMinutes:0})).toMatchObject({success:true});
    expect(m.write.mock.calls[0][0].update).toEqual({bookingLeadMinutes:0,cancellationLeadMinutes:0});
  });
  it.each([{}, {enabled:"false"}, {enabled:0}, {enabled:null}, {enabled:false,storeId:"other"}, {enabled:false,bookingLeadMinutes:0}])("rejects invalid and scope-overriding requests: %j",async input=>{
    expect(await saveCourseSelfBookingSettings(input)).toMatchObject({success:false});
    expect(m.transaction).not.toHaveBeenCalled();expect(m.write).not.toHaveBeenCalled();
  });
  it.each(["no permission", "view-only parent store", "non-course store", "inactive staff"])("retains the existing manager access guard: %s",async reason=>{
    m.manager.mockRejectedValue(new AppError("FORBIDDEN",reason));
    expect(await saveCourseSelfBookingSettings({enabled:false})).toMatchObject({success:false,error:reason});
    expect(m.transaction).not.toHaveBeenCalled();expect(m.write).not.toHaveBeenCalled();
  });
  it("does not write when the subscription is read-only",async()=>{
    m.writable.mockRejectedValue(new AppError("FORBIDDEN","已到期"));
    expect(await saveCourseSelfBookingSettings({enabled:false})).toMatchObject({success:false,error:"已到期"});
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it("propagates an audit failure out of the business transaction",async()=>{
    m.audit.mockRejectedValue(new AppError("CONFLICT","audit failed"));
    expect(await saveCourseSelfBookingSettings({enabled:false})).toMatchObject({success:false,error:"audit failed"});
    expect(m.revalidate).not.toHaveBeenCalled();
  });
  it("does not add the switch to generic member auth or purchase/teacher APIs",()=>{
    for(const file of ["src/server/services/course-access.ts", "src/server/actions/course-portal.ts"]){
      expect(readFileSync(file,"utf8")).not.toContain("assertCourseSelfBookingEnabled");
    }
    const manual=readFileSync("src/server/actions/course-waitlist.ts","utf8");
    expect(manual).toContain('await courseManager("booking.update")');
    expect(manual).toContain("{ ignoreCutoff: true, manual: true }");
  });
});

it("returns the authoritative revision for repeated no-op saves without incrementing it",async()=>{
  m.read.mockResolvedValue({selfBookingEnabled:false,selfBookingRevision:7});
  expect(await saveCourseSelfBookingSettings({enabled:false})).toEqual({success:true,enabled:false,revision:7});
  expect(m.write).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();
});
