// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => m }));
vi.mock("@/components/admin/roster-primitives", () => ({ RosterToolbar: ({ children }: { children: React.ReactNode }) => React.createElement("div", {}, children) }));
import { ConsultationFilters } from "@/app/hq/dashboard/trial-applications/consultation-filters";
import { parseConsultationSearch } from "@/app/hq/dashboard/trial-applications/consultation-view";
let root: Root, host: HTMLDivElement;
async function render(params: Record<string, string> = {}) {
  await act(async () => root.render(React.createElement(ConsultationFilters, { search: parseConsultationSearch(params) })));
}
async function change(name: string, value: string) {
  const input = host.querySelector(`[name="${name}"]`)!;
  await act(async () => {
    const proto = input.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event(input.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
const value = () => (host.querySelector('[name="q"]') as HTMLInputElement).value;
const flush = async () => { await act(async () => { vi.advanceTimersByTime(250); }); };
const click = async (selector: string) => { await act(async () => (host.querySelector(selector) as HTMLElement).click()); };
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers(); vi.clearAllMocks();
  window.history.replaceState({}, "", "/hq/dashboard/trial-applications");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host); await render();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); });
describe("HQ live filters", () => {
  it("keeps whole-dataset guidance accessible without a permanent visual instruction", () => {
    const state = host.querySelector("#intake-filter-state")!;
    expect(state.classList.contains("sr-only")).toBe(true);
    expect(state.textContent).toBe("即時篩選全部資料");
    expect(host.querySelector('[name="q"]')!.getAttribute("aria-describedby")).toBe("intake-filter-state");
  });
  it("debounces keywords, queries the server, and clears all detail/paging keys", async () => {
    await render({ lead: "lead", application: "app", page: "4", activityPage: "3", stage: "consultations" });
    await change("q", "瑜"); await change("q", "瑜伽");
    expect(m.replace).not.toHaveBeenCalled(); await flush();
    expect(m.replace).toHaveBeenCalledTimes(1);
    const href = m.replace.mock.calls[0][0];
    expect(decodeURIComponent(href)).toContain("q=瑜伽");
    for (const key of ["page=", "lead=", "application=", "activityPage="]) expect(href).not.toContain(key);
    expect(m.replace.mock.calls[0][1]).toEqual({ scroll: false });
    expect(host.querySelector('button[type="submit"]')).toBeNull();
  });
  it("applies status immediately together with the latest typed keyword", async () => {
    await change("q", "連續輸入"); await change("status", "FOLLOW_UP");
    expect(m.replace).toHaveBeenCalledTimes(1); await flush();
    expect(m.replace).toHaveBeenCalledTimes(1);
    expect(decodeURIComponent(m.replace.mock.calls[0][0])).toContain("q=連續輸入&status=FOLLOW_UP");
  });
  it("does not replace newer typing with a delayed response, including after the latest one", async () => {
    await change("q", "甲"); await flush();
    await change("q", "甲乙");
    await render({ q: "甲" }); expect(value()).toBe("甲乙");
    await flush(); await render({ q: "甲乙" }); expect(value()).toBe("甲乙");
    await render({ q: "甲" }); expect(value()).toBe("甲乙");
  });
  it("switches phase with the latest draft and no incompatible status or stale debounce", async () => {
    await change("status", "NEW"); await change("q", "新店");
    await click('nav a[href*="stage=applications"]'); await flush();
    expect(m.push).toHaveBeenCalledTimes(1);
    const href = m.push.mock.calls[0][0];
    expect(decodeURIComponent(href)).toContain("stage=applications&q=新店"); expect(href).not.toContain("status");
    expect(m.replace).toHaveBeenCalledTimes(1);
    await render({ stage: "consultations", q: "舊店", status: "NEW" });
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe("體驗版開通資料");
  });
  it("clear cancels pending typing, retains phase and removes selection/status", async () => {
    await render({ stage: "applications", q: "before", application: "id", status: "READY" });
    await change("q", "new"); await click('button'); await flush();
    expect(value()).toBe(""); expect(m.replace).toHaveBeenLastCalledWith("/hq/dashboard/trial-applications?stage=applications", { scroll: false });
    expect(m.replace).toHaveBeenCalledTimes(1);
  });
  it("Back/Forward restores URL state and cancels pending requests", async () => {
    await change("q", "pending");
    await act(async () => {
      window.history.replaceState({}, "", "/hq/dashboard/trial-applications?stage=applications&q=returned&status=READY&page=2");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await flush(); expect(m.replace).not.toHaveBeenCalled(); expect(value()).toBe("returned");
    expect((host.querySelector('[name="status"]') as HTMLSelectElement).value).toBe("READY");
    await render({ stage: "applications", q: "returned", status: "READY", page: "2" });
    expect(value()).toBe("returned");
    await act(async () => { window.history.replaceState({}, "", "/hq/dashboard/trial-applications"); window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(value()).toBe("");
  });
  it("honors list reset/deep links even when that query was previously issued", async () => {
    await change("q", "old"); await flush(); await render({ q: "old" });
    await click("button"); await render({});
    await change("q", "new"); await flush(); await render({ q: "new" });
    await change("q", "pending");
    const link = document.createElement("a"); link.href = "/hq/dashboard/trial-applications?stage=consultations"; link.textContent = "返回全部";
    link.addEventListener("click", event => event.preventDefault()); host.append(link);
    await act(async () => link.click()); await render({}); await flush();
    expect(value()).toBe(""); expect(m.replace).toHaveBeenCalledTimes(3);
  });
  it("cancels debounced filtering when navigating to store management", async () => {
    await change("q", "leave-page");
    const link = document.createElement("a"); link.href = "/hq/dashboard/stores";
    link.addEventListener("click", event => event.preventDefault()); host.append(link);
    await act(async () => link.click()); await flush(); expect(m.replace).not.toHaveBeenCalled();
  });
  it("does not submit partial IME composition", async () => {
    const input = host.querySelector("input")!;
    await act(async () => input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })));
    await change("q", "ㄨ"); await flush(); expect(m.replace).not.toHaveBeenCalled();
    await change("q", "舞蹈");
    await act(async () => input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })));
    await flush(); expect(m.replace).toHaveBeenCalledTimes(1); expect(decodeURIComponent(m.replace.mock.calls[0][0])).toContain("舞蹈");
  });
  it("cleans up debounce on unmount", async () => {
    await change("q", "cancel"); await act(async () => root.render(null)); await flush(); expect(m.replace).not.toHaveBeenCalled();
  });
  it("announces retained record drafts when filtering away", async () => {
    const dirty = document.createElement("form"); dirty.dataset.intakeDirty = "true"; host.append(dirty);
    await change("status", "FOLLOW_UP"); expect(host.textContent).toContain("未儲存的輸入已保留");
  });
});
