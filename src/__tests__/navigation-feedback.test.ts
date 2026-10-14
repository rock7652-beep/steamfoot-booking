// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), replace: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: m.success, error: m.error } }));
vi.mock("next/navigation", () => ({
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams(location.search),
  useRouter: () => ({ replace: m.replace }),
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: Record<string, unknown>) => {
    delete props.prefetch;
    return React.createElement("a", props, children as React.ReactNode);
  },
  useLinkStatus: () => ({ pending: false }),
}));
import { FormSuccessToast } from "@/components/form-success-toast";
import { FormErrorToast } from "@/components/form-error-toast";
import { AppLink } from "@/components/app-link";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root, host: HTMLDivElement;
beforeEach(() => { vi.clearAllMocks(); host = document.createElement("div"); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); });

it("consumes success and error once without navigating or losing filters and hash", async () => {
  history.replaceState(null, "", "/s/test/admin/dashboard/cashbook?month=2026-10&saved=已新增&cashDrawerError=尚未開啟#entries");
  await act(async () => root.render(React.createElement(React.StrictMode, null,
    React.createElement(FormSuccessToast), React.createElement(FormErrorToast))));
  expect(m.success).toHaveBeenCalledExactlyOnceWith("已新增");
  expect(m.error).toHaveBeenCalledExactlyOnceWith("尚未開啟");
  expect(location.pathname + location.search + location.hash).toBe("/s/test/admin/dashboard/cashbook?month=2026-10#entries");
  expect(m.replace).not.toHaveBeenCalled();
});

it("does not repeat feedback on rerender or refresh", async () => {
  history.replaceState(null, "", "/dashboard/customers?saved=已新增");
  await act(async () => root.render(React.createElement(FormSuccessToast)));
  await act(async () => root.render(React.createElement(FormSuccessToast)));
  expect(m.success).toHaveBeenCalledTimes(1);
  expect(location.search).toBe("");
  expect(m.replace).not.toHaveBeenCalled();
});

it("ignores repeat clicks on the current page while retaining modified clicks and callbacks", async () => {
  history.replaceState(null, "", "/dashboard/courses?view=settings&section=booking");
  const onClick = vi.fn();
  await act(async () => root.render(React.createElement(AppLink, { href: location.href, onClick }, "設定")));
  const link = host.querySelector("a")!;
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  await act(async () => { link.dispatchEvent(click); });
  expect(click.defaultPrevented).toBe(true);
  expect(onClick).toHaveBeenCalledTimes(1);
  const modified = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
  await act(async () => { link.dispatchEvent(modified); });
  expect(modified.defaultPrevented).toBe(false);
});
