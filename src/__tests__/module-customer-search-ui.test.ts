// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ replace: vi.fn(), search: vi.fn().mockResolvedValue({success:true,rows:[],hasMore:false}), params: new URLSearchParams("view=customers&staff=owner&page=3"), path: "/s/course-test/admin/dashboard/courses" }));
vi.mock("@/server/actions/course-browse", () => ({ searchCourseCustomers: m.search }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: m.replace }), usePathname: () => m.path, useSearchParams: () => m.params }));
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: ({ children }: { children: React.ReactNode }) => React.createElement("span", null, children) }));
vi.mock("@/components/navigation-notice", () => ({ NavigationNotice: () => null }));
import { CustomersToolbar } from "@/app/(dashboard)/dashboard/customers/_components/customers-toolbar";
import { SpaCustomerList } from "@/app/(dashboard)/dashboard/customers/_components/spa-customer-list";
import { CourseCustomerPicker } from "@/components/admin/course-customer-picker";
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers(); m.replace.mockClear(); m.search.mockClear();
  m.params = new URLSearchParams("view=customers&staff=owner&page=3");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); });
async function type(value: string) {
  const input = host.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return input;
}
it("course search waits for completed Chinese input, preserves filters and resets pagination without opening a customer", async () => {
  await act(async () => root.render(React.createElement(CustomersToolbar, { staffOptions: [], basePath: "/dashboard/courses?view=customers", courseMode: true })));
  const input = host.querySelector('input')!;
  await act(async () => input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })));
  await type("黃");
  await act(async () => vi.advanceTimersByTime(400));
  expect(m.replace).not.toHaveBeenCalled();
  await act(async () => input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })));
  await act(async () => vi.advanceTimersByTime(250));
  expect(m.replace).toHaveBeenCalledTimes(1);
  const params = new URL(m.replace.mock.calls[0][0], "https://example.com").searchParams;
  expect(params.get("search")).toBe("黃"); expect(params.get("staff")).toBe("owner");
  expect(params.get("view")).toBe("customers"); expect(params.has("page")).toBe(false); expect(params.has("customerId")).toBe(false);
});
it("SPA auto filters the existing list without selecting a result", async () => {
  m.path = "/s/spa-test/admin/dashboard/customers";
  const props = { customers: [], search: "", permissions: { canCreate: false, canReadBookings: false, canReadAccounts: false, canSell:false, canRefund:false, canEdit:false, canBook:false, canManageStaff:false }, onOpen: vi.fn(), onPrefetch: vi.fn() };
  await act(async () => root.render(React.createElement(SpaCustomerList, props as React.ComponentProps<typeof SpaCustomerList>)));
  await type("0911");
  await act(async () => vi.advanceTimersByTime(250));
  expect(m.replace).toHaveBeenCalledTimes(1);
  expect(new URL(m.replace.mock.calls[0][0], "https://example.com").searchParams.get("search")).toBe("0911");
  expect(props.onOpen).not.toHaveBeenCalled();
});

it("course picker waits for IME completion and Enter never submits or selects", async () => {
  const selected = vi.fn();
  await act(async () => root.render(React.createElement(CourseCustomerPicker, { name: "customerId", onChange: selected })));
  const input = host.querySelector("input")!;
  await act(async () => input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })));
  await type("黃");
  await act(async () => vi.advanceTimersByTime(300));
  expect(m.search).not.toHaveBeenCalled();
  const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  input.dispatchEvent(enter);
  expect(enter.defaultPrevented).toBe(true);
  expect(selected).not.toHaveBeenCalled();
  await act(async () => input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })));
  await act(async () => vi.advanceTimersByTime(250));
  expect(m.search).toHaveBeenCalledWith("黃");
});
