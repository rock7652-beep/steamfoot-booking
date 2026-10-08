import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifiedMarketingUsageSnapshot } from "@/lib/marketing-usage-snapshot";

const mocks = vi.hoisted(() => ({ usage: vi.fn(), stores: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { store: { findMany: mocks.stores } } }));
vi.mock("@/lib/marketing-usage-server", () => ({ getMarketingUsage: mocks.usage }));
vi.mock("@/components/dashboard-link", () => ({
  DashboardLink: ({ children, ...props }: Record<string, unknown>) => createElement("a", props, children as never),
}));

import { BrandOverviewContent } from "@/components/hq-brand-overview";

describe("HQ brand overview shared usage snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.stores.mockResolvedValue([]);
  });

  it("renders all four totals and the date from one shared snapshot", async () => {
    mocks.usage.mockResolvedValue({ stores: 7, customers: 456, completedPeople: 2345, remindersSent: 1234, asOf: "2026-10-08" });
    const html = renderToStaticMarkup(await BrandOverviewContent());
    for (const text of ["7 間", "456 筆", "2,345 人次", "自動提醒", "1,234 則", "截至 2026/10/8"]) {
      expect(html).toContain(text);
    }
    expect(mocks.usage).toHaveBeenCalledTimes(1);
    expect(html).not.toContain("641 則");
    expect(html).toContain("目前正式使用 0 間");
    expect(mocks.stores).toHaveBeenCalledWith(expect.objectContaining({
      where: { isDemo: false, operatingStatus: "ACTIVE", plan: { not: "EXPERIENCE" } },
    }));
  });

  it("preserves a legitimate zero reminder total", async () => {
    mocks.usage.mockResolvedValue({ stores: 0, customers: 0, completedPeople: 0, remindersSent: 0, asOf: "2026-10-01" });
    const html = renderToStaticMarkup(await BrandOverviewContent());
    expect(html).toContain("0 則");
    expect(html).toContain("截至 2026/10/1");
  });

  it("keeps the original date and totals when the shared reader returns its historical fallback", async () => {
    mocks.usage.mockResolvedValue(verifiedMarketingUsageSnapshot);
    const html = renderToStaticMarkup(await BrandOverviewContent());
    expect(html).toContain(`${verifiedMarketingUsageSnapshot.remindersSent.toLocaleString("en-US")} 則`);
    expect(html).toContain("截至 2026/10/7");
    expect(mocks.usage).toHaveBeenCalledTimes(1);
  });
});
