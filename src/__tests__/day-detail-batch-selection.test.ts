// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DayDetailPanel, type DayBooking } from "@/app/(dashboard)/dashboard/bookings/day-detail-panel";

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
afterEach(async () => { await act(async () => root.unmount()); root = createRoot(container); });
function booking(id: string, status = "PENDING", people = 1): DayBooking {
  return {id, slotTime:"10:00", people, attendedPeople:null, isMakeup:id === "a", isCheckedIn:false,
    bookingStatus:status, bookingType:"PACKAGE_SESSION", expectedAmount:null, trialDefaultPrice:null,
    collected:false, collectedAmount:null, customer:{name:id, phone:"0900000000", validPackageSessions:10},
    revenueStaff:null, serviceStaff:null, servicePlan:null, customerPlanWallet:null};
}
const rows = [booking("a", "PENDING", 2), booking("b", "CONFIRMED"), booking("c", "COMPLETED"), booking("d", "CANCELED")];
const click = async (text: string) => {
  const button = Array.from(document.querySelectorAll("button")).find(node => node.textContent === text);
  expect(button).toBeTruthy(); await act(async () => button!.click());
};

it("offers full selection before selecting a row and keeps day totals while filtered", async () => {
  const selectAll = vi.fn();
  await act(async () => root.render(React.createElement(DayDetailPanel, {date:"2026-10-06",bookings:rows.slice(0,2),allBookings:rows,filteredFrom:4,slots:[],selectedIds:new Set<string>(),onToggleSelect:vi.fn(),onClearSelection:vi.fn(),onCompleteBatch:vi.fn(),onSelectAllActionable:selectAll})));
  expect(container.textContent).toContain("預約 4 筆・共 5 人");
  expect(container.textContent).toContain("其中補課 2 人");
  expect(container.textContent).toContain("符合 2 筆");
  expect(container.textContent).not.toContain("當日統計");
  await click("批次完成");
  const checkbox = container.querySelector<HTMLInputElement>('[aria-label="全選目前清單可完成的預約"]')!;
  expect(checkbox.disabled).toBe(false);
  await act(async () => checkbox.click());
  expect(selectAll).toHaveBeenCalledOnce();
  expect(container.querySelector('[title="完成服務"]')).toBeNull();
});

it("shows partial selection and requires confirmation without submitting on cancel", async () => {
  const complete = vi.fn(); const clear = vi.fn();
  const props = {date:"2026-10-06",bookings:rows,slots:[],selectedIds:new Set(["a"]),onToggleSelect:vi.fn(),onClearSelection:clear,onCompleteBatch:complete,onSelectAllActionable:vi.fn()};
  await act(async () => root.render(React.createElement(DayDetailPanel,props)));
  await click("批次完成");
  expect(container.querySelector<HTMLInputElement>('[aria-label="全選目前清單可完成的預約"]')!.indeterminate).toBe(true);
  expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(3); // header + two eligible rows
  await click("完成所選（1 筆）");
  expect(document.body.textContent).toContain("10/6・已選 1 筆預約，共 2 人。");
  expect(complete).not.toHaveBeenCalled();
  await click("返回"); expect(complete).not.toHaveBeenCalled();
  await click("完成所選（1 筆）"); await click("確認完成");
  expect(complete).toHaveBeenCalledOnce();
  await act(async () => root.render(React.createElement(DayDetailPanel,{...props,batchActing:true})));
  expect(container.querySelector<HTMLInputElement>('[aria-label="全選目前清單可完成的預約"]')!.disabled).toBe(true);
});

it("does not expose batch writes in HQ read-only mode", async () => {
  await act(async () => root.render(React.createElement(DayDetailPanel,{date:"2026-10-06",bookings:rows,slots:[],readOnly:true,selectedIds:new Set<string>(),onToggleSelect:vi.fn(),onClearSelection:vi.fn(),onCompleteBatch:vi.fn()})));
  expect(container.textContent).not.toContain("批次完成");
  expect(container.querySelector('input[type="checkbox"]')).toBeNull();
});
