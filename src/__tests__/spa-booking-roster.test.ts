// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
const saveNote = vi.hoisted(() => vi.fn());
vi.mock("@/server/actions/spa-booking", () => ({ updateSpaBookingNoteAction: saveNote }));
vi.mock("@/components/customer-labels", () => ({ CustomerLabels: () => null }));
import { SpaBookingRoster } from "@/app/(dashboard)/dashboard/spa-schedule/booking-roster";
import type { SpaScheduleBooking } from "@/server/queries/spa-schedule";

it("keeps SPA time, service, staff, location, receipt and full notes without writing on close", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const onOpen = vi.fn();
  const booking: SpaScheduleBooking = { id: "synthetic", customerId: "customer", serviceStaffId: "staff", serviceLocationId: "room", serviceName: "示範服務", startTime: "10:00", endTime: "11:00", status: "COMPLETED", totalPrice: 1200, notes: "本次完整備註\n最後一行", treatmentIds: [], updatedAt: "2026-10-08T02:00:00Z", receipt: {id: "receipt", amount: 1200, paymentMethod: "CASH", paidAt: "2026-10-08T02:00:00Z", refunded: true} };
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(SpaBookingRoster, {bookings: [booking], customers: [{id: "customer", name: "示範顧客", phone: "0900000000", serviceNote: "平時完整備註"}], staff: [{id: "staff", name: "示範技師"}], locations: [{id: "room", name: "示範房間"}], canUpdate: true, onOpen, storeId: "spa-store", date: "2026-10-08", onNotesSaved: vi.fn()})));
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

const activeBooking: SpaScheduleBooking = { id: "booking", customerId: "customer", serviceStaffId: "staff", serviceLocationId: "room", serviceName: "示範服務", startTime: "10:00", endTime: "11:00", status: "CONFIRMED", totalPrice: 1200, notes: "原備註", treatmentIds: [], updatedAt: "2026-10-08T02:00:00.000Z" };
const savedAt = "2026-10-08T02:01:00.000Z";
beforeEach(() => { saveNote.mockReset(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); });
function rosterProps(overrides: Partial<Parameters<typeof SpaBookingRoster>[0]> = {}) {
  return { bookings: [activeBooking], customers: [{ id: "customer", name: "示範顧客", serviceNote: "長期備註" }], staff: [], locations: [], canUpdate: true,
    onOpen: vi.fn(), storeId: "spa-store", date: "2026-10-08", onNotesSaved: vi.fn(), ...overrides };
}
async function editInline(host: HTMLElement, text: string) {
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="示範顧客 本次備註"]')!.click());
  const textarea = host.querySelector<HTMLTextAreaElement>("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, text);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return textarea;
}
function saveButton(host: HTMLElement) {
  return Array.from(host.querySelectorAll("button")).find(button => button.textContent === "儲存")!;
}
it("edits this booking in its row and returns its successful revision without opening details", async () => {
  saveNote.mockResolvedValue({ success: true, data: { notes: "新備註\n第二行", updatedAt: savedAt, previousUpdatedAt: activeBooking.updatedAt } });
  const props = rosterProps(); const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(SpaBookingRoster, props)));
    const textarea = await editInline(host, " 新備註\n第二行 ");
    expect(textarea.maxLength).toBe(500); expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(props.onOpen).not.toHaveBeenCalled();
    await act(async () => saveButton(host).click());
    expect(saveNote).toHaveBeenCalledExactlyOnceWith({ bookingId: "booking", storeId: "spa-store", notes: "新備註\n第二行", expectedNotes: "原備註" });
    expect(props.onNotesSaved).toHaveBeenCalledExactlyOnceWith("booking", "新備註\n第二行", savedAt, activeBooking.updatedAt);
    expect(props.onOpen).not.toHaveBeenCalled(); expect(host.querySelector("textarea")).toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); }
});
it("keeps failed edits in place and preserves the existing summary", async () => {
  saveNote.mockResolvedValue({ success: false, error: "請再試一次" });
  const props = rosterProps(); const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(SpaBookingRoster, props)));
    await editInline(host, "未儲存內容"); await act(async () => saveButton(host).click());
    expect(host.querySelector("textarea")?.value).toBe("未儲存內容");
    expect(host.textContent).toContain("請再試一次"); expect(host.textContent).toContain("原備註"); expect(host.textContent).toContain("長期備註");
    expect(props.onNotesSaved).not.toHaveBeenCalled(); expect(props.onOpen).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); host.remove(); }
});
it("does not expose the pencil with read-only booking permission", async () => {
  const props = rosterProps({ canUpdate: false }); const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(SpaBookingRoster, props)));
    expect(host.querySelector('button[aria-label="示範顧客 本次備註"]')).toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="示範顧客 預約詳情"]')!.click());
    expect(props.onOpen).toHaveBeenCalledExactlyOnceWith(activeBooking);
  } finally { await act(async () => root.unmount()); host.remove(); }
});
it.each([{ date: "2026-10-09" }, { storeId: "another-store" }, { bookings: [{ ...activeBooking, id: "other-booking" }] }])("ignores late success after scope changes: %j", async change => {
  let resolve!: (result: unknown) => void;
  saveNote.mockImplementation(() => new Promise(done => { resolve = done; }));
  const props = rosterProps(); const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(SpaBookingRoster, props)));
    await editInline(host, "舊範圍備註"); await act(async () => saveButton(host).click());
    await act(async () => root.render(createElement(SpaBookingRoster, { ...props, ...change })));
    await act(async () => resolve({ success: true, data: { notes: "舊範圍備註", updatedAt: savedAt, previousUpdatedAt: activeBooking.updatedAt } }));
    expect(props.onNotesSaved).not.toHaveBeenCalled(); expect(props.onOpen).not.toHaveBeenCalled();
    expect(host.textContent).toContain("原備註");
  } finally { await act(async () => root.unmount()); host.remove(); }
});
