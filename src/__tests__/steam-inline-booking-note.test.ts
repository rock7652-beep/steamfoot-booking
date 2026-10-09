// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DayDetailPanel, type DayBooking } from "@/app/(dashboard)/dashboard/bookings/day-detail-panel";

const m = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/server/actions/booking-note", () => ({ updateBookingNoteAction: m.save }));
vi.mock("@/components/customer-labels", () => ({ CustomerLabels: () => null }));
vi.mock("@/components/admin/roster-primitives", () => ({
  RosterToolbar: ({children}: {children: React.ReactNode}) => React.createElement("div", {}, children),
  RosterNotes: () => null, RosterMoreMenu: () => null,
  rosterRowClassName: "", rosterStatusButtonClassName: "",
}));
vi.mock("@/components/customer-list-identity", () => ({ CustomerListIdentity: ({name}: {name: React.ReactNode}) => React.createElement("div", {}, name) }));
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: ({children}: {children: React.ReactNode}) => React.createElement("a", {}, children) }));
vi.mock("@/app/(dashboard)/dashboard/bookings/steam-booking-drawer", () => ({ SteamBookingDrawer: () => null }));
vi.mock("@/app/(dashboard)/dashboard/_components/trial-booking-drawer", () => ({ TrialBookingDrawer: () => null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/booking-action-feedback", () => ({ BookingActionFeedback: () => null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/people-badge", () => ({ PeopleBadge: () => null }));

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
const container = document.createElement("div"); document.body.append(container);
let root = createRoot(container);
const change = async (text: string) => { const el = container.querySelector("textarea")!; await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, text); el.dispatchEvent(new Event("input", {bubbles:true})); }); };
afterEach(async () => { await act(async () => root.unmount()); root = createRoot(container); });
function booking(id: string, status = "PENDING", people = 1): DayBooking {
  return {id, slotTime:"10:00", people, attendedPeople:null, isMakeup:id === "a", isCheckedIn:false,
    bookingStatus:status, bookingType:"PACKAGE_SESSION", expectedAmount:null, trialDefaultPrice:null,
    collected:false, collectedAmount:null, customer:{name:id, phone:"0900000000", validPackageSessions:10},
    revenueStaff:null, serviceStaff:null, servicePlan:null, customerPlanWallet:null};
}

it("steam pencil edits only the selected booking inline and saves expected note without opening details", async () => {
  const open = vi.fn(), saved = vi.fn();
  const row = {...booking("one"), notes: "old note"};
  const props = {date:"2026-10-09",bookings:[row],slots:[],noteScope:"steam:store",canEditBookingNote:true,onBookingClick:open,onBookingNoteSaved:saved};
  m.save.mockResolvedValue({success:true});
  await act(async()=>root.render(React.createElement(DayDetailPanel,props)));
  await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="one 本次備註"]')!.click());
  expect(container.querySelector("textarea")!.value).toBe("old note");
  expect(open).not.toHaveBeenCalled();
  await change("new note\nsecond line");
  await act(async()=>Array.from(container.querySelectorAll("button")).find(b=>b.textContent==="儲存")!.click());
  expect(m.save).toHaveBeenCalledExactlyOnceWith({bookingId:"one",notes:"new note\nsecond line",expectedNotes:"old note"});
  expect(saved).toHaveBeenCalledExactlyOnceWith("one","new note\nsecond line");
  expect(open).not.toHaveBeenCalled();
});
it.each([{canEditBookingNote:false,readOnly:false},{canEditBookingNote:true,readOnly:true}])("hides steam note writes without UI authority: %j",async permission=>{
  await act(async()=>root.render(React.createElement(DayDetailPanel,{date:"2026-10-09",bookings:[booking("one")],slots:[],...permission})));
  expect(container.querySelector('[aria-label="one 本次備註"]')).toBeNull();
});
