// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CustomerRow } from "@/app/(dashboard)/dashboard/customers/_components/customers-table";

const m = vi.hoisted(() => ({ refresh: vi.fn(), detail: vi.fn(), params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }), usePathname: () => "/dashboard/customers", useSearchParams: () => m.params }));
vi.mock("@/server/actions/customer", () => ({ getCustomerDrawerDetailAction: m.detail, bulkUpdateCustomerAssignment: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/admin/right-sheet", () => ({ RightSheet: ({ open, children }: {open: boolean; children: React.ReactNode}) => open ? React.createElement("section", null, children) : null }));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/customers-table", () => ({
  isInactiveRow: () => false,
  CustomersTable: ({rows, onView}: {rows: CustomerRow[]; onView: (row: CustomerRow) => void}) => React.createElement("div", null, ...rows.map(row => React.createElement("button", {key: row.id, onClick: () => onView(row)}, `view ${row.name} ${row.serviceNote}`))),
}));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/customer-detail-drawer-content", () => ({
  CustomerDetailDrawerContent: ({customer, onMutated, onClose}: {customer: {name: string}; onMutated: () => void; onClose: () => void}) => React.createElement("div", null,
    React.createElement("strong", null, customer.name),
    React.createElement("button", {onClick: onMutated}, "saved"),
    React.createElement("button", {onClick: onClose}, "close")),
}));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/customer-drawer-skeleton", () => ({ CustomerDrawerSkeleton: () => React.createElement("span", null, "loading") }));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/bulk-assign-bar", () => ({ BulkAssignBar: () => null }));
import { CustomersListWithDrawer } from "@/app/(dashboard)/dashboard/customers/_components/customers-list-with-drawer";
import { PanelReadProvider } from "@/components/operations/panel-read-cache";

let host: HTMLDivElement, root: Root;
const rows = [{id: "a", name: "A", serviceNote: "old"}, {id: "b", name: "B", serviceNote: "old"}] as CustomerRow[];
async function render(nextRows = rows) {
  await act(async () => root.render(React.createElement(PanelReadProvider, null,
    React.createElement(CustomersListWithDrawer, {rows: nextRows, hasActiveFilters: false, basePath: "/dashboard", plans: [], staffOptions: [], canDiscount: false, canAssign: false, canEditNote: true}))));
}
async function click(text: string) {
  const button = Array.from(host.querySelectorAll("button")).find(b => b.textContent === text);
  expect(button).toBeDefined();
  await act(async () => button!.click());
}
beforeEach(() => {
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
  m.refresh.mockReset(); m.detail.mockReset(); m.params = new URLSearchParams();
  m.detail.mockImplementation(async (id: string) => ({success: true, data: {id, name: id.toUpperCase()}}));
  window.history.replaceState(null, "", "/dashboard/customers?search=kept");
  host = document.createElement("div"); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); });

it("refreshes the list after saving and keeps the current customer and filter", async () => {
  await render(); await click("view A old"); await click("saved");
  expect(m.refresh).toHaveBeenCalledTimes(1);
  expect(m.detail).toHaveBeenCalledTimes(2);
  await render(rows.map(row => ({...row, serviceNote: "new"})));
  expect(host.textContent).toContain("view A new");
  expect(host.querySelector("strong")?.textContent).toBe("A");
  expect(new URLSearchParams(window.location.search).get("search")).toBe("kept");
});

it("does not reopen a closed drawer when the refreshed rows arrive with old params", async () => {
  await render(); await click("view A old"); m.params = new URLSearchParams(window.location.search);
  await click("saved"); await click("close");
  await render(rows.map(row => ({...row, serviceNote: "new"})));
  expect(host.querySelector("section")).toBeNull();
});

it("keeps the newly selected customer when the saved customer's rows refresh arrives", async () => {
  await render(); await click("view A old"); m.params = new URLSearchParams(window.location.search);
  await click("saved"); await click("view B old");
  await render(rows.map(row => ({...row, serviceNote: "new"})));
  expect(host.querySelector("strong")?.textContent).toBe("B");
});
