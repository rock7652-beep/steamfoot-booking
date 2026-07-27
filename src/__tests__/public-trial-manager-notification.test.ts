import { beforeEach, describe, expect, it, vi } from "vitest";

const { notifyStoreManagerOnLine } = vi.hoisted(() => ({
  notifyStoreManagerOnLine: vi.fn(),
}));

vi.mock("@/server/services/store-manager-line-notifications", () => ({
  notifyStoreManagerOnLine,
}));

import { notifyManagerOfPublicTrialBooking } from "@/server/services/public-trial-manager-notification";

describe("notifyManagerOfPublicTrialBooking", () => {
  beforeEach(() => {
    notifyStoreManagerOnLine.mockReset();
    notifyStoreManagerOnLine.mockResolvedValue({ status: "sent" });
  });

  it("maps a committed booking to the stable manager notification contract", async () => {
    await notifyManagerOfPublicTrialBooking({
      storeId: "store-1",
      storeSlug: "zhubei",
      bookingId: "booking-1",
      customerName: "王小美",
      phone: "0912345678",
      bookingDate: "2026-07-30",
      slotTime: "14:00",
      people: 2,
      expectedAmount: 998,
    });

    expect(notifyStoreManagerOnLine).toHaveBeenCalledWith({
      type: "PUBLIC_TRIAL_BOOKING_CREATED",
      eventKey: "public-trial-booking:booking-1",
      storeId: "store-1",
      storeSlug: "zhubei",
      customerName: "王小美",
      phone: "0912345678",
      bookingId: "booking-1",
      bookingDate: "2026-07-30",
      slotTime: "14:00",
      people: 2,
      expectedAmount: 998,
    });
  });

  it("does not throw when LINE delivery reports failure", async () => {
    notifyStoreManagerOnLine.mockResolvedValue({ status: "failed", error: "LINE API 500" });

    await expect(notifyManagerOfPublicTrialBooking({
      storeId: "store-1",
      storeSlug: "zhubei",
      bookingId: "booking-2",
      customerName: "陳小姐",
      phone: "0987654321",
      bookingDate: "2026-07-31",
      slotTime: "10:00",
      people: 1,
      expectedAmount: 499,
    })).resolves.toBeUndefined();
  });
});
