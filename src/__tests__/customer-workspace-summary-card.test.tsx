import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CustomerCareSummaryCard } from "@/app/(dashboard)/dashboard/customer-care-summary-card";

describe("CustomerCareSummaryCard", () => {
  it("renders the same five sections as the customer workspace", () => {
    const html = renderToStaticMarkup(
      <CustomerCareSummaryCard
        summary={{
          birthdayCustomers: 1,
          monthlyUnconvertedCustomers: 4,
          inactiveCustomers: 11,
          lowSessionCustomers: 12,
          expiringPlanCustomers: 2,
          totalReminders: 30,
        }}
      />,
    );

    expect(html).toContain("🎂 本月生日");
    expect(html).toContain("🟡 本月體驗未開卡");
    expect(html).toContain("💤 好久不見");
    expect(html).toContain("📦 建議安排回店");
    expect(html).toContain("⏰ 建議續約");
    expect(html).toContain("前往顧客工作台");
    expect(html).toContain('href="/dashboard/growth"');
  });

  it("keeps the workspace entry in the all-zero empty state", () => {
    const html = renderToStaticMarkup(
      <CustomerCareSummaryCard
        summary={{
          birthdayCustomers: 0,
          monthlyUnconvertedCustomers: 0,
          inactiveCustomers: 0,
          lowSessionCustomers: 0,
          expiringPlanCustomers: 0,
          totalReminders: 0,
        }}
      />,
    );

    expect(html).toContain("今天沒有需要特別關心的顧客");
    expect(html).toContain("前往顧客工作台");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("NaN");
  });
});
