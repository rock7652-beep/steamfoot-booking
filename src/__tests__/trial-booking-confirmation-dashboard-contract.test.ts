import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("trial booking customer confirmation dashboard contract", () => {
  it("selects and maps the confirmation timestamp into the monthly booking summary", () => {
    const query = read("src/server/queries/booking.ts");

    expect(query).toContain("customerConfirmedAt: true");
    expect(query).toContain("customerConfirmedAt: b.customerConfirmedAt");
  });

  it("passes the timestamp to the day panel and renders a staff-visible label", () => {
    const manager = read("src/app/(dashboard)/dashboard/bookings/bookings-manager.tsx");
    const panel = read("src/app/(dashboard)/dashboard/bookings/day-detail-panel.tsx");

    expect(manager).toContain("customerConfirmedAt: b.customerConfirmedAt");
    expect(panel).toContain("booking.customerConfirmedAt");
    expect(panel).toContain("顧客已確認會到");
  });
});
