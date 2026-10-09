// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import type { SpaBookingRoster } from "@/app/(dashboard)/dashboard/spa-schedule/booking-roster";
type RosterProps = Parameters<typeof SpaBookingRoster>[0];
const m = vi.hoisted(() => ({ props: null as RosterProps | null, refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), reader: { read: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh, push: m.push, replace: m.replace }), usePathname: () => "/dashboard/spa-schedule" }));
vi.mock("@/app/(dashboard)/dashboard/spa-schedule/booking-roster", () => ({ SpaBookingRoster: (props: RosterProps) => { m.props = props; return null; } }));
vi.mock("@/components/operations/panel-read-cache", () => ({ usePanelReader: () => m.reader }));
vi.mock("@/components/customer-labels", () => ({ CustomerLabels: () => null }));
vi.mock("@/server/actions/customer", () => ({ createCustomer: vi.fn() }));
vi.mock("@/server/actions/spa-service-staff", () => ({ getSpaAvailableProviders: vi.fn() }));
vi.mock("@/server/actions/spa-booking", () => ({ createSpaGroupBookingAction: vi.fn(), createSpaBookingAction: vi.fn(), updateSpaBookingAction: vi.fn(), cancelSpaBookingAction: vi.fn() }));
vi.mock("@/app/(dashboard)/dashboard/spa-schedule/customer-picker", () => ({ SpaCustomerPicker: () => null }));
vi.mock("@/app/(dashboard)/dashboard/spa-schedule/booking-summary", () => ({ SpaBookingSummary: () => null }));
vi.mock("@/app/(dashboard)/dashboard/spa-schedule/checkout-panel", () => ({ SpaCheckoutPanel: () => null }));
vi.mock("@/components/admin/right-sheet", () => ({ RightSheet: () => null }));
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: () => null }));
import { SpaScheduleWorkspace } from "@/app/(dashboard)/dashboard/spa-schedule/workspace";
const booking = { id: "booking", customerId: "customer", serviceStaffId: "staff", serviceLocationId: "room", serviceName: "示範服務", startTime: "10:00", endTime: "11:00", status: "CONFIRMED", totalPrice: 1200, notes: "原備註", treatmentIds: [], updatedAt: "2026-10-08T02:00:00.000Z" };
const input = { storeId: "spa-store", date: "2026-10-08", bookings: [booking], staff: [], customers: [], treatments: [], locations: [], canCreate: true, canUpdate: true, canCheckout: true };
const savedAt = "2026-10-08T02:01:00.000Z";
beforeEach(() => { vi.clearAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); });
it("patches only this row and revision, retains page position, and survives stale revalidation", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    const props = { ...input, bookings: [booking, { ...booking, id: "unrelated" }] };
    await act(async () => root.render(createElement(SpaScheduleWorkspace, props)));
    const details = host.querySelector("details")!; details.open = true; host.scrollTop = 210;
    await act(async () => m.props!.onNotesSaved("booking", "已儲存", savedAt, booking.updatedAt));
    expect(m.props!.bookings[0]).toEqual({ ...booking, notes: "已儲存", updatedAt: savedAt });
    expect(m.props!.bookings[1]).toEqual(props.bookings[1]);
    expect(host.querySelector("details")).toBe(details); expect(details.open).toBe(true); expect(host.scrollTop).toBe(210);
    expect(m.refresh).not.toHaveBeenCalled(); expect(m.push).not.toHaveBeenCalled(); expect(m.replace).not.toHaveBeenCalled();
    await act(async () => root.render(createElement(SpaScheduleWorkspace, { ...props, bookings: [...props.bookings] })));
    expect(m.props!.bookings[0].notes).toBe("已儲存");
    await act(async () => root.render(createElement(SpaScheduleWorkspace, { ...props, bookings: [{ ...booking, notes: "更新的權威資料", updatedAt: "2026-10-08T02:02:00.000Z" }] })));
    expect(m.props!.bookings[0].notes).toBe("更新的權威資料");
  } finally { await act(async () => root.unmount()); host.remove(); }
});
it.each([{ date: "2026-10-09" }, { storeId: "another-store" }])("does not apply a previous-scope callback to a new scope: %j", async change => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(SpaScheduleWorkspace, input)));
    const oldCallback = m.props!.onNotesSaved;
    await act(async () => root.render(createElement(SpaScheduleWorkspace, { ...input, ...change })));
    await act(async () => oldCallback("booking", "舊範圍", savedAt, booking.updatedAt));
    expect(m.props!.bookings[0].notes).toBe("原備註"); expect(m.refresh).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it("patches notes without making stale service fields eligible for a full-detail overwrite", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(SpaScheduleWorkspace, input)));
    await act(async () => m.props!.onNotesSaved("booking", "新備註", savedAt, "2026-10-08T02:00:30.000Z"));
    expect(m.props!.bookings[0]).toEqual({ ...booking, notes: "新備註" });
    await act(async () => root.render(createElement(SpaScheduleWorkspace, { ...input, bookings: [{ ...booking, serviceName: "剛修改的服務", notes: "新備註", updatedAt: savedAt }] })));
    expect(m.props!.bookings[0]).toMatchObject({ serviceName: "剛修改的服務", notes: "新備註", updatedAt: savedAt });
  } finally { await act(async () => root.unmount()); host.remove(); }
});
