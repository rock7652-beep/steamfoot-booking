import { afterEach, describe, expect, it } from "vitest";
import {
  createTrialBookingActionToken,
  verifyTrialBookingActionToken,
  isTrialRescheduleTargetAllowed,
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

describe("trial booking reschedule target safety", () => {
  const now = new Date("2026-08-11T02:00:00.000Z"); // 10:00 Asia/Taipei

  it("rejects elapsed and targets inside the twelve-hour cutoff", () => {
    expect(isTrialRescheduleTargetAllowed("2026-08-11", "09:30", now)).toBe(false);
    expect(isTrialRescheduleTargetAllowed("2026-08-11", "21:59", now)).toBe(false);
  });

  it("accepts a valid target at twelve hours or later and rejects malformed input", () => {
    expect(isTrialRescheduleTargetAllowed("2026-08-11", "22:00", now)).toBe(true);
    expect(isTrialRescheduleTargetAllowed("2026-08-12", "09:00", now)).toBe(true);
    expect(isTrialRescheduleTargetAllowed("bad-date", "22:30", now)).toBe(false);
    expect(isTrialRescheduleTargetAllowed("2026-99-99", "22:30", now)).toBe(false);
    expect(isTrialRescheduleTargetAllowed("9999-99-99", "22:30", now)).toBe(false);
    expect(isTrialRescheduleTargetAllowed("2026-08-11", "bad-time", now)).toBe(false);
    expect(isTrialRescheduleTargetAllowed("2026-02-31", "12:30", now)).toBe(false);
    expect(isTrialRescheduleTargetAllowed("2026-08-11", "24:00", now)).toBe(false);
    expect(isTrialRescheduleTargetAllowed("2026-08-11", "12:60", now)).toBe(false);
  });
});
