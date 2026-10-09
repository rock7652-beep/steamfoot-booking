import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, afterEach } from "vitest";
import { MarketingUsageStatistics } from "@/components/marketing-usage-statistics";

const snapshot = { stores: 7, customers: 456, completedPeople: 2345, remindersSent: 789, asOf: "2026-10-06" };
afterEach(() => vi.useRealTimers());
describe("public usage statistics", () => {
  it("renders all four approved labels and units with accessible final numbers", () => {
    const html = renderToStaticMarkup(createElement(MarketingUsageStatistics, { snapshot }));
    for (const label of ["使用店家", "服務顧客", "完成服務", "自動提醒"]) expect(html).toContain(label);
    for (const value of ["7 間", "456 位", "2,345 人次", "789 則"]) expect(html).toContain(`<span class="sr-only">${value}</span>`);
    expect(html).not.toContain("服務顧客名單");
    expect(html).not.toContain("使用門市");
    expect(html).toContain("grid-cols-2");
    expect(html).toContain("md:grid-cols-4");
    expect(html).not.toContain("依已記錄成功發送統計");
  });
  it("formats the persisted snapshot date without relabeling it as today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2028-01-01T00:00:00Z"));
    const html = renderToStaticMarkup(createElement(MarketingUsageStatistics, { snapshot }));
    expect(html).toContain("每日更新｜資料更新至 2026/10/06");
    expect(html).not.toContain("2028");
  });
  it("displays a verified zero as zero without substituting a marketing number", () => {
    const html = renderToStaticMarkup(createElement(MarketingUsageStatistics, { snapshot: { ...snapshot, remindersSent: 0 } }));
    expect(html).toContain('<span class="sr-only">0 則</span>');
  });
});
