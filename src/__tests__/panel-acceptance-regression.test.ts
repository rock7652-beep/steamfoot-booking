// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ detail: vi.fn(), save: vi.fn(), params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/dashboard/customers", useSearchParams: () => m.params }));
vi.mock("@/server/actions/customer", () => ({ getCustomerDrawerDetailAction: m.detail, bulkUpdateCustomerAssignment: vi.fn() }));
vi.mock("@/server/actions/trial-booking", () => ({ collectTrialPayment: m.save, correctTrialCollection: m.save }));
vi.mock("@/server/actions/booking-checkout", () => ({ adjustCheckoutToPackage: m.save, adjustCheckoutToSingle: m.save }));
vi.mock("@/server/actions/slots", () => ({ fetchDaySlots: async () => ({slots:[]}) }));
vi.mock("@/server/actions/single-booking", () => ({ collectSinglePayment: m.save }));
vi.mock("@/server/actions/booking-plan-purchase", () => ({ getSingleBookingPurchasePlans: vi.fn(), purchasePlanForSingleBooking: m.save }));
vi.mock("@/server/actions/spa-checkout-compat", () => ({ settleSpaBookingWithPackage: m.save, settleSpaBookingWithPayment: m.save, settleSpaBookingWithStoredValue: m.save }));
vi.mock("@/components/admin/payment-split-fields", () => ({ PaymentSplitFields: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/customer-labels", () => ({ CustomerLabels: ({customerId, displayOnly}: {customerId:string;displayOnly?:boolean}) => React.createElement("span", {"data-read-only-labels": String(displayOnly)}, `${customerId} VIP`) }));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/customers-table", () => ({ isInactiveRow: () => false, CustomersTable: ({rows,onView}: {rows:{id:string;name:string}[];onView:(r:unknown)=>void}) => React.createElement("div", {}, rows.map(row => React.createElement("button", {key:row.id,onClick:()=>onView(row)}, row.name))) }));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/customer-detail-drawer-content", () => ({ CustomerDetailDrawerContent: ({customer}: {customer:{id:string;name:string}}) => React.createElement("p", {}, `完整 ${customer.name}`) }));
vi.mock("@/app/(dashboard)/dashboard/customers/_components/bulk-assign-bar", () => ({ BulkAssignBar: () => null }));
import { RightSheet } from "@/components/admin/right-sheet";
import { CollectTrialModal } from "@/app/(dashboard)/dashboard/bookings/collect-trial-modal";
import { CollectSingleModal } from "@/app/(dashboard)/dashboard/bookings/collect-single-modal";
import { AttendanceModal } from "@/app/(dashboard)/dashboard/bookings/attendance-modal";
import { NoShowModal } from "@/app/(dashboard)/dashboard/bookings/no-show-modal";
import { RescheduleModal } from "@/app/(dashboard)/dashboard/bookings/reschedule-modal";
import { AdjustCheckoutModal } from "@/app/(dashboard)/dashboard/bookings/adjust-checkout-modal";
import { CorrectTrialCollectionModal } from "@/app/(dashboard)/dashboard/bookings/correct-trial-collection-modal";
import { CustomersListWithDrawer } from "@/app/(dashboard)/dashboard/customers/_components/customers-list-with-drawer";
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.resetAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
});
afterEach(async () => { await act(async () => root.unmount()); document.body.innerHTML = ""; document.body.style.overflow = ""; vi.restoreAllMocks(); });
const props = { open:true, onClose:vi.fn(), bookingId:"booking", customerName:"驗收顧客", dateLabel:"2026-10-23 17:30", onCollected:vi.fn() };
const trial = { ...props, expectedAmount:499, people:1, attendedPeople:null, settings:{allowEdit:true,defaultPrice:499,minPrice:0,maxPrice:3000} };
for (const kind of ["trial", "single", "attendance", "no-show", "reschedule", "adjust", "correct"] as const) {
  it(`${kind} collection escapes the parent stacking context and cancels without a payment`, async () => {
    const parentClose = vi.fn(), childClose = vi.fn();
    // eslint-disable-next-line react/no-children-prop
    const parent = React.createElement(RightSheet, {key:"parent",open:true,presentation:"centered",onClose:parentClose,children:React.createElement("button", {}, "原預約")});
    await act(async () => root.render(parent));
    const shared = {key:"child",open:true,onClose:childClose,onConfirm:m.save};
    const children = {
      trial: React.createElement(CollectTrialModal, {...trial,...shared}),
      single: React.createElement(CollectSingleModal, {...props,...shared,defaultPrice:799}),
      attendance: React.createElement(AttendanceModal, {...shared,people:2}),
      "no-show": React.createElement(NoShowModal, shared),
      reschedule: React.createElement(RescheduleModal, {...shared,currentDate:"2026-10-23",currentSlotTime:"17:30",people:1}),
      adjust: React.createElement(AdjustCheckoutModal, {...props,...shared,onAdjusted:m.save}),
      correct: React.createElement(CorrectTrialCollectionModal, {...trial,...shared,originalTransactionId:"tx",originalAmount:499,originalMethod:"CASH",originalDate:"2026-10-23",onCorrected:m.save}),
    };
    const child = children[kind];
    await act(async () => root.render([parent, child]));
    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
    expect(dialogs).toHaveLength(2);
    expect(host.contains(dialogs[1])).toBe(false);
    expect(dialogs[1].getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialogs[1].contains(document.activeElement)).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape",cancelable:true}));
    expect(childClose).toHaveBeenCalledTimes(1); expect(parentClose).not.toHaveBeenCalled();
    const cancel = Array.from(dialogs[1].querySelectorAll("button")).find(x => x.textContent === "取消")!;
    await act(async () => cancel.click());
    expect(childClose).toHaveBeenCalledTimes(2); expect(m.save).not.toHaveBeenCalled();
  });
}
function deferred() { let resolve!: (value:unknown)=>void; const promise = new Promise(r=>{resolve=r;}); return {resolve,promise}; }
it("shows the selected row identity and labels immediately and ignores another customer's late detail", async () => {
  const first = deferred(), second = deferred(); m.detail.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const rows = [{id:"A",name:"顧客甲",phone:"0900000001",lineName:"甲"},{id:"B",name:"顧客乙",phone:"0900000002",lineName:"乙"}];
  await act(async () => root.render(React.createElement(CustomersListWithDrawer,{rows:rows as never,hasActiveFilters:false,basePath:"/dashboard",plans:[],canDiscount:false,staffOptions:[],canAssign:false,canEditNote:false})));
  await act(async () => host.querySelectorAll("button")[0].click());
  expect(host.querySelector('h2')?.textContent).toBe("顧客甲");
  expect(host.querySelector('[data-read-only-labels="true"]')?.textContent).toBe("A VIP");
  await act(async () => host.querySelectorAll("button")[1].click());
  expect(host.querySelector('h2')?.textContent).toBe("顧客乙");
  expect(host.querySelector('[data-read-only-labels="true"]')?.textContent).toBe("B VIP");
  await act(async () => first.resolve({success:true,data:{id:"A",name:"顧客甲"}}));
  expect(host.textContent).not.toContain("完整 顧客甲");
  await act(async () => second.resolve({success:true,data:{id:"B",name:"顧客乙"}}));
  expect(host.textContent).toContain("完整 顧客乙");
});
