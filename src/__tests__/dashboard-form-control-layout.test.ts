import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("dashboard form control layout", () => {
  const css = read("src/app/globals.css");

  it("does not force every dashboard input and select to full width", () => {
    const sharedControlRule = css.match(
      /\[data-dashboard-content\] :where\([\s\S]*?\) \{([\s\S]*?)\n\}/,
    )?.[1];

    expect(sharedControlRule).toBeDefined();
    expect(sharedControlRule).not.toContain("width: 100%");
    expect(sharedControlRule).not.toContain("max-width: 100%");
  });

  it("centres Safari date values and preserves compact booking filters", () => {
    expect(css).toContain('input[type="date"]::-webkit-date-and-time-value');
    expect(css).toContain('input[type="date"]::-webkit-datetime-edit');
    expect(css).toContain("[data-booking-filter-bar]");
    expect(read("src/app/(dashboard)/dashboard/bookings/bookings-manager.tsx"))
      .toContain("data-booking-filter-bar");
  });
});
