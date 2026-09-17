import { beforeEach, describe, expect, it, vi } from "vitest";
const course = vi.hoisted(()=>({industry:vi.fn(),manager:vi.fn(),feature:vi.fn()}));
vi.mock("@/lib/industry-module-server",()=>({getStoreIndustryModule:course.industry}));
vi.mock("@/server/services/course-access",()=>({courseManager:course.manager}));
vi.mock("@/lib/feature-gate",()=>({requireStoreFeature:course.feature}));
const h = vi.hoisted(() => ({ permission: vi.fn(), store: vi.fn(), find: vi.fn(), update: vi.fn(), lock: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requirePermission: h.permission }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: h.store }));
vi.mock("@/lib/line-config", () => ({ getLineConfigForStore: vi.fn() }));
vi.mock("@/server/services/manager-notification-delivery", () => ({ migrateManagerRecipients: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidate }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({ $queryRaw: h.lock, storeLineNotificationRecipient: { findFirst: h.find, update: h.update } }) } }));
import { setManagerNotificationPreference } from "@/server/actions/store-line-notification-recipients";
describe("manager notification preference writes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    course.industry.mockResolvedValue("steamfoot");
    course.manager.mockResolvedValue({storeId:"store-a"});
    h.permission.mockResolvedValue({ id: "manager" }); h.store.mockResolvedValue("store-a");
    h.find.mockResolvedValue({ lineUserId: "line-a", isActive: true, sameDayBookingEnabled: true, preferences: { lead: false, payment: false } });
  });
  it("locks the selected store row and preserves unrelated preferences", async () => {
    expect(await setManagerNotificationPreference("recipient-a", "trial", false)).toMatchObject({ success: true });
    expect(h.permission).toHaveBeenCalledWith("business_hours.manage");
    expect(h.lock.mock.calls[0].slice(1)).toEqual(["recipient-a", "store-a"]);
    expect(h.find).toHaveBeenCalledWith({ where: { id: "recipient-a", storeId: "store-a" } });
    expect(h.update).toHaveBeenCalledWith({ where: { id: "recipient-a" }, data: { preferences: expect.objectContaining({ trial: false, lead: false, payment: false, sameDay: true }) } });
  });
  it("course writes require the fixed active manager scope and store feature", async () => {
    course.industry.mockResolvedValue("course");
    course.manager.mockResolvedValue({storeId:"other-store"});
    expect(await setManagerNotificationPreference("recipient-a","payment",true)).toMatchObject({success:false});
    expect(h.update).not.toHaveBeenCalled();
    course.manager.mockResolvedValue({storeId:"store-a"});
    course.feature.mockRejectedValue(new Error("disabled"));
    expect(await setManagerNotificationPreference("recipient-a","payment",true)).toMatchObject({success:false});
    expect(h.update).not.toHaveBeenCalled();
  });
  it("updates the existing same-day column for backward compatibility", async () => {
    await setManagerNotificationPreference("recipient-a", "sameDay", false);
    expect(h.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sameDayBookingEnabled: false }) }));
  });
  it("cannot change another store's recipient", async () => {
    h.find.mockResolvedValue(null);
    expect(await setManagerNotificationPreference("other-store", "trial", false)).toMatchObject({ success: false });
    expect(h.update).not.toHaveBeenCalled();
  });
  it.each(["unknown", "__proto__", "isActive"])("rejects invalid preference %s", async key => {
    expect(await setManagerNotificationPreference("recipient-a", key, true)).toMatchObject({ success: false });
    expect(h.update).not.toHaveBeenCalled();
  });
  it("rejects changes when permission is denied", async () => {
    h.permission.mockRejectedValue(new Error("Forbidden"));
    expect(await setManagerNotificationPreference("recipient-a", "trial", true)).toMatchObject({ success: false });
    expect(h.update).not.toHaveBeenCalled();
  });
  it.each([{ isActive: false, lineUserId: "line-a" }, { isActive: true, lineUserId: null }])("cannot enable a preference for a paused or unbound recipient", async row => {
    h.find.mockResolvedValue(row);
    expect(await setManagerNotificationPreference("recipient-a", "trial", true)).toMatchObject({ success: false });
    expect(h.update).not.toHaveBeenCalled();
  });
});
