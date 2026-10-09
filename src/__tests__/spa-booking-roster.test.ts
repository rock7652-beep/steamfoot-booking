// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
vi.mock("@/components/customer-labels", () => ({ CustomerLabels: () => null }));
import { SpaBookingRoster } from "@/app/(dashboard)/dashboard/spa-schedule/booking-roster";
import type { SpaScheduleBooking } from "@/server/queries/spa-schedule";

it("keeps SPA time, service, staff, location, receipt and full notes without writing on close", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const onOpen = vi.fn();
  const booking: SpaScheduleBooking = { id: "synthetic", customerId: "customer", serviceStaffId: "staff", serviceLocationId: "room", serviceName: "示範服務", startTime: "10:00", endTime: "11:00", status: "COMPLETED", totalPrice: 1200, notes: "本次完整備註\n最後一行", treatmentIds: [], updatedAt: "2026-10-08T02:00:00Z", receipt: {id: "receipt", amount: 1200, paymentMethod: "CASH", paidAt: "2026-10-08T02:00:00Z", refunded: true} };
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(SpaBookingRoster, {bookings: [booking], customers: [{id: "customer", name: "示範顧客", phone: "0900000000", serviceNote: "平時完整備註"}], staff: [{id: "staff", name: "示範技師"}], locations: [{id: "room", name: "示範房間"}], canUpdate: true, onOpen})));
    for (const text of ["10:00–11:00", "示範服務", "示範技師", "示範房間", "已退款 NT$1,200"]) expect(host.textContent).toContain(text);
    expect(host.querySelectorAll("[data-roster-reminders]")).toHaveLength(1);
    expect(host.querySelector('button[aria-label="示範顧客 本次備註"]')).toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="示範顧客 標籤與備註"]')!.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(booking.notes);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("平時完整備註");
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true})));
    expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(onOpen).not.toHaveBeenCalled();
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="示範顧客 預約詳情"]')!.click());
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(booking);
  } finally { await act(async () => root.unmount()); host.remove(); }
});
