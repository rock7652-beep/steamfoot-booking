// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DayDetailPanel, type DayBooking } from "@/app/(dashboard)/dashboard/bookings/day-detail-panel";

vi.mock("@/components/admin/roster-reminders", () => ({ RosterReminders: () => null }));
vi.mock("@/components/customer-list-identity", () => ({ CustomerListIdentity: ({name}: {name: React.ReactNode}) => React.createElement("div", {}, name) }));
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: ({children}: {children: React.ReactNode}) => React.createElement("a", {}, children) }));
vi.mock("@/app/(dashboard)/dashboard/bookings/steam-booking-drawer", () => ({ SteamBookingDrawer: () => null }));
vi.mock("@/app/(dashboard)/dashboard/_components/trial-booking-drawer", () => ({ TrialBookingDrawer: () => null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/booking-action-feedback", () => ({ BookingActionFeedback: () => null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/people-badge", () => ({ PeopleBadge: () => null }));

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
const container = document.createElement("div"); document.body.append(container);
let root = createRoot(container);
afterEach(async () => { await act(async () => root.unmount()); root = createRoot(container); });
function booking(id: string, status = "PENDING", people = 1): DayBooking {
  return {id, slotTime:"10:00", people, attendedPeople:null, isMakeup:id === "a", isCheckedIn:false,
    bookingStatus:status, bookingType:"PACKAGE_SESSION", expectedAmount:null, trialDefaultPrice:null,
    collected:false, collectedAmount:null, customer:{name:id, phone:"0900000000", validPackageSessions:10},
    revenueStaff:null, serviceStaff:null, servicePlan:null, customerPlanWallet:null};
}

it("puts trial no-show and cancel in the existing menu without opening details", async () => {
  const onNoShowTrial=vi.fn(), onCancelTrial=vi.fn(), onBookingClick=vi.fn();
  await act(async()=>root.render(React.createElement(DayDetailPanel,{date:"2026-10-19",slots:[],bookings:[{...booking("trial"),bookingType:"FIRST_TRIAL"}],onNoShowTrial,onCancelTrial,onBookingClick})));
  expect(document.querySelector('[role="menu"]')).toBeNull();
  await openMenu(); await click("未到"); await openMenu(); await click("取消預約");
  expect(onNoShowTrial).toHaveBeenCalledExactlyOnceWith("trial");
  expect(onCancelTrial).toHaveBeenCalledExactlyOnceWith("trial");
  expect(onBookingClick).not.toHaveBeenCalled();
});
it.each(["PENDING","CONFIRMED"])("shows both actions for active trial %s",async status=>{
 await act(async()=>root.render(React.createElement(DayDetailPanel,{date:"2026-10-19",slots:[],bookings:[{...booking("trial",status),bookingType:"FIRST_TRIAL"}],onNoShowTrial:vi.fn(),onCancelTrial:vi.fn(),onBookingClick:vi.fn()})));
 await openMenu();
 expect([...document.querySelectorAll("button")].some(b=>b.textContent==="未到")).toBe(true);
 expect([...document.querySelectorAll("button")].some(b=>b.textContent==="取消預約")).toBe(true);
});
it.each(["COMPLETED","NO_SHOW","CANCELLED"])("does not offer writes for final trial %s",async status=>{
 await act(async()=>root.render(React.createElement(DayDetailPanel,{date:"2026-10-19",slots:[],bookings:[{...booking("trial",status),bookingType:"FIRST_TRIAL"}],onNoShowTrial:vi.fn(),onCancelTrial:vi.fn(),onBookingClick:vi.fn()})));
 await openMenu();
 expect([...document.querySelectorAll("button")].some(b=>b.textContent==="未到"||b.textContent==="取消預約")).toBe(false);
});
it("hides trial writes in a read-only store view",async()=>{
 await act(async()=>root.render(React.createElement(DayDetailPanel,{readOnly:true,date:"2026-10-19",slots:[],bookings:[{...booking("trial"),bookingType:"FIRST_TRIAL"}],onNoShowTrial:vi.fn(),onCancelTrial:vi.fn(),onBookingClick:vi.fn()})));
 await openMenu();
 expect([...document.querySelectorAll("button")].some(b=>b.textContent==="未到"||b.textContent==="取消預約")).toBe(false);
});
it("locks both actions while the same booking is being saved",async()=>{
 const noShow=vi.fn(),cancel=vi.fn();
 await act(async()=>root.render(React.createElement(DayDetailPanel,{date:"2026-10-19",slots:[],actingIds:new Set(["trial"]),bookings:[{...booking("trial"),bookingType:"FIRST_TRIAL"}],onNoShowTrial:noShow,onCancelTrial:cancel,onBookingClick:vi.fn()})));
 expect(container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.disabled).toBe(true);expect(noShow).not.toHaveBeenCalled();expect(cancel).not.toHaveBeenCalled();
});
it("keeps participant-level checkout and package bookings on their existing workflow",async()=>{
 await act(async()=>root.render(React.createElement(DayDetailPanel,{date:"2026-10-19",slots:[],bookings:[booking("package"),{...booking("group"),bookingType:"FIRST_TRIAL",participantSummary:"逐人處理"}],onNoShowTrial:vi.fn(),onCancelTrial:vi.fn(),onBookingClick:vi.fn()})));
 await openMenu();
 expect([...document.querySelectorAll("button")].some(b=>b.textContent==="未到"||b.textContent==="取消預約")).toBe(false);
});
const click=async(text:string)=>{const button=[...document.querySelectorAll("button")].find(b=>b.textContent===text);expect(button).toBeTruthy();await act(async()=>button!.click());};

const openMenu=async()=>{await act(async()=>container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!.click());};
