// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), remove: vi.fn() }));
vi.mock("@/server/actions/quick-cashbook", () => ({ fetchQuickCashbook: m.read, saveQuickCashbook: m.save, deleteQuickCashbook: m.remove }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: ({ children }: { children: React.ReactNode }) => React.createElement("span", null, children) }));
vi.mock("@/app/(dashboard)/dashboard/cashbook/_components/cashbook-entry-fields", () => ({ CashbookEntryFields: () => React.createElement("input", { name: "amount", defaultValue: "100" }) }));
import { QuickCashbook } from "@/app/(dashboard)/dashboard/cashbook/_components/quick-cashbook";
import { PanelReadProvider } from "@/components/operations/panel-read-cache";
let host: HTMLDivElement, root: Root;
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; }
function payload(label: string, page = 1) { return { today: "2026-10-05", page, total: 21, canWrite: true, closedDates: [], canDrawer: true, balance: 100, balanceLabel: label, entries: [] }; }
async function render(storeId = "a") { await act(async () => root.render(React.createElement(PanelReadProvider, null, React.createElement(QuickCashbook, { storeId })))); }
async function click(text: string) { await act(async () => { Array.from(document.querySelectorAll("button")).find(b => b.textContent === text)!.click(); }); }
beforeEach(() => { vi.resetAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); m.read.mockImplementation(async (store, page) => payload(`fresh-${store}`, page)); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
it.each(["pointerover", "focusin", "touchstart"])("%s intent shares only the in-flight read and reopening fetches fresh balance", async event => {
  const pending = deferred<ReturnType<typeof payload>>(); m.read.mockReturnValueOnce(pending.promise);
  await render(); expect(m.read).not.toHaveBeenCalled();
  await act(async () => host.querySelector("button")!.dispatchEvent(new Event(event, { bubbles: true })));
  await click("現金收支"); expect(m.read).toHaveBeenCalledTimes(1); expect(document.querySelector('[role="status"]')?.textContent).toContain("讀取中");
  await act(async () => pending.resolve(payload("first-balance")));
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("first-balance");
  await click("關閉"); await click("現金收支"); expect(m.read).toHaveBeenCalledTimes(2);
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("fresh-a");
});
it("retry stays on the failed page and does not show an outdated balance or editing actions", async () => {
  await render(); await click("現金收支"); m.read.mockRejectedValueOnce(new Error("offline")); await click("下一頁");
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("無法讀取");
  expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("fresh-a");
  expect(Array.from(document.querySelectorAll("button")).some(b => b.textContent === "＋ 記一筆")).toBe(false);
  await click("重試"); expect(m.read).toHaveBeenLastCalledWith("a", 2); expect(document.querySelector('[role="alert"]')).toBeNull();
});
it("closing invalidates the pending read and its late result cannot replace a reopened panel", async () => {
  const pending = deferred<ReturnType<typeof payload>>(); m.read.mockReturnValueOnce(pending.promise);
  await render(); await click("現金收支"); await click("關閉"); await click("現金收支");
  expect(m.read).toHaveBeenCalledTimes(2);
  await act(async () => pending.resolve(payload("old-balance")));
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("fresh-a"); expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("old-balance");
});
it("changing store removes its panel and ignores the previous store's late response", async () => {
  const pending = deferred<ReturnType<typeof payload>>(); m.read.mockReturnValueOnce(pending.promise);
  await render(); await click("現金收支"); await render("b"); expect(document.querySelector('[role="dialog"]')).toBeNull();
  await click("現金收支"); await act(async () => pending.resolve(payload("old-store-a")));
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("fresh-b"); expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("old-store-a");
});
it("successful writes invalidate every page before rereading the balance", async () => {
  m.save.mockResolvedValue({ success: true }); await render(); await click("現金收支"); await click("＋ 記一筆");
  m.read.mockResolvedValueOnce(payload("after-save"));
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(m.save).toHaveBeenCalledTimes(1); expect(m.read).toHaveBeenCalledTimes(2); expect(document.querySelector('[role="dialog"]')?.textContent).toContain("after-save");
});
