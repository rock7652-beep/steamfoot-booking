// @vitest-environment jsdom
/** Mocked actions verify immediate feedback and scope isolation, not network speed. */
import { act, createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ action: vi.fn(), error: vi.fn(), refresh: vi.fn(), rethrow: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/s/store-a/admin/dashboard/customers",
  useRouter: () => ({ refresh: m.refresh }), unstable_rethrow: m.rethrow,
}));
vi.mock("@/server/actions/store-view-mode", () => ({ switchViewedStore: m.action }));
vi.mock("sonner", () => ({ toast: { error: m.error } }));
import { OperationScope } from "@/components/operations/operation-scope";
import { StoreViewModeSwitcher } from "@/components/store-view-mode-switcher";
import { ViewModeBanner } from "@/components/view-mode-banner";
import { useCourseDraftGuard } from "@/components/admin/use-course-draft-guard";

let host: HTMLDivElement, root: Root;
const ownStore = { id: "store-a", name: "母店 A" };
const descendantStores = [{ id: "store-b", name: "分店 B" }];
function Fixture({ storeId, dirty = false }: { storeId: string; dirty?: boolean }) {
  useCourseDraftGuard(dirty);
  const [draft, setDraft] = useState("");
  return createElement("main", null,
    createElement(StoreViewModeSwitcher, { ownStore, descendantStores, viewedStoreId: storeId, multiStoreEnabled: true }),
    createElement(StoreViewModeSwitcher, { ownStore, descendantStores, viewedStoreId: storeId, multiStoreEnabled: true, collapsed: true }),
    storeId !== ownStore.id && createElement(ViewModeBanner, { viewedStoreName: "分店 B" }),
    createElement("p", { "data-private-store": storeId }, `${storeId} 資料`),
    createElement("input", { "aria-label": "本頁草稿", value: draft, onChange: event => setDraft(event.currentTarget.value) }),
    createElement("button", { "data-write": true, disabled: storeId !== ownStore.id }, "儲存本店資料"),
  );
}
function OldPanelFixture() {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", escape, true);
    document.addEventListener("keydown", escape);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("keydown", escape);
    };
  }, []);
  return createElement("section", { "data-old-panel-open": String(open) }, createElement(Fixture, { storeId: "store-a" }));
}
async function render(storeId = "store-a", dirty = false) {
  await act(async () => root.render(createElement(OperationScope, { key: storeId, scope: storeId }, createElement(Fixture, { storeId, dirty }))));
}
function button(text: string) { return [...host.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.includes(text))!; }
async function choose(text: string) {
  await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
  const target = button(text);
  await act(async () => target.click());
  return target;
}
const content = () => host.querySelector<HTMLElement>("[data-store-view-content]")!;
function deferred() {
  let resolve!: (result: unknown) => void, reject!: (error: Error) => void;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.resetAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  // jsdom lacks native top-layer/inert behavior; browser acceptance is separate.
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

it("shows target feedback before the action resolves and hides/inerts all old-store content", async () => {
  const pending = deferred(); m.action.mockReturnValue(pending.promise);
  await render(); await choose("分店 B");
  expect(m.action).toHaveBeenCalledExactlyOnceWith("store-b", "/s/store-a/admin/dashboard/customers");
  expect(host.querySelector("dialog")?.open).toBe(true);
  expect(host.querySelector('[role="status"]')?.textContent).toContain("正在切換至「分店 B」");
  expect(content().hidden).toBe(true); expect(content().hasAttribute("inert")).toBe(true);
  expect(content().getAttribute("aria-hidden")).toBe("true");
  // Even an empty success response cannot unlock or relabel the old page.
  await act(async () => pending.resolve(undefined));
  expect(content().hidden).toBe(true); expect(host.querySelector("[data-private-store]")?.getAttribute("data-private-store")).toBe("store-a");
  await render("store-b");
  expect(host.querySelector("dialog")).toBeNull(); expect(content().hidden).toBe(false);
  expect(host.querySelector<HTMLButtonElement>("[data-write]")!.disabled).toBe(true);
});

it("deduplicates same-tick double clicks and another mounted switch control", async () => {
  m.action.mockReturnValue(deferred().promise); await render("store-b");
  await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
  const own = button("我的店"), banner = button("返回我的店");
  await act(async () => { own.click(); own.click(); banner.click(); });
  expect(m.action).toHaveBeenCalledTimes(1); expect(m.action).toHaveBeenCalledWith("__own__", expect.any(String));
});

it("restores the unchanged old scope on a confirmed server rejection and permits retry", async () => {
  const pending = deferred(); m.action.mockReturnValue(pending.promise);
  await render(); await choose("分店 B");
  await act(async () => pending.resolve({ success: false, error: "該店已停用" }));
  expect(host.querySelector("dialog")).toBeNull(); expect(content().hidden).toBe(false);
  expect(host.querySelector("[data-private-store]")?.getAttribute("data-private-store")).toBe("store-a");
  expect(m.error).toHaveBeenCalledWith("該店已停用");
  m.action.mockReturnValue(deferred().promise); await choose("分店 B"); expect(m.action).toHaveBeenCalledTimes(2);
});

it("keeps old data and actions blocked when a network error leaves the cookie outcome unknown", async () => {
  const pending = deferred(); m.action.mockReturnValue(pending.promise);
  await render(); await choose("分店 B");
  const failure = new Error("offline"); await act(async () => pending.reject(failure));
  expect(m.rethrow).toHaveBeenCalledWith(failure);
  expect(content().hidden).toBe(true); expect(content().hasAttribute("inert")).toBe(true);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("尚未確認切換結果");
  expect(button("重新載入確認")).toBeDefined(); expect(m.error).not.toHaveBeenCalled();
  const cancel = new Event("cancel", { bubbles: true, cancelable: true });
  await act(async () => host.querySelector("dialog")!.dispatchEvent(cancel)); expect(cancel.defaultPrevented).toBe(true);
});

it("does not let a late old-scope failure affect B or a newer B to A switch", async () => {
  const first = deferred(), second = deferred(); m.action.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  await render(); await choose("分店 B"); await render("store-b");
  await act(async () => button("返回我的店").click());
  await act(async () => first.resolve({ success: false, error: "late A response" }));
  expect(m.error).not.toHaveBeenCalled(); expect(content().hidden).toBe(true);
  expect(host.querySelector('[role="status"]')?.textContent).toContain("我的店");
  await render("store-a"); await act(async () => second.resolve(undefined));
  expect(content().hidden).toBe(false); expect(host.querySelector("dialog")).toBeNull();
  expect(host.querySelector<HTMLButtonElement>("[data-write]")!.disabled).toBe(false);
});

it("isolates pending keys from old panel capture/bubble listeners, then restores them on rejection", async () => {
  const pending = deferred(); m.action.mockReturnValue(pending.promise);
  await act(async () => root.render(createElement(OperationScope, { scope: "store-a" }, createElement(OldPanelFixture))));
  await choose("分店 B");
  const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  await act(async () => host.querySelector("dialog")!.dispatchEvent(escape));
  expect(escape.defaultPrevented).toBe(true);
  expect(host.querySelector("[data-old-panel-open]")?.getAttribute("data-old-panel-open")).toBe("true");
  const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
  await act(async () => host.querySelector("dialog")!.dispatchEvent(tab));
  expect(tab.defaultPrevented).toBe(false);
  await act(async () => pending.resolve({ success: false, error: "拒絕" }));
  expect(host.querySelector("[data-old-panel-open]")?.getAttribute("data-old-panel-open")).toBe("true");
  await act(async () => host.querySelector("main")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(host.querySelector("[data-old-panel-open]")?.getAttribute("data-old-panel-open")).toBe("false");
});

it("skips the current store and leaves a declined unsaved-draft switch untouched", async () => {
  await render("store-a", true); await choose("我的店"); expect(m.action).not.toHaveBeenCalled();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  try {
    await choose("分店 B"); expect(confirm).toHaveBeenCalledOnce(); expect(m.action).not.toHaveBeenCalled();
    expect(content().hidden).toBe(false); expect(host.querySelector("dialog")).toBeNull();
  } finally { confirm.mockRestore(); }
});
