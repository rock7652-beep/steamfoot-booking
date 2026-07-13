import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/desktop", () => ({
  DataTable: ({ rows }: { rows: Array<{ name: string; phoneMasked: string }> }) =>
    React.createElement(
      "div",
      null,
      rows.map((row) =>
        React.createElement("div", { key: row.name }, `${row.name} ${row.phoneMasked}`),
      ),
    ),
}));

vi.mock("@/app/(dashboard)/dashboard/growth/_components/care-row-actions", () => ({
  CareRowActions: () => React.createElement("div", null, "查看顧客 建立預約 複製話術 追蹤"),
}));

import { CareSection, type CareItem } from "@/app/(dashboard)/dashboard/growth/_components/care-section";

function item(index: number): CareItem {
  return {
    customerId: `customer-${index}`,
    name: `顧客 ${index}`,
    phoneMasked: `09xx-xxx-000${index}`,
    reason: "提醒原因",
    meta: null,
    staffName: null,
    lastFollowUpText: null,
    script: "話術",
  };
}

describe("CareSection readability", () => {
  it("places the expand control in the title row and keeps the first three customers", () => {
    const html = renderToStaticMarkup(
      React.createElement(CareSection, {
        title: "建議安排回店",
        description: "適合安排下一次服務。",
        emptyText: "沒有顧客",
        items: [item(1), item(2), item(3), item(4)],
        totalCount: 4,
      }),
    );

    expect(html.indexOf("查看全部 →")).toBeGreaterThan(html.indexOf("建議安排回店"));
    expect(html.indexOf("查看全部 →")).toBeLessThan(html.indexOf("適合安排下一次服務。"));
    expect(html).toContain("還有 1 位");
    expect(html).toContain("顧客 1 09xx-xxx-0001");
    expect(html).toContain("顧客 3 09xx-xxx-0003");
    expect(html).not.toContain("顧客 4 09xx-xxx-0004");
  });
});
