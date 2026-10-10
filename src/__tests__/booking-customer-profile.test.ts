import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ customer: vi.fn(), bookings: vi.fn() }));
vi.mock("@/server/actions/customer", () => ({ getCustomerDrawerDetailAction: m.customer }));
vi.mock("@/lib/db", () => ({ prisma: { booking: { findMany: m.bookings } } }));
import { getBookingCustomerProfile } from "@/server/actions/booking-customer-profile";
beforeEach(() => { vi.resetAllMocks(); });
describe("booking person profile read boundary", () => {
  it("does not read history when customer permissions or identity validation fails", async () => {
    m.customer.mockResolvedValue({ success: false, error: "無權限" });
    expect(await getBookingCustomerProfile("other")).toEqual({ success: false, error: "無權限" });
    expect(m.bookings).not.toHaveBeenCalled();
  });
  it("uses the verified customer and store, and returns only profile fields and bounded history", async () => {
    m.customer.mockResolvedValue({ success: true, data: { id: "guest", storeId: "verified-store", name: "朋友", phone: "0900000000", serviceNote: null, planWallets: [{ id: "private-wallet" }] } });
    m.bookings.mockResolvedValue([{ id: "booking", bookingDate: new Date("2026-10-10T00:00:00Z"), slotTime: "15:30", bookingStatus: "COMPLETED", bookingType: "FIRST_TRIAL" }]);
    const result = await getBookingCustomerProfile("guest");
    expect(m.bookings).toHaveBeenCalledWith(expect.objectContaining({ where: { customerId: "guest", storeId: "verified-store" }, take: 10 }));
    expect(result).toEqual({ success: true, data: { id: "guest", name: "朋友", phone: "0900000000", serviceNote: null, bookings: [{ id: "booking", bookingDate: "2026-10-10", slotTime: "15:30", bookingStatus: "COMPLETED", bookingType: "FIRST_TRIAL" }] } });
  });
});
