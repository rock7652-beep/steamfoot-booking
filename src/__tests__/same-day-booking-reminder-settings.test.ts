vi.mock("@/lib/industry-module-server",()=>({getStoreIndustryModule:async()=>"steamfoot"}));
import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ permission: vi.fn(), store: vi.fn(), find: vi.fn(), update: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ requirePermission: h.permission }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: h.store }));
vi.mock("@/lib/db", () => ({ prisma: { storeLineNotificationRecipient: { findFirst: h.find, updateMany: h.update } } }));
vi.mock("@/lib/line-config", () => ({ getLineConfigForStore: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidate }));
import { setSameDayBookingReminder } from "@/server/actions/store-line-notification-recipients";
describe("same-day reminder settings", () => {
  beforeEach(() => {
    vi.clearAllMocks(); h.permission.mockResolvedValue({ id: "manager" }); h.store.mockResolvedValue("store-a");
    h.find.mockResolvedValue({ lineUserId: "line-a", isActive: true }); h.update.mockResolvedValue({ count: 1 });
  });
  it("checks permission and updates only the selected store recipient preference", async () => {
    expect((await setSameDayBookingReminder("recipient-a", true)).success).toBe(true);
    expect(h.permission).toHaveBeenCalledWith("business_hours.manage");
    expect(h.find).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "recipient-a", storeId: "store-a" } }));
    expect(h.update).toHaveBeenCalledWith({ where: { id: "recipient-a", storeId: "store-a" }, data: { sameDayBookingEnabled: true } });
    expect(h.revalidate).toHaveBeenCalledWith("/dashboard/reminders");
  });
  it("rejects another store's recipient", async () => {
    h.find.mockResolvedValue(null);
    expect((await setSameDayBookingReminder("other-store", true)).success).toBe(false);
    expect(h.update).not.toHaveBeenCalled();
  });
  it.each([{ lineUserId: null, isActive: true }, { lineUserId: "line-a", isActive: false }])("rejects enabling an unbound or paused recipient", async (recipient) => {
    h.find.mockResolvedValue(recipient);
    expect((await setSameDayBookingReminder("recipient-a", true)).success).toBe(false);
    expect(h.update).not.toHaveBeenCalled();
  });
  it("allows disabling the preference even for a paused recipient", async () => {
    h.find.mockResolvedValue({ lineUserId: "line-a", isActive: false });
    expect((await setSameDayBookingReminder("recipient-a", false)).success).toBe(true);
  });
});
