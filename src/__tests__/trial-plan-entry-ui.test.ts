// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ create: vi.fn(), error: vi.fn(), category: "SINGLE" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: m.error, success: vi.fn() } }));
vi.mock("@/server/actions/plan", () => ({ createPlan: m.create, updatePlan: vi.fn() }));
vi.mock("@/components/admin/right-sheet", () => ({ RightSheet: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/operations/use-form-draft", () => ({
  FormDraftNotice: () => null,
  useFormDraft: (_key: string, initial: Record<string, unknown>) => ({
    values: { ...initial, name: "保留的草稿", price: "499", sessionCount: "1", category: m.category },
    busy: { current: false }, mounted: { current: true }, stale: false, dirty: true,
    set: vi.fn(), clear: vi.fn(), discard: vi.fn(), expectedRevision: null,
  }),
}));
vi.mock("@/components/frontend-preview/quick-link", () => ({ FrontendPreviewQuickLink: () => null }));
vi.mock("@/components/customer-detail-fields", () => ({ CustomerPhoneLink: () => null }));
vi.mock("@/components/customer-labels", () => ({ CustomerLabels: () => null }));
vi.mock("@/components/customer-attribution-form", () => ({ CustomerAttributionForm: () => null }));
vi.mock("@/components/customer-page-link", () => ({ CustomerPageLink: ({ children }: { children: React.ReactNode }) => React.createElement("span", {}, children) }));
vi.mock("@/app/(dashboard)/dashboard/bookings/booking-service-note-editor", () => ({ BookingServiceNoteEditor: () => null }));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/customer-status-badge", () => ({ CustomerStatusBadge: () => null }));
vi.mock("@/app/(dashboard)/dashboard/_components/trial-booking-drawer", () => ({ TrialBookingDrawer: () => React.createElement("button", {}, "建立體驗預約") }));
vi.mock("@/app/(dashboard)/dashboard/customers/[id]/assign-plan-form", () => ({ AssignPlanForm: ({ defaultPlanId }: { defaultPlanId?: string }) => React.createElement("p", { "data-selected-plan": defaultPlanId }, "指派表單") }));
import { PlanFormDrawer } from "@/app/(dashboard)/dashboard/plans/_components/plan-form-drawer";
import { CustomerDetailDrawerContent } from "@/app/(dashboard)/dashboard/customers/_components/customer-detail-drawer-content";

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.clearAllMocks(); m.category = "SINGLE";
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  host = document.createElement("div"); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); });

async function renderNewPlan() {
  await act(async () => root.render(React.createElement(PlanFormDrawer, { open: true, mode: "new", plan: null, onClose: vi.fn(), onSaved: vi.fn() })));
}
it("new plan form offers only SINGLE and PACKAGE", async () => {
  await renderNewPlan();
  expect(Array.from(host.querySelectorAll("select option")).map(option => (option as HTMLOptionElement).value)).toEqual(["SINGLE", "PACKAGE"]);
});
it("retained TRIAL draft is shown as invalid and cannot submit or lose its input", async () => {
  m.category = "TRIAL";
  await renderNewPlan();
  expect(host.querySelector<HTMLOptionElement>('option[value="TRIAL"]')?.disabled).toBe(true);
  await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(m.create).not.toHaveBeenCalled();
  expect(m.error).toHaveBeenCalledWith(expect.stringContaining("建立體驗預約"));
  expect(host.querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe("保留的草稿");
});

it("keeps historical TRIAL wallets visible but offers renewal only for an available ordinary plan", async () => {
  const plans = [{ id: "package", name: "10堂", category: "PACKAGE", price: 5990, sessionCount: 10, validityDays: 180 }];
  const wallet = (id: string, name: string) => ({ id, status: "ACTIVE", sessions: [], expiryDate: null, plan: { id, name, sessionCount: 1 } });
  const customer = {
    id: "customer", storeId: "store", name: "驗收顧客", phone: null, lineUserId: null, lineLinkStatus: "UNLINKED", authSource: "MANUAL",
    customerStage: "ACTIVE", planWallets: [wallet("trial", "歷史體驗課"), wallet("package", "10堂")],
    _count: { planWallets: 2, sponsoredCustomers: 0, bookings: 1 }, createdAt: new Date(), updatedAt: new Date(),
  } as unknown as React.ComponentProps<typeof CustomerDetailDrawerContent>["customer"];
  await act(async () => root.render(React.createElement(CustomerDetailDrawerContent, { customer, plans, canDiscount: false, canAssign: false, canEditNote: false, staffOptions: [], onClose: vi.fn(), onMutated: vi.fn(), titleId: "customer-title" })));
  expect(host.textContent).toContain("歷史體驗課");
  const renewal = Array.from(host.querySelectorAll("button")).filter(button => button.textContent?.includes("續購"));
  expect(renewal).toHaveLength(1);
  expect(renewal[0].closest("li")?.textContent).toContain("10堂");
  await act(async () => renewal[0].click());
  expect(host.querySelector("[data-selected-plan]")?.getAttribute("data-selected-plan")).toBe("package");
  expect(host.textContent).toContain("建立體驗預約");
});
