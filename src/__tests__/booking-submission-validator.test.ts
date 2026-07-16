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
        version: 1,
        result: { bookingIds: ["booking-a"], recurrenceGroupId: null },
      }),
    ).toEqual({
      version: 1,
      result: { bookingIds: ["booking-a"], recurrenceGroupId: null },
    });
    expect(() =>
      parseBookingSubmissionResponseSnapshot(1, {
        version: 2,
        result: { bookingIds: ["booking-a"], recurrenceGroupId: null },
      }),
    ).toThrow("response schema version mismatch");
    expect(() =>
      parseBookingSubmissionResponseSnapshot(2, {
        version: 2,
        result: { bookingIds: ["booking-a"], recurrenceGroupId: null },
      }),
    ).toThrow("Unsupported booking submission response schema version");
    expect(() =>
      parseBookingSubmissionResponseSnapshot(1, {
        version: 1,
        result: { bookingIds: [], recurrenceGroupId: null },
      }),
    ).toThrow();
  });

  it.each([
    { version: 1 },
    { version: 1, result: { bookingIds: [1], recurrenceGroupId: null } },
    { version: 1, result: { bookingIds: ["booking-a"], recurrenceGroupId: 1 } },
  ])("rejects malformed snapshots", (snapshot) => {
    expect(() => parseBookingSubmissionResponseSnapshot(1, snapshot)).toThrow();
  });

  it("accepts a future recurring-shaped v1 result without creating it", () => {
    expect(
      parseBookingSubmissionResponseSnapshot(1, {
        version: 1,
        result: {
          bookingIds: ["booking-a", "booking-b"],
          recurrenceGroupId: "group-a",
        },
      }),
    ).toEqual({
      version: 1,
      result: {
        bookingIds: ["booking-a", "booking-b"],
        recurrenceGroupId: "group-a",
      },
    });
  });
});
