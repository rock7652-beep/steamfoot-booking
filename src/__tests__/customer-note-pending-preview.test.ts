// @vitest-environment jsdom
vi.mock("@/components/admin/store-member-connection-panel", () => ({ StoreMemberConnectionPanel: () => null }));
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NoteSaveResult } from "@/components/operations/retained-note-editor";

const m = vi.hoisted(() => ({ steam: vi.fn(), spa: vi.fn(), onSaved: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/customers", useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/actions/customer", () => ({ updateCustomerServiceNoteAction: m.steam }));
vi.mock("@/server/actions/spa-customer-profile", () => ({ saveSpaCustomerNote: m.spa }));
vi.mock("@/components/frontend-preview/quick-link", () => ({ FrontendPreviewQuickLink: () => null }));
vi.mock("@/components/customer-detail-fields", () => ({ CustomerPhoneLink: () => null, CustomerDetailFields: () => null }));
vi.mock("@/components/customer-labels", () => ({ CustomerLabels: () => null }));
vi.mock("@/components/customer-attribution-form", () => ({ CustomerAttributionForm: () => null }));
vi.mock("@/components/customer-page-link", () => ({ CustomerPageLink: ({ children }: { children: React.ReactNode }) => React.createElement("span", {}, children) }));
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: ({ children }: { children: React.ReactNode }) => React.createElement("span", {}, children) }));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/customer-status-badge", () => ({ CustomerStatusBadge: () => null }));
vi.mock("@/app/(dashboard)/dashboard/_components/trial-booking-drawer", () => ({ TrialBookingDrawer: () => null }));
vi.mock("@/app/(dashboard)/dashboard/customers/[id]/assign-plan-form", () => ({ AssignPlanForm: () => null }));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/add-spa-staff-button", () => ({ AddSpaStaffButton: () => null }));

vi.mock("@/app/(dashboard)/dashboard/customers/_components/customer-panel-advanced", () => ({ CustomerPanelAdvanced: () => null }));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/customer-panel-records", () => ({ CustomerPanelRecordsList: () => null }));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/customer-panel-summary", () => ({ CustomerPanelSummaryView: () => null }));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/customer-panel-sessions", () => ({ CustomerPanelSessions: () => null }));
vi.mock("@/app/(dashboard)/dashboard/customers/[id]/create-booking-form", () => ({ CreateBookingForm: () => null }));
vi.mock("@/app/(dashboard)/dashboard/customers/[id]/edit/edit-customer-form", () => ({ EditCustomerForm: () => null }));
vi.mock("@/app/(dashboard)/dashboard/customers/[id]/adjust-wallet-form", () => ({ AdjustWalletForm: () => null }));
vi.mock("@/app/(dashboard)/dashboard/customers/[id]/extend-wallet-expiry-form", () => ({ ExtendWalletExpiryForm: () => null }));
vi.mock("@/app/(dashboard)/dashboard/customers/[id]/backfill-used-sessions-form", () => ({ BackfillUsedSessionsForm: () => null }));

import { OperationScope } from "@/components/operations/operation-scope";
import { BookingServiceNoteEditor } from "@/app/(dashboard)/dashboard/bookings/booking-service-note-editor";
import { CustomerDetailDrawerContent } from "@/app/(dashboard)/dashboard/customers/_components/customer-detail-drawer-content";
import { SpaCustomerOverview } from "@/app/(dashboard)/dashboard/customers/_components/spa-customer-overview";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  sessionStorage.clear();
  vi.resetAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

