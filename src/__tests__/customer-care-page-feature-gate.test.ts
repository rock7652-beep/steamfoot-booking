import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentUser = vi.fn();
const mockCheckPermission = vi.fn();
const mockGetActiveStoreForRead = vi.fn();
const mockHasStoreFeature = vi.fn();
const mockGetCustomerCareOverview = vi.fn();
const mockRedirect = vi.fn((href: string) => {
  throw new Error(`redirect:${href}`);
});

vi.mock("next/navigation", () => ({
  redirect: (href: string) => mockRedirect(href),
}));

vi.mock("@/lib/session", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/lib/permissions", () => ({
  checkPermission: (...args: unknown[]) => mockCheckPermission(...args),
}));

vi.mock("@/lib/store", () => ({
  getActiveStoreForRead: (...args: unknown[]) => mockGetActiveStoreForRead(...args),
}));

vi.mock("@/lib/feature-gate", () => ({
  hasStoreFeature: (...args: unknown[]) => mockHasStoreFeature(...args),
}));

vi.mock("@/server/queries/customer-care", () => ({
  getCustomerCareOverview: (...args: unknown[]) => mockGetCustomerCareOverview(...args),
}));

vi.mock("@/components/dashboard-link", () => ({
  DashboardLink: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));

vi.mock("@/components/desktop", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) =>
    React.createElement("main", null, children),
  PageHeader: ({
    title,
    subtitle,
    actions,
  }: {
    title: string;
    subtitle?: string;
    actions?: React.ReactNode;
  }) =>
    React.createElement(
      "header",
      null,
      React.createElement("h1", null, title),
      subtitle ? React.createElement("p", null, subtitle) : null,
      actions,
    ),
  KpiStrip: ({ items }: { items: Array<{ label: string; value: number }> }) =>
    React.createElement("section", null, items.map((item) => `${item.label}:${item.value}`).join(",")),
}));

import CustomerCarePage from "@/app/(dashboard)/dashboard/growth/page";

const OWNER = { id: "user-1", role: "OWNER", staffId: "staff-1", storeId: "store-1" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(OWNER);
  mockCheckPermission.mockResolvedValue(true);
  mockGetActiveStoreForRead.mockResolvedValue("store-1");
  mockHasStoreFeature.mockResolvedValue(true);
  mockGetCustomerCareOverview.mockResolvedValue({
    trialFollowUps: [],
    inactiveCustomers: [],
    lowSessionCustomers: [],
    expiringPlanCustomers: [],
    summary: {
      trialFollowUps: 0,
      inactiveCustomers: 0,
      lowSessionCustomers: 0,
      expiringPlanCustomers: 0,
    },
  });
});

describe("CustomerCarePage feature gate", () => {
  it("renders a friendly locked state instead of throwing when customer_care is disabled", async () => {
    mockHasStoreFeature.mockResolvedValueOnce(false);

    const html = renderToStaticMarkup(await CustomerCarePage());

    expect(mockHasStoreFeature).toHaveBeenCalledWith("store-1", "customer_care");
    expect(mockGetCustomerCareOverview).not.toHaveBeenCalled();
    expect(html).toContain("此功能尚未開通");
    expect(html).toContain("請聯絡總部加購或升級方案");
    expect(html).toContain("返回儀表板");
  });
});
