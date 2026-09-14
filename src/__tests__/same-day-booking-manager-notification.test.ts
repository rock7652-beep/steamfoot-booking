import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ booking: vi.fn(), deliver: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {
  booking: { findFirst: mocks.booking },
} }));
vi.mock("@/server/services/manager-notification-delivery", () => ({ deliverManagerNotification: mocks.deliver }));
vi.mock("@/lib/base-url", () => ({ deriveBaseUrl: () => "https://www.steamfoot.com" }));
import { notifySameDayBookingManagers } from "@/server/services/same-day-booking-manager-notification";
const booking = () => ({ bookingDate: new Date("2026-09-15T00:00:00Z"), createdAt: new Date("2026-09-14T16:05:00Z"),
  slotTime: "09:30", people: 2, bookingStatus: "PENDING", customer: { name: "測試顧客" },
  store: { name: "測試店", slug: "test-store", industryModule: "STEAMFOOT" } });
describe("same-day manager notification", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-14T16:10:00Z"));
    mocks.booking.mockResolvedValue(booking());
    mocks.deliver.mockResolvedValue({ status: "sent", sentCount: 1, failedCount: 0 });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  it("uses Taiwan midnight and the booking store, with explicit opt-in", async () => {
    await notifySameDayBookingManagers("store-a", "booking-a");
    expect(mocks.booking).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "booking-a", storeId: "store-a" } }));
    expect(mocks.deliver).toHaveBeenCalledWith({ storeId: "store-a", eventKey: "booking-created:booking-a", type: "SAME_DAY_BOOKING_CREATED", messages: [{ type: "text", text: expect.stringContaining("/s/test-store/admin/dashboard/bookings?bookingId=booking-a") }] });
  });
  it.each([
    { bookingDate: new Date("2026-09-16T00:00:00Z") },
    { createdAt: new Date("2026-09-14T15:59:00Z") },
    { bookingStatus: "CANCELLED" },
    { store: { ...booking().store, industryModule: "SPA" } },
  ])("skips other dates, old bookings, cancellation and SPA: %j", async (changes) => {
    mocks.booking.mockResolvedValue({ ...booking(), ...changes });
    await notifySameDayBookingManagers("store-a", "booking-a");
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it("delivery failure cannot fail the booking response", async () => {
    mocks.deliver.mockRejectedValue(new Error("unavailable"));
    await expect(notifySameDayBookingManagers("store-a", "booking-a")).resolves.toBeUndefined();
  });
  it("database failure cannot fail the booking response", async () => {
    mocks.booking.mockRejectedValue(new Error("unavailable"));
    await expect(notifySameDayBookingManagers("store-a", "booking-a")).resolves.toBeUndefined();
  });
});
