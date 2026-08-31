import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("booking deep-link state", () => {
  it("resolves current and legacy links only within authorized stores", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/app/(dashboard)/dashboard/bookings/page.tsx"),
      "utf8",
    );

    expect(source).toContain("await getAccessibleStoreIds(user)");
    expect(source).toContain("storeId: { in: accessibleStoreIds }");
    expect(source).toContain("deepLinkedBooking?.storeId ?? fallbackStoreId");
  });

  it("derives read-only mode from the matched booking store", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/app/(dashboard)/dashboard/bookings/page.tsx"),
      "utf8",
    );

    expect(source).toContain('user.role !== "ADMIN" && deepLinkedBooking.storeId !== user.storeId');
  });

  it("propagates the resolved store to the drawer detail fetch", () => {
    const manager = fs.readFileSync(
      path.join(process.cwd(), "src/app/(dashboard)/dashboard/bookings/bookings-manager.tsx"),
      "utf8",
    );
    const cache = fs.readFileSync(
      path.join(process.cwd(), "src/app/(dashboard)/dashboard/bookings/booking-detail-cache.ts"),
      "utf8",
    );
    const action = fs.readFileSync(
      path.join(process.cwd(), "src/server/actions/booking-drawer.ts"),
      "utf8",
    );

    expect(manager).toContain("createBookingDetailCache(storeId)");
    expect(cache).toContain("fetchBookingDetail(id, resolvedStoreId)");
    expect(action).toContain('validateStoreAccess(user, resolvedStoreId, "read")');
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
