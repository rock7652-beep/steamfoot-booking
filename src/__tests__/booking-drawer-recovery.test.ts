// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { BookingDrawerPayload } from "@/server/actions/booking-drawer";
const mocks = vi.hoisted(() => ({ read: vi.fn(), complete: vi.fn() }));
vi.mock("@/server/actions/booking", () => ({ markCompleted: mocks.complete, markNoShow: vi.fn(), cancelBooking: vi.fn(), revertBookingStatus: vi.fn(), updateBooking: vi.fn() }));
vi.mock("@/server/actions/booking-drawer", () => ({ fetchBookingDetail: mocks.read }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/admin/right-sheet", () => ({ RightSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? children : null }));
vi.mock("@/components/customer-page-link", () => ({ CustomerPageLink: ({children}: {children: React.ReactNode}) => children }));
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: ({children}: {children: React.ReactNode}) => children }));
vi.mock("@/app/(dashboard)/dashboard/bookings/booking-note-editor", () => ({ BookingNoteEditor: () => null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/booking-service-note-editor", () => ({ BookingServiceNoteEditor: () => null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/no-show-modal", () => ({ NoShowModal: () => null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/collect-trial-modal", () => ({ CollectTrialModal: () => null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/correct-trial-collection-modal", () => ({ CorrectTrialCollectionModal: () => null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/attendance-modal", () => ({ AttendanceModal: () => null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/collect-single-modal", () => ({ CollectSingleModal: () => null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/adjust-checkout-modal", () => ({ AdjustCheckoutModal: () => null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/reschedule-modal", () => ({ RescheduleModal: () => null }));
import { BookingDetailDrawer } from "@/app/(dashboard)/dashboard/bookings/booking-detail-drawer";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
function bookingPayload(): BookingDrawerPayload {
  return {
    booking: {
      id: "booking-cross-date",
      bookingDate: "2026-07-20",
      slotTime: "10:00",
      bookingStatus: "PENDING",
      bookingType: "PACKAGE_SESSION",
      people: 1,
      isMakeup: false,
      isCheckedIn: false,
      notes: null,
      customer: {
        id: "customer-cross-date",
        name: "Cross-date fixture",
        phone: "test-only",
        serviceNote: null,
      },
      revenueStaff: null,
      serviceStaff: null,
      servicePlan: {
        id: "plan-cross-date",
        name: "Test plan",
        price: 0,
        sessionCount: 2,
        category: "PACKAGE",
      },
      customerPlanWallet: {
        id: "wallet-cross-date",
        remainingSessions: 1,
        totalSessions: 2,
        expiryDate: "2026-12-31",
        plan: { name: "Test plan" },
      },
      makeupCreditLinks: [],
      walletSessions: [{ id: "session-cross-date", status: "RESERVED" }],
      expectedAmount: null,
      attendedPeople: null,
    },
    customerSummary: {
      totalBookings: 1,
      lastVisit: null,
      isNewCustomer: true,
    },
    trial: null,
    single: null,
    checkout: null,
    checkoutToSingle: null,
  };
}


it("does not let A's late recovery overwrite B after switching bookings", async () => {
  const a = bookingPayload();
  const b = { ...bookingPayload(), booking: { ...a.booking, id: "booking-b", customer: { ...a.booking.customer, name: "Customer B" } } };
  const completedA = { ...a, booking: { ...a.booking, bookingStatus: "COMPLETED", isCheckedIn: true } };
  let rejectWrite!: (error: Error) => void;
  mocks.complete.mockImplementation(() => new Promise((_resolve, reject) => { rejectWrite = reject; }));
  mocks.read.mockImplementation(async (id: string) => id === b.booking.id ? b : completedA);
  const cache = { get: (id: string) => id === b.booking.id ? b : a, load: vi.fn(async (id: string) => id === b.booking.id ? b : a), invalidate: vi.fn() };
  const onUpdated = vi.fn();
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = (id: string) => root.render(React.createElement(BookingDetailDrawer, { open: true, bookingId: id, cache: cache as never, onClose: vi.fn(), onUpdated }));
  try {
    await act(async () => render(a.booking.id));
    const complete = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("完成服務"))!;
    expect(complete).toBeDefined();
    await act(async () => complete.click());
    expect(mocks.complete).toHaveBeenCalledOnce();
    await act(async () => render(b.booking.id));
    expect(container.textContent).toContain("Customer B");
    await act(async () => { rejectWrite(Error("lost response")); });
    expect(mocks.read).toHaveBeenCalledWith(a.booking.id, undefined);
    expect(onUpdated).toHaveBeenCalledWith(a.booking.id, "COMPLETED");
    expect(container.textContent).toContain("Customer B");
    expect(container.textContent).not.toContain("Cross-date fixture");
    const bComplete = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("完成服務"))!;
    expect(bComplete.disabled).toBe(false);
    expect(mocks.complete).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); }
});

it("automatically checks first and the fallback only reads without completing twice", async () => {
  mocks.complete.mockReset(); mocks.read.mockReset();
  const payload = bookingPayload();
  mocks.read.mockResolvedValue(payload);
  mocks.complete.mockRejectedValue(Error("lost response"));
  const onUpdated = vi.fn();
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(React.createElement(BookingDetailDrawer, { open: true, bookingId: payload.booking.id, onClose: vi.fn(), onUpdated })));
    const complete = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("完成服務"))!;
    await act(async () => complete.click());
    expect(mocks.read).toHaveBeenCalledTimes(2);
    expect(onUpdated).not.toHaveBeenCalled();
    expect(complete.disabled).toBe(true);
    const check = [...container.querySelectorAll("button")].find(button => button.textContent === "查看最新狀態")!;
    expect(check).toBeDefined();
    mocks.read.mockResolvedValue({ ...payload, booking: { ...payload.booking, bookingStatus: "COMPLETED", isCheckedIn: true } });
    await act(async () => check.click());
    expect(mocks.complete).toHaveBeenCalledOnce();
    expect(onUpdated).toHaveBeenCalledWith(payload.booking.id, "COMPLETED");
    expect(container.textContent).not.toContain("查看最新狀態");
  } finally { await act(async () => root.unmount()); }
});
