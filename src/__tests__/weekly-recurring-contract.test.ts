import { describe, expect, it } from "vitest";
import { createRecurringBookingsSchema } from "@/lib/validators/booking";
import { buildBookingRecurringPayloadHash } from "@/server/services/booking-submission-payload";

const base = {
  customerId: "customer",
  bookingDate: "2026-08-05",
  slotTime: "10:00",
  bookingType: "PACKAGE_SESSION" as const,
  servicePlanId: "plan",
  people: 2,
  weeks: 8,
};

describe("weekly recurring booking contract", () => {
  it("accepts only PACKAGE_SESSION and enforces the 12-week hard limit", () => {
    expect(createRecurringBookingsSchema.parse(base).weeks).toBe(8);
    expect(() => createRecurringBookingsSchema.parse({ ...base, bookingType: "SINGLE" })).toThrow();
    expect(() => createRecurringBookingsSchema.parse({ ...base, weeks: 13 })).toThrow();
  });

  it("hashes the full canonical recurring intent", () => {
    const input = {
      storeId: "store", actorUserId: "actor", canonicalCustomerId: "customer",
      servicePlanId: "plan", bookingDate: "2026-08-05", slotTime: "10:00",
      people: 2, weeks: 8,
    };
    const first = buildBookingRecurringPayloadHash(input).payloadHash;
    expect(buildBookingRecurringPayloadHash({ ...input, notes: "  " }).payloadHash).toBe(first);
    expect(buildBookingRecurringPayloadHash({ ...input, weeks: 5 }).payloadHash).not.toBe(first);
    expect(buildBookingRecurringPayloadHash({ ...input, customerPlanWalletId: "wallet" }).payloadHash).not.toBe(first);
  });
});
