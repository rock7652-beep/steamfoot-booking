import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/server/queries/booking", () => ({ getMonthBookingSummary: mocks.query }));
vi.mock("@/lib/session", () => ({ getCurrentUser: async () => ({ id: "u", role: "OWNER", storeId: "s" }) }));
vi.mock("@/lib/permissions", () => ({ checkPermission: async () => true }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: async () => "s", getAccessibleStoreIds: async () => ["s"] }));
vi.mock("@/lib/store-view-context-server", () => ({ resolveStoreViewContextFromCookie: async () => null }));
vi.mock("@/lib/query-cache", () => ({ getCachedMonthScheduleSummary: async () => ({}) }));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: async () => "STEAM_FOOT" }));
vi.mock("@/lib/industry-dashboard-routes", () => ({ bookingDashboardPathForStoreModule: () => "/dashboard/bookings" }));
vi.mock("@/lib/db", () => ({ prisma: { servicePlan: { findMany: async () => [] } } }));
vi.mock("@/lib/spa-db", () => ({ spaPrisma: {} }));
vi.mock("@/lib/perf", () => ({
  ServerTiming: class { finish() {} },
  withTiming: (_name: string, _timer: unknown, run: () => unknown) => run(),
}));
vi.mock("@/components/form-success-toast", () => ({ FormSuccessToast: () => null }));
vi.mock("@/components/desktop", () => ({ PageShell: "main", PageHeader: "header" }));
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: "a" }));
vi.mock("@/app/(dashboard)/dashboard/bookings/bookings-manager", () => ({ BookingsManager: "booking-manager" }));
vi.mock("@/app/(dashboard)/dashboard/bookings/booking-load-error", () => ({ BookingLoadError: "booking-load-error" }));

import BookingsPage from "@/app/(dashboard)/dashboard/bookings/page";

async function mainContent() {
  const page = await BookingsPage({ searchParams: Promise.resolve({ year: "2026", month: "9" }) });
  return (page.props.children as ReactElement[]).at(-1)!;
}

describe("monthly booking load result", () => {
  beforeEach(() => { mocks.query.mockReset(); vi.restoreAllMocks(); });

  it("shows a load error instead of an empty calendar when the query rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.query.mockRejectedValue(new Error("database unavailable"));
    expect((await mainContent()).type).toBe("booking-load-error");
  });

  it("keeps a genuinely empty successful result as a calendar", async () => {
    mocks.query.mockResolvedValue([]);
    const content = await mainContent();
    expect(content.type).toBe("booking-manager");
    expect(content.props).toMatchObject({ monthData: [], storeId: "s" });
  });

  it("passes successful bookings through without changing their values", async () => {
    const rows = [{ date: "2026-09-09", count: 2 }];
    mocks.query.mockResolvedValue(rows);
    const content = await mainContent();
    expect(content.type).toBe("booking-manager");
    expect((content.props as { monthData: unknown }).monthData).toBe(rows);
  });
});