type Module = "steam" | "spa";
type Options = { scope?: string; id?: string; value?: string | null; canEdit?: boolean; readOnly?: boolean };
async function render(module: Module, { scope = "user:store-a", id = "a", value = "original", canEdit = true, readOnly = false }: Options = {}) {
  const steamCustomer = {
    id, storeId: "store-a", name: `顧客 ${id}`, phone: null, lineUserId: null, lineLinkStatus: "UNLINKED", authSource: "MANUAL",
    customerStage: "ACTIVE", serviceNote: value, planWallets: [],
    _count: { planWallets: 0, sponsoredCustomers: 0, bookings: 0 }, createdAt: new Date(), updatedAt: new Date(),
  } as unknown as React.ComponentProps<typeof CustomerDetailDrawerContent>["customer"];
  const spaCustomer = { id, name: `顧客 ${id}`, lastVisit: null, nextVisit: null } as React.ComponentProps<typeof SpaCustomerOverview>["customer"];
  const spaProfile: React.ComponentProps<typeof SpaCustomerOverview>["profile"] = {
    success: true, customer: { id, name: `顧客 ${id}`, phone: "0900000000", serviceNote: value, updatedAt:new Date(), email:null,gender:null,birthday:null,height:null,lineName:null }, bookings: [],
  };
  const child = module === "steam"
    ? React.createElement(CustomerDetailDrawerContent, {
        customer: steamCustomer, plans: [], canDiscount: false, canAssign: false, canEditNote: canEdit,
        readOnly, staffOptions: [], onClose: vi.fn(), onMutated: m.onSaved, titleId: "customer-title",
      })
    : React.createElement(SpaCustomerOverview, {
        customer: spaCustomer, profile: spaProfile, canEdit: canEdit && !readOnly,
        canBook: false, canReadBookings: false, canManageStaff: false, onSaved: m.onSaved,
      });
  // Match the production account/store boundary; each editor keys its customer internally.
  await act(async () => root.render(React.createElement(OperationScope, { key: scope, scope }, child)));
}
function button(text: string) { return [...host.querySelectorAll("button")].find(item => item.textContent === text); }
async function click(text: string) { await act(async () => button(text)!.click()); }
async function enter(text: string) {
  if (!host.querySelector("textarea")) await click(button("編輯") ? "編輯" : "＋新增");
  const input = host.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function deferred() {
  let resolve!: (result: NoteSaveResult) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<NoteSaveResult>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function expectedInput(module: Module, serviceNote: string | null, previous: string | null = "original") {
  return module === "steam"
    ? { customerId: "a", serviceNote, expectedServiceNote: previous }
    : { customerId: "a", serviceNote: serviceNote ?? "", previousNote: previous };
}

describe.each<Module>(["steam", "spa"])("%s customer note pending preview", module => {
  it("previews once on same-tick double click and waits for confirmation before callback or undo", async () => {
    const pending = deferred();
    m[module].mockReturnValue(pending.promise);
    await render(module);
    await enter("updated note");
    expect(host.querySelector("textarea")?.maxLength).toBe(module === "steam" ? 1000 : 2000);
    const submit = button("儲存")!;
    await act(async () => { submit.click(); submit.click(); });
    expect(m[module]).toHaveBeenCalledExactlyOnceWith(expectedInput(module, "updated note"));
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.querySelector('[role="status"]')?.textContent).toBe("儲存中…");
    expect(host.textContent).toContain("updated note");
    expect(button("復原")).toBeUndefined();
    expect(m.onSaved).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ success: true }));
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(button("復原")).toBeDefined();
    expect(m.onSaved).toHaveBeenCalledOnce();
    await render(module, { id: "b" });
    await render(module, { value: "updated note" });
    expect(host.querySelector("textarea")).toBeNull();
  });

  it.each(["rejected", "offline"])("restores the draft and committed preview on %s, without retrying automatically", async failure => {
    const pending = deferred();
    m[module].mockReturnValue(pending.promise);
    await render(module);
    await enter("unsaved draft");
    await click("儲存");
    await act(async () => {
      if (failure === "offline") pending.reject(new Error("offline"));
      else pending.resolve({ success: false, error: "登入已過期，尚未儲存" });
    });
    expect(host.querySelector("textarea")?.value).toBe("unsaved draft");
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(button("復原")).toBeUndefined();
    expect(m.onSaved).not.toHaveBeenCalled();
    await act(async () => window.dispatchEvent(new Event("online")));
    expect(m[module]).toHaveBeenCalledOnce();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await click("取消");
    expect(host.textContent).toContain("original");
    expect(host.textContent).not.toContain("unsaved draft");
  });

  it("preserves the exact conflict expectation and requires review before retry", async () => {
    m[module].mockResolvedValueOnce({ success: false, error: "已由其他人更新", currentValue: "colleague" }).mockResolvedValueOnce({ success: true });
    await render(module);
    await enter("my draft");
    await click("儲存");
    expect(host.querySelector("textarea")?.value).toBe("my draft");
    expect(host.textContent).toContain("colleague");
    expect(button("儲存")?.disabled).toBe(true);
    expect(m.onSaved).not.toHaveBeenCalled();
    await click("保留我的輸入，繼續編輯");
    await click("儲存");
    expect(m[module]).toHaveBeenLastCalledWith(expectedInput(module, "my draft", "colleague"));
    expect(m.onSaved).toHaveBeenCalledOnce();
  });

  it("keeps an empty pending preview distinct from a confirmed clear and restores it with compare-and-set undo", async () => {
    const pending = deferred();
    m[module].mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ success: true });
    await render(module);
    await enter("  ");
    await click("儲存");
    expect(m[module]).toHaveBeenLastCalledWith(expectedInput(module, null));
    expect(host.querySelector('[role="status"]')?.textContent).toBe("儲存中…");
    expect(host.textContent).not.toContain("original");
    expect(button("復原")).toBeUndefined();
    await act(async () => pending.resolve({ success: true }));
    await click("復原");
    expect(m[module]).toHaveBeenLastCalledWith(expectedInput(module, "original", null));
    expect(button("復原")).toBeUndefined();
    expect(host.textContent).toContain("original");
  });

  it("submits Undo only once in the same tick and keeps its restoration pending until confirmed", async () => {
    const undo = deferred();
    m[module].mockResolvedValueOnce({ success: true }).mockReturnValueOnce(undo.promise);
    await render(module);
    await enter("saved change");
    await click("儲存");
    const restore = button("復原")!;
    await act(async () => { restore.click(); restore.click(); });
    expect(m[module]).toHaveBeenCalledTimes(2);
    expect(m[module]).toHaveBeenLastCalledWith(expectedInput(module, "original", "saved change"));
    expect(host.querySelector('[role="status"]')?.textContent).toBe("儲存中…");
    expect(host.textContent).toContain("original");
    expect(button("復原")).toBeUndefined();
    expect(m.onSaved).toHaveBeenCalledOnce();
    await act(async () => undo.resolve({ success: true }));
    expect(m.onSaved).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(button("復原")).toBeUndefined();
  });

  it("retains unsaved drafts through close/reopen and server refresh without sending a write", async () => {
    await render(module);
    await enter("retained draft");
    await render(module, { value: "refreshed server note" });
    expect(host.querySelector("textarea")?.value).toBe("retained draft");
    await act(async () => root.render(null));
    await render(module);
    expect(host.querySelector("textarea")?.value).toBe("retained draft");
    expect(m[module]).not.toHaveBeenCalled();
  });

  it.each([true, false])("ignores an old A response (success=%s) after A→B→A while the newer save is pending", async success => {
    const old = deferred();
    const latest = deferred();
    m[module].mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    await render(module);
    await enter("old A draft");
    await click("儲存");
    await render(module, { id: "b", value: "B note" });
    expect(host.textContent).toContain("B note");
    expect(host.textContent).not.toContain("old A draft");
    await render(module);
    expect(host.querySelector("textarea")?.value).toBe("old A draft");
    await enter("new A draft");
    await click("儲存");
    await act(async () => old.resolve({ success, error: "old conflict", currentValue: "old server note" }));
    expect(host.querySelector('[role="status"]')?.textContent).toBe("儲存中…");
    expect(host.textContent).toContain("new A draft");
    expect(host.textContent).not.toContain("old conflict");
    expect(m.onSaved).not.toHaveBeenCalled();
    expect(button("復原")).toBeUndefined();
    await act(async () => latest.resolve({ success: true }));
    expect(m.onSaved).toHaveBeenCalledOnce();
    expect(host.textContent).toContain("new A draft");
    expect(m[module]).toHaveBeenCalledTimes(2);
  });

  it.each(["user:store-b", "other-user:store-a"])("keeps pending and retained content isolated from %s and ignores the old result after returning", async scope => {
    const pending = deferred();
    m[module].mockReturnValue(pending.promise);
    await render(module);
    await enter("private draft");
    await click("儲存");
    await render(module, { scope, value: "other scope note" });
    expect(host.textContent).not.toContain("private draft");
    expect(host.querySelector("textarea")).toBeNull();
    await render(module);
    expect(host.querySelector("textarea")?.value).toBe("private draft");
    await act(async () => pending.resolve({ success: true }));
    expect(host.querySelector("textarea")?.value).toBe("private draft");
    expect(m.onSaved).not.toHaveBeenCalled();
    expect(button("復原")).toBeUndefined();
  });

  it("does not roll back a refreshed authoritative value when an older request fails", async () => {
    const pending = deferred();
    m[module].mockReturnValue(pending.promise);
    await render(module);
    await enter("my draft");
    await click("儲存");
    await render(module, { value: "new authoritative note" });
    await act(async () => pending.resolve({ success: false, error: "尚未儲存" }));
    expect(host.querySelector("textarea")?.value).toBe("my draft");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await click("取消");
    expect(host.textContent).toContain("new authoritative note");
    expect(m.onSaved).not.toHaveBeenCalled();
  });

  it.each([{ canEdit: false }, { readOnly: true }])("keeps a read-only customer note non-editable (%j)", async options => {
    await render(module, options);
    expect(button("編輯")).toBeUndefined();
    expect(button("＋新增")).toBeUndefined();
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.textContent).toContain("original");
    expect(m[module]).not.toHaveBeenCalled();
  });
});

it("keeps the existing booking editor default non-optimistic", async () => {
  const pending = deferred();
  m.steam.mockReturnValue(pending.promise);
  await act(async () => root.render(React.createElement(BookingServiceNoteEditor, {
    customerId: "a", value: "original", canEdit: true, onSaved: m.onSaved,
  })));
  await enter("booking edit");
  await click("儲存");
  expect(host.querySelector("textarea")?.value).toBe("booking edit");
  expect(host.querySelector("textarea")?.disabled).toBe(true);
  expect(button("儲存中…")?.disabled).toBe(true);
  expect(host.querySelector('[role="status"]')).toBeNull();
  expect(m.onSaved).not.toHaveBeenCalled();
  await act(async () => pending.resolve({ success: true }));
  expect(m.onSaved).toHaveBeenCalledExactlyOnceWith("booking edit");
});
