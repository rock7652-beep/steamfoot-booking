import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/reports" }));

import { resolveDashboardHref } from "@/components/dashboard-link";

describe("DashboardLink query preservation", () => {
  it("preserves segment and month for a store-admin dashboard URL", () => {
    expect(
      resolveDashboardHref(
        "/dashboard/growth?segment=monthly-unconverted&month=2026-07",
        "/s/staging/admin/dashboard/reports",
      ),
    ).toBe(
      "/s/staging/admin/dashboard/growth?segment=monthly-unconverted&month=2026-07",
    );
  });

  it("preserves the same query for legacy dashboard URLs", () => {
    expect(
      resolveDashboardHref(
        "/dashboard/growth?segment=monthly-unconverted&month=2026-07",
        "/dashboard/reports",
      ),
    ).toBe("/dashboard/growth?segment=monthly-unconverted&month=2026-07");
  });
});
