import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("SPA manager navigation", () => {
  const source = readFileSync(
    "src/app/(liff)/liff/_components/spa-manager-schedule-preview.tsx",
    "utf8",
  );

  it("renders every sidebar item as a same-page button", () => {
    expect(source).toContain('type ManagerWorkspaceKey = "today" | "bookings" | "customers" | "services" | "providers" | "settings"');
    expect(source).toContain("onClick={() => chooseWorkspace(item.key)}");
    expect(source).toContain('aria-current={activeWorkspace === item.key ? "page" : undefined}');
  });

  it("keeps booking and customer details in the existing side panel", () => {
    expect(source).toContain('workspace === "bookings"');
    expect(source).toContain('workspace === "customers"');
    expect(source).toContain("onClick={() => onOpenBooking(booking.id)}");
    expect(source).toContain("onClick={() => latest && onOpenBooking(latest.id)}");
  });

  it("provides working service, provider, and settings sections", () => {
    expect(source).toContain('workspace === "services"');
    expect(source).toContain('workspace === "providers"');
    expect(source).toContain('workspace === "settings"');
    expect(source).toContain("setServiceAvailability");
    expect(source).toContain("setSelectedProviderId");
    expect(source).toContain("setSlotInterval");
  });
});
