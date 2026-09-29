// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ index:vi.fn().mockResolvedValue({success:false}), replace: vi.fn(), search: vi.fn().mockResolvedValue({success:true,rows:[],hasMore:false}), params: new URLSearchParams("view=customers&staff=owner&page=3"), path: "/s/course-test/admin/dashboard/courses" }));
vi.mock("@/server/actions/course-browse", () => ({ searchCourseCustomers: m.search, loadCourseCustomerSearchIndex:m.index }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: m.replace }), usePathname: () => m.path, useSearchParams: () => m.params }));
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: ({ children }: { children: React.ReactNode }) => React.createElement("span", null, children) }));
vi.mock("@/components/navigation-notice", () => ({ NavigationNotice: () => null }));
import { CustomersToolbar } from "@/app/(dashboard)/dashboard/customers/_components/customers-toolbar";
import { CourseCustomerPicker } from "@/components/admin/course-customer-picker";
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers(); m.replace.mockClear(); m.search.mockClear(); m.index.mockReset().mockResolvedValue({success:false});
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

it("complete authorized index filters immediately without a server search",async()=>{
 m.index.mockResolvedValue({success:true,scope:"user:store",complete:true,rows:[{id:"a",name:"林老師",phone:"0911222333",lineName:null},{id:"b",name:"王同學",phone:"0922333444",lineName:null}]});
 await act(async()=>root.render(React.createElement(CourseCustomerPicker,{name:"customerId"})));
 await type("林");
 expect(host.textContent).toContain("林老師");expect(host.textContent).not.toContain("王同學");expect(m.search).not.toHaveBeenCalled();
 await type("王");
 expect(host.textContent).toContain("王同學");expect(host.textContent).not.toContain("林老師");
});
it("incomplete index still queries all authorized customers",async()=>{
 m.index.mockResolvedValue({success:true,scope:"user:store",complete:false,rows:[]});
 m.search.mockResolvedValue({success:true,rows:[{id:"z",name:"遠端學員",phone:"0911111111"}],hasMore:false});
 await act(async()=>root.render(React.createElement(CourseCustomerPicker,{name:"customerId"})));
 await type("遠端");await act(async()=>vi.advanceTimersByTime(250));
 expect(m.search).toHaveBeenCalledWith("遠端");expect(host.textContent).toContain("遠端學員");
});
