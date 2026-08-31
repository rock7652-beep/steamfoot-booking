import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("booking deep-link state", () => {
  it("prefers the authorized route store over a stale view-mode cookie", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/app/(dashboard)/dashboard/bookings/page.tsx"),
      "utf8",
    );

    expect(source).toContain("params.bookingId\n    ? activeStoreId");
    expect(source).toContain("where: { id: params.bookingId, storeId: bookingsStoreId }");
  });

  it("clears a previously deep-linked drawer when bookingId disappears", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/app/(dashboard)/dashboard/bookings/bookings-manager.tsx"),
      "utf8",
    );

    expect(source).toContain("if (appliedDeepLinkIdRef.current !== null)");
    expect(source).toContain("setActiveBookingId(null)");
    expect(source).toContain("setActiveSummary(null)");
    expect(source).toContain("setActivePrefill(null)");
  });
});
