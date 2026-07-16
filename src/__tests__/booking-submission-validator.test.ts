import { describe, expect, it } from "vitest";
import { bookingSubmissionRequestKeySchema } from "@/lib/validators/booking-submission";
import { parseBookingSubmissionResponseSnapshot } from "@/server/services/booking-submission";

describe("booking submission contracts", () => {
  it.each([
    "0123456789abcdef",
    "web_0123456789abcdef",
    "LIFF-0123456789abcdef",
  ])("accepts a safe request key: %s", (key) => {
    expect(bookingSubmissionRequestKeySchema.parse(key)).toBe(key);
  });

  it.each([
    "short",
    "contains space 123456",
    "contains/slash/123456",
    "x".repeat(129),
  ])("rejects an unsafe request key", (key) => {
    expect(() => bookingSubmissionRequestKeySchema.parse(key)).toThrow();
  });

  it("validates the versioned response snapshot", () => {
    expect(
      parseBookingSubmissionResponseSnapshot(1, {
        bookingIds: ["booking-a"],
        recurrenceGroupId: null,
      }),
    ).toEqual({ bookingIds: ["booking-a"], recurrenceGroupId: null });
    expect(() =>
      parseBookingSubmissionResponseSnapshot(2, {
        bookingIds: ["booking-a"],
        recurrenceGroupId: null,
      }),
    ).toThrow("Unsupported booking submission response version");
    expect(() =>
      parseBookingSubmissionResponseSnapshot(1, {
        bookingIds: [],
        recurrenceGroupId: null,
      }),
    ).toThrow();
  });
});
