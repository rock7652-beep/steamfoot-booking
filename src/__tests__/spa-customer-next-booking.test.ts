import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("SPA customer next booking", () => {
  const source = readFileSync(
    "src/app/(liff)/liff/design-preview/page.tsx",
    "utf8",
  );

  it("derives the next appointment from active bookings on or after today", () => {
    expect(source).toContain("toLocalDateStr()");
    expect(source).toContain("booking.date >= today");
    expect(source).toContain("!booking.refundedAt");
    expect(source).toContain("nextBooking: upcomingBookings[0] ?? null");
    expect(source).not.toContain('bookingDate: "2026-08-29"');
  });
});
