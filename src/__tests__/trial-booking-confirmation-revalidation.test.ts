import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  confirmTrialBooking: vi.fn(),
  revalidateBookings: vi.fn(),
}));

vi.mock("@/server/services/trial-booking-self-service", () => ({
  confirmTrialBooking: h.confirmTrialBooking,
  cancelTrialBooking: vi.fn(),
  listTrialRescheduleSlots: vi.fn(),
  rescheduleTrialBooking: vi.fn(),
}));

vi.mock("@/lib/revalidation", () => ({
  revalidateBookings: h.revalidateBookings,
}));

import { confirmTrialBookingFromChat } from "@/server/actions/trial-booking-self-service";

describe("trial booking confirmation cache revalidation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("invalidates the staff booking summary immediately after a new confirmation", async () => {
    h.confirmTrialBooking.mockResolvedValue("confirmed");

    await expect(confirmTrialBookingFromChat("a".repeat(20))).resolves.toBe("confirmed");

    expect(h.revalidateBookings).toHaveBeenCalledTimes(1);
  });

  it.each(["already_confirmed", "unavailable"] as const)(
    "does not invalidate when confirmation returns %s",
    async result => {
      h.confirmTrialBooking.mockResolvedValue(result);

      await expect(confirmTrialBookingFromChat("a".repeat(20))).resolves.toBe(result);

      expect(h.revalidateBookings).not.toHaveBeenCalled();
    },
  );
});
