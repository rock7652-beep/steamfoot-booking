// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/server/actions/customer-panel-records", () => ({ getCustomerPanelRecords: h.load }));
import { CustomerPanelRecordsList } from "@/app/(dashboard)/dashboard/customers/_components/customer-panel-records";
let host: HTMLDivElement, root: Root;
const render = (active = true) => act(async () => root.render(createElement(CustomerPanelRecordsList, { customerId: "customer", kind: "bookings", revision: "1", active })));
const click = (text: string) => act(async () => [...host.querySelectorAll("button")].find(b => b.textContent === text)!.click());
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  h.load.mockReset().mockImplementation(async (_id, _kind, page) => ({ success: true, data: { page, hasMore: page === 1, rows: [{ id: `row-${page}`, date: new Date("2026-11-01"), label: `第${page}頁紀錄`, status: "COMPLETED" }] } }));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it("replaces a page instead of appending and retains it when switching sections", async () => {
  await render(); await click("下一頁");
  expect(host.textContent).toContain("第2頁紀錄");
  expect(host.textContent).not.toContain("第1頁紀錄");
  await render(false); await render();
  expect(host.textContent).toContain("第2頁紀錄");
  expect(h.load).toHaveBeenCalledTimes(2);
});
it("keeps confirmed rows after a failed next page and retries that same page", async () => {
  await render();
  h.load.mockResolvedValueOnce({ success: false, error: "暫時無法讀取" });
  await click("下一頁");
  expect(host.textContent).toContain("第1頁紀錄");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("暫時無法讀取");
  await click("重試");
  expect(h.load).toHaveBeenLastCalledWith("customer", "bookings", 2, "past",{from:"",to:"",item:""});
  expect(host.textContent).toContain("第2頁紀錄");
});
it("does not display the previous customer's page while the next customer is loading", async () => {
  await render();
  let resolve!: (value: unknown) => void;
  h.load.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  await act(async () => root.render(createElement(CustomerPanelRecordsList, { customerId: "other", kind: "bookings", revision: "1", active: true })));
  expect(host.textContent).not.toContain("第1頁紀錄");
  expect(host.textContent).toContain("讀取中");
  await act(async () => resolve({ success: true, data: { page: 1, hasMore: false, rows: [] } }));
  expect(h.load).toHaveBeenLastCalledWith("other", "bookings", 1, "past",{from:"",to:"",item:""});
  expect(host.textContent).toContain("尚無紀錄");
});
