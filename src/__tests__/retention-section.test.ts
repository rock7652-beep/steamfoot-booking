// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RetentionSection } from "@/app/(dashboard)/dashboard/reports/retention-section";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const metric = (current: number) => ({ current, mom: { difference: 0, percentage: null }, yoy: { difference: 0, percentage: null } });
const presentation = { title: "上月顧客回流", description: "上月來過的顧客，有多少在本月再次回來？", base: "上月", progress: "截至今日", dates: "測試區間" };
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => { act(() => roots.forEach(root => root.unmount())); roots.length = 0; document.body.innerHTML = ""; });
function render(customers: { id: string; name: string; phone: string | null; returned: boolean; booked: boolean }[] | null, base = 2) {
  const host = document.createElement("div"); document.body.appendChild(host); const root = createRoot(host); roots.push(root);
  act(() => root.render(React.createElement(RetentionSection, { presentation, returned: metric(base ? 1 : 0), pending: metric(base ? 1 : 0), rate: metric(base ? 50 : 0), customers })));
  return host;
}
describe("回流名單原頁操作", () => {
  it("展開尚未回訪名單並標示已有預約，關閉後不導航", () => {
    const host = render([{ id: "1", name: "已回來", phone: null, returned: true, booked: false }, { id: "2", name: "等待回訪", phone: "0912345678", returned: false, booked: true }]);
    const button = [...host.querySelectorAll("button")].find(b => b.textContent?.includes("尚未回訪"))!;
    act(() => button.click()); expect(host.querySelector("ul")?.textContent).toContain("等待回訪"); expect(host.querySelector("ul")?.textContent).toContain("已有預約"); expect(host.querySelector("ul")?.textContent).not.toContain("已回來");
    act(() => button.click()); expect(host.querySelector("ul")).toBeNull(); expect(host.querySelector("a")).toBeNull();
  });
  it("無顧客查看權限時不提供名單操作", () => { const host = render(null); expect([...host.querySelectorAll("button")].every(b => b.disabled)).toBe(true); });
  it("沒有基準顧客時顯示暫無資料", () => { const host = render([], 0); expect(host.textContent).toContain("暫無資料"); expect(host.textContent).not.toContain("0.0%"); });
});
