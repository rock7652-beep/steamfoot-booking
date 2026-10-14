// @vitest-environment jsdom
import React, { act, useEffect, useState, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn(), success: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => m, unstable_rethrow: () => {} }));
vi.mock("sonner", () => ({ toast: { success: m.success } }));
import { useRouter } from "@/components/use-stable-router";
import { QueryForm } from "@/components/query-form";
import { useInPlaceAction } from "@/components/operations/use-in-place-action";
import { backgroundRefreshAllowed } from "@/lib/background-refresh";
import type { ActionResult } from "@/types";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root, host: HTMLDivElement, router: ReturnType<typeof useRouter>;
function RouterFixture() { const stable = useRouter(); useEffect(() => { router = stable; }, [stable]); return null; }
beforeEach(() => { vi.clearAllMocks(); history.replaceState(null, "", "/s/demo/admin/dashboard/courses?view=settings"); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
it("retains store and HQ routes, avoids duplicate navigation, keeps query scroll and honors explicit options", async () => {
  await act(async () => root.render(React.createElement(RouterFixture)));
  await act(async () => router.push("/dashboard/courses?view=settings"));
  expect(m.push).not.toHaveBeenCalled();
  await act(async () => router.push("/dashboard/courses?view=catalog"));
  expect(m.push).toHaveBeenCalledWith("/s/demo/admin/dashboard/courses?view=catalog", { scroll: false });
  await act(async () => router.replace("?view=catalog", { scroll: true }));
  expect(m.replace).toHaveBeenCalledWith("?view=catalog", { scroll: true });
  history.replaceState(null, "", "/hq/dashboard/courses");
  router.prefetch("/dashboard/customers");
  expect(m.prefetch).toHaveBeenCalledWith("/hq/dashboard/customers", undefined);
  await act(async () => router.push("/dashboard/customers"));
  expect(m.push).toHaveBeenLastCalledWith("/hq/dashboard/customers", undefined);
  router.back(); expect(m.back).toHaveBeenCalledOnce();
});
it("submits GET filters without document navigation and retains repeated query values", async () => {
  await act(async () => root.render(React.createElement(QueryForm, null,
    React.createElement("input", { name: "label", defaultValue: "A" }),
    React.createElement("input", { name: "label", defaultValue: "B" }))));
  const event = new Event("submit", { bubbles: true, cancelable: true });
  await act(async () => { host.querySelector("form")!.dispatchEvent(event); });
  expect(event.defaultPrevented).toBe(true);
  expect(m.push).toHaveBeenCalledWith("/s/demo/admin/dashboard/courses?label=A&label=B", { scroll: false });
});
function CashFixture({ save }: { save: (previous: ActionResult<unknown> | null, data: FormData) => Promise<ActionResult<unknown>> }) {
  const action = useInPlaceAction(save, location.pathname + location.search, "已新增收支");
  return React.createElement("form", { key: action.formVersion, action: action.formAction, onSubmit: action.onSubmit },
    React.createElement("input", { name: "amount", defaultValue: "" }),
    React.createElement("button", { type: "submit", disabled: action.pending }, "新增"),
    action.state?.success === false && React.createElement("p", { role: "alert" }, action.state.error));
}
it("updates cash in place, clears confirmed fields, and accepts a second entry without locking the form", async () => {
  const save = vi.fn().mockResolvedValue({ success: true, data: { entryId: "confirmed" } });
  await act(async () => root.render(React.createElement(CashFixture, { save })));
  for (const amount of ["100", "200"]) {
    host.querySelector("input")!.value = amount;
    await act(async () => host.querySelector("button")!.click());
    expect(host.querySelector("input")!.value).toBe("");
    expect(host.querySelector("button")!.disabled).toBe(false);
  }
  expect(save).toHaveBeenCalledTimes(2);
  expect(m.refresh).toHaveBeenCalledTimes(2);
  expect(m.replace).not.toHaveBeenCalled(); expect(m.push).not.toHaveBeenCalled();
  expect(m.success).toHaveBeenCalledTimes(2);
});
it("retains entered money and error after rejection or uncertain response", async () => {
  const save = vi.fn().mockResolvedValueOnce({ success: false, error: "金額有誤" }).mockRejectedValueOnce(new Error("offline"));
  await act(async () => root.render(React.createElement(CashFixture, { save })));
  host.querySelector("input")!.value = "123";
  await act(async () => host.querySelector("button")!.click());
  expect(host.textContent).toContain("金額有誤"); expect(host.querySelector("input")!.value).toBe("123");
  await act(async () => host.querySelector("button")!.click());
  expect(host.textContent).toContain("尚未確認送出結果"); expect(host.querySelector("input")!.value).toBe("123");
  expect(m.refresh).not.toHaveBeenCalled(); expect(m.success).not.toHaveBeenCalled();
});
it("keeps already visible content while a refresh suspends", async () => {
  let resolve!: () => void;
  const deferred = new Promise<void>(done => { resolve = done; });
  let ready = false;
  function Read({ version }: { version: number }) { if (version && !ready) throw deferred; return React.createElement("p", null, `課表 ${version}`); }
  function Page() {
    const stable = useRouter(); const [version, setVersion] = useState(0);
    m.refresh.mockImplementation(() => setVersion(1));
    return React.createElement(React.Fragment, null,
      React.createElement("button", { onClick: () => stable.refresh() }, "更新"),
      React.createElement(Suspense, { fallback: React.createElement("p", null, "空白讀取中") }, React.createElement(Read, { version })));
  }
  await act(async () => root.render(React.createElement(Page)));
  await act(async () => host.querySelector("button")!.click());
  expect(host.textContent).toContain("課表 0"); expect(host.textContent).not.toContain("空白讀取中");
  await act(async () => { ready = true; resolve(); await deferred; });
  expect(host.textContent).toContain("課表 1");
});
it("pauses automatic refresh during editing and modal display", () => {
  expect(backgroundRefreshAllowed()).toBe(true);
  const input = document.createElement("input"); host.append(input); input.focus();
  expect(backgroundRefreshAllowed()).toBe(false); input.blur();
  const dialog = document.createElement("section"); dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true"); host.append(dialog);
  expect(backgroundRefreshAllowed()).toBe(false);
});
