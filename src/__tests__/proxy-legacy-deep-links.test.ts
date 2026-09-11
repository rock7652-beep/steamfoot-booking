import { describe, expect, it } from "vitest";
import { legacyRedirectUrl } from "@/lib/proxy-helpers";

describe("legacy dashboard notification deep links", () => {
  it("preserves bookingId while adding the store-scoped dashboard path", () => {
    const incoming = new URL(
      "https://www.steamfoot.com/dashboard/bookings?bookingId=booking_1",
    );

    expect(
      legacyRedirectUrl(
        incoming,
        "/s/zhubei/admin/dashboard/bookings",
      ).toString(),
    ).toBe(
      "https://www.steamfoot.com/s/zhubei/admin/dashboard/bookings?bookingId=booking_1",
    );
  });

  it("preserves leadId while adding the store-scoped digital-butler path", () => {
    const incoming = new URL(
      "https://www.steamfoot.com/dashboard/digital-butler/leads?leadId=lead_1",
    );

    expect(
      legacyRedirectUrl(
        incoming,
        "/s/zhubei/admin/dashboard/digital-butler/leads",
      ).toString(),
    ).toBe(
      "https://www.steamfoot.com/s/zhubei/admin/dashboard/digital-butler/leads?leadId=lead_1",
    );
  });
});
