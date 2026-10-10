// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditAutoRefresh } from "@/app/(dashboard)/dashboard/operation-audits/audit-auto-refresh";
import { OperationAuditFilters } from "@/app/(dashboard)/dashboard/operation-audits/operation-audit-filters";

const router = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/hq/dashboard/operation-audits" }));
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-10T03:00:00Z")); vi.clearAllMocks(); localStorage.clear();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); document.body.innerHTML = ""; vi.useRealTimers(); });
const mount = async (props: Partial<Parameters<typeof AuditAutoRefresh>[0]> = {}) => {
  await act(async () => root.render(createElement(AuditAutoRefresh, {
    renderedAt: Date.now(), dateTo: "2026-10-10", followToday: true, page: 1,
    ...props,
  }, props.children ?? createElement("div", { "data-audit-list": true }, createElement("details", { "data-record": "one" }, "record")))));
};
const tick = async (ms = 60_000) => { await act(async () => vi.advanceTimersByTime(ms)); };

describe("HQ audit background refresh", () => {
  it("waits 60 seconds and coalesces simultaneous foreground events", async () => {
    await mount(); await tick(59_999); expect(router.refresh).not.toHaveBeenCalled();
    await tick(1); expect(router.refresh).toHaveBeenCalledTimes(1);
    await act(async () => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
  it("pauses hidden tabs then refreshes on return", async () => {
    await mount(); Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await tick(); expect(router.refresh).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
  it("does not disturb an open record, historical page, or focused filter", async () => {
    await mount(); host.querySelector("details")!.open = true; await tick(); expect(router.refresh).not.toHaveBeenCalled();
    await mount({ page: 2 }); await tick(); expect(router.refresh).not.toHaveBeenCalled();
    await mount({ children: createElement("form", null, createElement("input")) }); host.querySelector("input")!.focus();
    await tick(); expect(router.refresh).not.toHaveBeenCalled();
  });
  it("advances Taiwan date at midnight and keeps query filters and HQ prefix", async () => {
    window.history.replaceState({}, "", "/hq/dashboard/operation-audits?actor=qa&dateFrom=2026-09-01&dateTo=2026-10-10");
    vi.setSystemTime(new Date("2026-10-10T15:59:30Z")); await mount(); await tick();
    const url = router.replace.mock.calls[0][0] as string;
    expect(url).toContain("/hq/dashboard/operation-audits?"); expect(url).toContain("actor=qa"); expect(url).toContain("dateFrom=2026-09-01");
    expect(url).toContain("dateTo=2026-10-11"); expect(url).toContain("dateMode=today");
  });
  it("keeps historical date ranges fixed", async () => {
    await mount({ dateTo: "2026-10-09", followToday: false }); await tick();
    expect(router.replace).not.toHaveBeenCalled(); expect(router.refresh).toHaveBeenCalledTimes(1);
  });
  it("removes listeners and timers on unmount", async () => {
    await mount(); await act(async () => root.unmount()); root = createRoot(host);
    await tick(); window.dispatchEvent(new Event("focus")); expect(router.refresh).not.toHaveBeenCalled();
  });
  it("does not restore stale legacy dates but retains actor filters", async () => {
    localStorage.setItem("qa", JSON.stringify({ dateFrom: "2026-09-01", dateTo: "2026-10-09", actor: "qa" }));
    await act(async () => root.render(createElement(OperationAuditFilters, {
      actors: [], cacheKey: "qa", defaults: { dateFrom: "2026-10-04", dateTo: "2026-10-10", actor: "", module: "", q: "" },
      hasExplicitFilters: false, showModuleFilter: true,
    })));
    const url = router.replace.mock.calls[0][0] as string;
    expect(url).toContain("actor=qa"); expect(url).not.toContain("2026-10-09");
  });
});
