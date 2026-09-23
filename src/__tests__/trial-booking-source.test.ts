import { describe, expect, it } from "vitest";
import { normalizeTrialBookingSource } from "@/lib/trial-booking-source";

describe("trial booking link attribution", () => {
  it.each([
    ["line", "LINE"],
    ["messenger", "MESSENGER"],
    ["google_maps", "GOOGLE_MAPS"],
    ["instagram", "INSTAGRAM"],
    ["ig", "INSTAGRAM"],
    ["other", "OTHER"],
  ])("accepts the explicit %s link", (input, expected) => {
    expect(normalizeTrialBookingSource(input)).toBe(expected);
  });

  it.each([undefined, "", "google", "LINE-login", "facebook", "other"])(
    "does not guess unsupported or missing sources: %s",
    (input) => {
      expect(normalizeTrialBookingSource(input)).toBeNull();
    },
  );
});
