// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.query) }));
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
