import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  cancelTrialBooking: vi.fn(),
  confirmTrialBooking: vi.fn(),
  rescheduleTrialBooking: vi.fn(),
  revalidateBookings: vi.fn(),
}));

vi.mock("@/server/services/trial-booking-self-service", () => ({
  confirmTrialBooking: h.confirmTrialBooking,
  cancelTrialBooking: h.cancelTrialBooking,
  listTrialRescheduleSlots: vi.fn(),
  rescheduleTrialBooking: h.rescheduleTrialBooking,
}));

vi.mock("@/lib/revalidation", () => ({
  revalidateBookings: h.revalidateBookings,
}));

import {
  cancelTrialBookingFromChat,
  confirmTrialBookingFromChat,
  rescheduleTrialBookingFromChat,
} from "@/server/actions/trial-booking-self-service";

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

describe("trial booking cancellation cache revalidation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("invalidates the staff booking summary immediately after cancellation", async () => {
    h.cancelTrialBooking.mockResolvedValue("cancelled");

    await expect(cancelTrialBookingFromChat("a".repeat(20))).resolves.toBe("cancelled");

    expect(h.revalidateBookings).toHaveBeenCalledTimes(1);
  });

  it.each(["already_cancelled", "unavailable"] as const)(
    "does not invalidate when cancellation returns %s",
    async result => {
      h.cancelTrialBooking.mockResolvedValue(result);

      await expect(cancelTrialBookingFromChat("a".repeat(20))).resolves.toBe(result);

      expect(h.revalidateBookings).not.toHaveBeenCalled();
    },
  );
});

describe("trial booking reschedule cache revalidation", () => {
  beforeEach(() => vi.clearAllMocks());

  const input = { token: "a".repeat(20), date: "2026-08-12", slotTime: "10:00" };

  it("invalidates the staff booking summary immediately after rescheduling", async () => {
    h.rescheduleTrialBooking.mockResolvedValue("rescheduled");

    await expect(rescheduleTrialBookingFromChat(input)).resolves.toBe("rescheduled");

    expect(h.revalidateBookings).toHaveBeenCalledTimes(1);
  });

  it.each(["slot_full", "unavailable"] as const)(
    "does not invalidate when rescheduling returns %s",
    async result => {
      h.rescheduleTrialBooking.mockResolvedValue(result);

      await expect(rescheduleTrialBookingFromChat(input)).resolves.toBe(result);

      expect(h.revalidateBookings).not.toHaveBeenCalled();
    },
  );
});
