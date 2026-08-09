import { afterEach, describe, expect, it } from "vitest";
import {
  createTrialBookingActionToken,
  verifyTrialBookingActionToken,
} from "@/server/services/trial-booking-self-service";

const originalSecret = process.env.TRIAL_BOOKING_ACTION_SECRET;
afterEach(() => { process.env.TRIAL_BOOKING_ACTION_SECRET = originalSecret; });

describe("trial booking self-service action token", () => {
  it("binds a token to its booking and store without exposing customer information", () => {
    process.env.TRIAL_BOOKING_ACTION_SECRET = "test-only-secret";
    const token = createTrialBookingActionToken({ id: "booking_1", storeId: "store_1" }, new Date("2026-08-09T10:00:00.000Z"));
    expect(token).not.toContain("line");
    expect(verifyTrialBookingActionToken(token, new Date("2026-08-10T10:00:00.000Z"))).toEqual({ bookingId: "booking_1", storeId: "store_1" });
  });

  it("rejects tampering, expiry, and a missing signing secret", () => {
    process.env.TRIAL_BOOKING_ACTION_SECRET = "test-only-secret";
    const token = createTrialBookingActionToken({ id: "booking_1", storeId: "store_1" }, new Date("2026-08-09T10:00:00.000Z"));
    expect(verifyTrialBookingActionToken(`${token}x`, new Date("2026-08-10T10:00:00.000Z"))).toBeNull();
    expect(verifyTrialBookingActionToken(token, new Date("2026-08-17T10:00:00.000Z"))).toBeNull();
    delete process.env.TRIAL_BOOKING_ACTION_SECRET;
    expect(verifyTrialBookingActionToken(token, new Date("2026-08-10T10:00:00.000Z"))).toBeNull();
  });
});
