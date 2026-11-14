// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ query: "", router: { replace: vi.fn((url: string) => window.history.replaceState(null, "", url)) } }));
vi.mock("next/navigation", () => ({ useRouter: () => state.router, useSearchParams: () => new URLSearchParams(state.query) }));
import { useCustomerPanelUrl } from "@/app/(dashboard)/dashboard/courses/use-customer-panel-url";

it("keeps the latest panel identity through a late route refresh and preserves filters", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.createElement("div"));
  function Harness({ id }: { id: string | null }) { useCustomerPanelUrl(true, id); return null; }
  async function render(id: string | null, query: string) {
    state.query = query;
    window.history.replaceState(null, "", `/dashboard/courses?${query}#notes`);
    await act(async () => root.render(createElement(Harness, { id })));
  }
  await render("a", "view=customers&search=demo");
  await render(null, "view=customers&search=demo&customerId=a");
  expect(new URLSearchParams(window.location.search).has("customerId")).toBe(false);
  await render("b", "view=customers&search=demo");
  // A request started for a completes after b was opened.
  await render("b", "view=customers&search=demo&customerId=a");
  expect(new URLSearchParams(window.location.search).get("customerId")).toBe("b");
  expect(new URLSearchParams(window.location.search).get("search")).toBe("demo");
  expect(window.location.hash).toBe("#notes");
  await render(null, "view=customers&search=demo&customerId=b");
  await render(null, "view=customers&search=demo&customerId=a");
  expect(new URLSearchParams(window.location.search).has("customerId")).toBe(false);
  await act(async () => root.unmount());
});


it("synchronizes the section and record type in one router navigation without scrolling", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.router.replace.mockClear();
  state.query = "view=customers&customerId=a&studentTab=info&search=lesson";
  window.history.replaceState(null, "", `/s/music/admin/dashboard/courses?${state.query}#notes`);
  const root = createRoot(document.createElement("div"));
  function Harness() { useCustomerPanelUrl(true, "a", "records", "bookings"); return null; }
  try {
    await act(async () => root.render(createElement(Harness)));
    expect(state.router.replace).toHaveBeenCalledTimes(1);
    const [href, options] = state.router.replace.mock.calls[0] as unknown as [string, {scroll:boolean}];
    const url = new URL(href, window.location.origin);
    expect(url.pathname).toBe("/s/music/admin/dashboard/courses");
    expect(url.searchParams.get("studentTab")).toBe("records");
    expect(url.searchParams.get("studentRecords")).toBe("bookings");
    expect(url.searchParams.get("search")).toBe("lesson");
    expect(url.hash).toBe("#notes");
    expect(options).toEqual({scroll:false});
  } finally { await act(async () => root.unmount()); }
});
