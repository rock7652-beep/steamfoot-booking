import { describe, expect, it } from "vitest";
import {
  bookingPlanBadge,
  effectiveWalletStatusOnDate,
  isWalletUsableForServiceDate,
  linkedWalletRemainingForBooking,
} from "../wallet-booking-integrity";

const serviceDate = new Date("2026-09-05T00:00:00.000Z");

describe("wallet booking integrity", () => {
  it("shows the remaining balance from the booking-linked wallet regardless of plan category", () => {
    expect(
      linkedWalletRemainingForBooking("PACKAGE_SESSION", serviceDate, {
        status: "ACTIVE",
        remainingSessions: 10,
        expiryDate: new Date("2026-12-23T00:00:00.000Z"),
      }),
    ).toBe(10);
  });

  it("rejects inactive, insufficient, and expired wallets", () => {
    expect(isWalletUsableForServiceDate({ status: "EXPIRED", remainingSessions: 10, expiryDate: null }, serviceDate)).toBe(false);
    expect(isWalletUsableForServiceDate({ status: "ACTIVE", remainingSessions: 0, expiryDate: null }, serviceDate)).toBe(false);
    expect(isWalletUsableForServiceDate({ status: "ACTIVE", remainingSessions: 10, expiryDate: new Date("2026-08-31T00:00:00.000Z") }, serviceDate)).toBe(false);
  });

  it("keeps the expiry date usable and derives past ACTIVE wallets as EXPIRED", () => {
    expect(isWalletUsableForServiceDate({ status: "ACTIVE", remainingSessions: 1, expiryDate: serviceDate }, serviceDate)).toBe(true);
    expect(effectiveWalletStatusOnDate("ACTIVE", new Date("2026-08-31T00:00:00.000Z"), "2026-09-02")).toBe("EXPIRED");
    expect(effectiveWalletStatusOnDate("ACTIVE", serviceDate, "2026-09-02")).toBe("ACTIVE");
  });

  it("does not show plan warnings on trial or single bookings", () => {
    expect(bookingPlanBadge({ bookingType: "FIRST_TRIAL", bookingStatus: "COMPLETED", collected: true, linkedWalletRemaining: 0 })).toEqual({ kind: "none" });
    expect(bookingPlanBadge({ bookingType: "SINGLE", bookingStatus: "COMPLETED", collected: true, linkedWalletRemaining: 0 })).toEqual({ kind: "none" });
  });

  it("does not show plan warnings on makeup bookings", () => {
    expect(bookingPlanBadge({
      bookingType: "PACKAGE_SESSION",
      bookingStatus: "COMPLETED",
      collected: false,
      linkedWalletRemaining: 0,
      isMakeup: true,
    })).toEqual({ kind: "none" });
  });

  it("shows completed package history as deducted instead of no valid plan", () => {
    expect(bookingPlanBadge({ bookingType: "PACKAGE_SESSION", bookingStatus: "COMPLETED", collected: true, linkedWalletRemaining: 0 })).toEqual({ kind: "deducted" });
  });

  it("only warns about missing plans on upcoming package bookings", () => {
    expect(bookingPlanBadge({ bookingType: "PACKAGE_SESSION", bookingStatus: "PENDING", collected: false, linkedWalletRemaining: 0 })).toEqual({ kind: "needs_review" });
    expect(bookingPlanBadge({ bookingType: "PACKAGE_SESSION", bookingStatus: "PENDING", collected: false, linkedWalletRemaining: 8 })).toEqual({ kind: "remaining", sessions: 8 });
  });
});
