import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/desktop", () => ({
  DataTable: ({ rows }: { rows: Array<{ name: string; phoneLabel: string }> }) =>
    React.createElement(
      "div",
      null,
      rows.map((row) =>
        React.createElement("div", { key: row.name }, `${row.name} ${row.phoneLabel}`),
      ),
    ),
}));

vi.mock("@/app/(dashboard)/dashboard/growth/_components/care-row-actions", () => ({
  CareRowActions: () => React.createElement("div", null, "查看顧客 建立預約 複製話術 追蹤"),
}));

vi.mock("@/components/dashboard-link", () => ({ DashboardLink: ({children}: {children: React.ReactNode}) => React.createElement("a", null, children) }));

import { CareSection, type CareItem } from "@/app/(dashboard)/dashboard/growth/_components/care-section";

function item(index: number): CareItem {
  return {
    customerId: `customer-${index}`,
    name: `顧客 ${index}`,
    phoneLabel: `091234000${index}`,
    reason: "提醒原因",
    meta: null,
    staffName: null,
    lastFollowUpText: null,
    script: "話術",
  };
}

describe("CareSection readability", () => {
  it("places the expand control in the title row and keeps the first five customers", () => {
    const html = renderToStaticMarkup(
      React.createElement(CareSection, {
        title: "建議安排回店",
        description: "適合安排下一次服務。",
        emptyText: "沒有顧客",
        items: [item(1), item(2), item(3), item(4), item(5), item(6)],
        totalCount: 6,
      }),
    );

    expect(html.indexOf("查看全部（6）")).toBeGreaterThan(html.indexOf("建議安排回店"));
    expect(html.indexOf("查看全部（6）")).toBeLessThan(html.indexOf("適合安排下一次服務。"));
    expect(html).toContain("顧客 1");
    expect(html).toContain("顧客 5");
    expect(html).not.toContain("顧客 6");
  });
});
