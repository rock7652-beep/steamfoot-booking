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

  it("keeps daily booking and customer account details in side panels", () => {
    expect(source).toContain('workspace === "bookings"');
    expect(source).toContain('workspace === "customers"');
    expect(source).toContain("一日預約表");
    expect(source).toContain("values={[15, 30]}");
    expect(source).toContain("onOpenQuickBooking({ date: workspaceDate, time, providerId: provider.id })");
    expect(source).toContain("border-red-500");
    expect(source).toContain("現在");
    expect(source).toContain("onClick={() => onOpenBooking(booking.id)}");
    expect(source).toContain("setSelectedCustomer(customer.name)");
    expect(source).toContain("CustomerAccountPreview");
  });

  it("provides working service, provider, and settings sections", () => {
    expect(source).toContain('workspace === "services"');
    expect(source).toContain('workspace === "providers"');
    expect(source).toContain('workspace === "settings"');
    expect(source).toContain("setServiceAvailability");
    expect(source).toContain("setEditingServiceKey");
    expect(source).toContain("setEditingProviderId");
    expect(source).toContain("setSlotInterval");
    expect(source).toContain("新增療程");
    expect(source).toContain("新增人員");
    expect(source).toContain("提醒管理");
  });
});
