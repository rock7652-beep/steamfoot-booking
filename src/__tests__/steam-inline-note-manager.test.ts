// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DayDetailPanel } from "@/app/(dashboard)/dashboard/bookings/day-detail-panel";
import type { BookingCalendarDesktop } from "@/app/(dashboard)/dashboard/bookings/booking-calendar-desktop";
import type { BookingDetailDrawer } from "@/app/(dashboard)/dashboard/bookings/booking-detail-drawer";
import type { NoteSaveResult } from "@/components/operations/retained-note-editor";

type PanelProps = Parameters<typeof DayDetailPanel>[0];
type CalendarProps = Parameters<typeof BookingCalendarDesktop>[0];
type DrawerProps = Parameters<typeof BookingDetailDrawer>[0];
const m = vi.hoisted(() => ({
  panel: null as PanelProps | null,
  drawer: null as DrawerProps | null,
  save: vi.fn(),
  slots: vi.fn(),
  detail: vi.fn(),
  month: vi.fn(),
  status: vi.fn(),
  navigation: { navigate: vi.fn(), invalidate: vi.fn(), busy: vi.fn() },
  labels: { enabled: false, assignments: {} },
}));

vi.mock("@/server/actions/booking-note", () => ({ updateBookingNoteAction: m.save }));
vi.mock("@/server/actions/booking", () => ({ markCompletedBatch: m.status }));
vi.mock("@/lib/booking-client-transport", () => ({
  readBookingSlots: m.slots, readBookingDetail: m.detail, updateBookingStatus: m.status,
}));
vi.mock("@/lib/booking-month-read", () => ({ readBookingMonth: m.month }));
vi.mock("@/components/customer-labels", () => ({
  CustomerLabelsSeed: ({ children }: { children: ReactNode }) => children,
  useSeedCustomerLabels: () => undefined,
  useCustomerLabelSnapshot: () => m.labels,
  CustomerLabelsSettingsLink: () => null,
  CustomerLabelPicker: () => null,
}));
vi.mock("@/components/customer-list-identity", () => ({ CustomerListIdentity: () => null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/booking-month-context", () => ({
  useBookingMonthNavigation: () => m.navigation,
}));
vi.mock("@/app/(dashboard)/dashboard/bookings/booking-month-link", () => ({ BookingMonthLink: () => null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/day-detail-panel", () => ({
  // Capture the real owner's rows and callback; no save logic is implemented here.
  DayDetailPanel: (props: PanelProps) => { m.panel = props; return null; },
}));
vi.mock("@/app/(dashboard)/dashboard/bookings/booking-calendar-desktop", () => ({
  BookingCalendarDesktop: ({ monthData, onDaySelect }: CalendarProps) => createElement("div", {},
    monthData.map(day => createElement("button", {
      key: day.date, "data-date": day.date, onClick: () => onDaySelect(day.date),
    }, day.date))),
}));
vi.mock("@/app/(dashboard)/dashboard/bookings/booking-detail-drawer", () => ({
  BookingDetailDrawer: (props: DrawerProps) => { m.drawer = props; return null; },
}));
vi.mock("@/app/(dashboard)/dashboard/bookings/day-slot-manager", () => ({ DaySlotManager: () => null }));
vi.mock("@/components/admin/right-sheet", () => ({
  RightSheet: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/bookings" }));

import { BookingsManager, type BookingsManagerProps } from "@/app/(dashboard)/dashboard/bookings/bookings-manager";

type Booking = NonNullable<BookingsManagerProps["monthData"][number]["bookings"]>[number];
const dateA = "2026-10-09";
const dateB = "2026-10-10";
function booking(id: string): Booking {
  return {
    id, slotTime: "10:00", bookingStatus: "PENDING", isMakeup: false, isCheckedIn: false,
    people: 1, recurrenceIndex: null, recurrenceTotalOccurrences: null, customerConfirmedAt: null,
    attendedPeople: null, bookingType: "PACKAGE_SESSION", expectedAmount: null,
    trialDefaultPrice: null, collected: false, collectedAmount: null, notes: "Original booking note",
    customerName: "Synthetic customer", staffId: null, staffName: null, staffColor: null,
    customer: {
      id: "synthetic-customer", name: "Synthetic customer", phone: "", notes: "Customer note",
      serviceNote: "Customer service note", assignedStaff: null, validPackageSessions: 10,
    },
    revenueStaff: null, serviceStaff: null, servicePlan: null, customerPlanWallet: null,
  };
}
function inputs(): BookingsManagerProps {
  return {
    storeId: "synthetic-steam-store", year: 2026, month: 10, monthSchedule: {}, servicePlans: [],
    canEditBookingNote: true,
    monthData: [
      { date: dateA, totalBookingCount: 2, totalPeople: 2, staffBookings: [], bookings: [booking("first"), booking("sibling")] },
      { date: dateB, totalBookingCount: 1, totalPeople: 1, staffBookings: [], bookings: [booking("other-day")] },
    ],
  };
}
function deferred() {
  let resolve!: (result: NoteSaveResult) => void;
  const promise = new Promise<NoteSaveResult>(done => { resolve = done; });
  return { promise, resolve };
}
function panel() {
  expect(m.panel).not.toBeNull();
  return m.panel!;
}
function row(id = "first") {
  const found = panel().bookings.find(booking => booking.id === id);
  expect(found).toBeDefined();
  return found!;
}
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.resetAllMocks();
  m.panel = null;
  m.drawer = null;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-09T00:00:00Z"));
  sessionStorage.clear();
  m.slots.mockResolvedValue({ slots: [] });
  m.detail.mockResolvedValue(null);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});
async function selectDate(date: string) {
  await act(async () => host.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)!.click());
  expect(panel().date).toBe(date);
}
async function render(props = inputs()) {
  await act(async () => root.render(createElement(BookingsManager, props)));
  await selectDate(dateA);
}

it("keeps the newer same-booking note when an older save response arrives last", async () => {
  const older = deferred();
  const newer = deferred();
  m.save.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
  const props = inputs();
  await render(props);
  const firstSave = panel().onSaveBookingNote!;
  let firstPending!: Promise<NoteSaveResult>;
  let firstSettled = false;
  await act(async () => {
    firstPending = firstSave("first", "Older saved note", "Original booking note");
    void firstPending.then(() => { firstSettled = true; });
  });
  expect(firstSettled).toBe(false);
  expect(row().notes).toBe("Original booking note");

  // Capture the next render's callback while the earlier request is still pending.
  await act(async () => root.render(createElement(BookingsManager, { ...props })));
  const secondSave = panel().onSaveBookingNote!;
  expect(secondSave).not.toBe(firstSave);
  let secondPending!: Promise<NoteSaveResult>;
  await act(async () => { secondPending = secondSave("first", "Newer saved note", "Older saved note"); });
  await act(async () => { newer.resolve({ success: true }); await secondPending; });
  expect(firstSettled).toBe(false);
  expect(row().notes).toBe("Newer saved note");
  expect(row("sibling").notes).toBe("Original booking note");
  expect(m.navigation.invalidate).toHaveBeenCalledTimes(1);

  await act(async () => { older.resolve({ success: true }); await firstPending; });
  expect(firstSettled).toBe(true);
  expect(row().notes).toBe("Newer saved note");
  expect(row("sibling").notes).toBe("Original booking note");
  expect(m.navigation.invalidate).toHaveBeenCalledTimes(1);
  expect(m.save).toHaveBeenNthCalledWith(1, { bookingId: "first", notes: "Older saved note", expectedNotes: "Original booking note" });
  expect(m.save).toHaveBeenNthCalledWith(2, { bookingId: "first", notes: "Newer saved note", expectedNotes: "Older saved note" });
  expect(m.month).not.toHaveBeenCalled();
  expect(m.status).not.toHaveBeenCalled();
});

it("ignores a pending date-A save after navigating A to B and back to A", async () => {
  const oldScope = deferred();
  m.save.mockReturnValueOnce(oldScope.promise);
  await render();
  let pending!: Promise<NoteSaveResult>;
  await act(async () => { pending = panel().onSaveBookingNote!("first", "Old scope note", "Original booking note"); });
  await selectDate(dateB);
  expect(row("other-day").notes).toBe("Original booking note");
  await selectDate(dateA);
  await act(async () => { oldScope.resolve({ success: true }); await pending; });
  expect(row().notes).toBe("Original booking note");
  expect(m.navigation.invalidate).not.toHaveBeenCalled();

  m.save.mockResolvedValueOnce({ success: true });
  await act(async () => { await panel().onSaveBookingNote!("first", "Current scope note", "Original booking note"); });
  expect(row().notes).toBe("Current scope note");
  expect(m.navigation.invalidate).toHaveBeenCalledTimes(1);
});

it("patches only notes onto current rows, preserving status and customer changes made while saving", async () => {
  const save = deferred();
  m.save.mockReturnValueOnce(save.promise);
  const props = inputs();
  await render(props);
  let pending!: Promise<NoteSaveResult>;
  await act(async () => { pending = panel().onSaveBookingNote!("first", "Saved booking note", "Original booking note"); });

  const currentRows = props.monthData.map(day => ({
    ...day,
    bookings: day.bookings!.map(booking => ({
      ...booking, bookingStatus: "CONFIRMED", people: 2,
      customer: { ...booking.customer, notes: "Updated customer note", serviceNote: "Updated service note" },
    })),
  }));
  await act(async () => root.render(createElement(BookingsManager, { ...props, monthData: currentRows })));
  const current = row();
  const sibling = row("sibling");
  expect(current.bookingStatus).toBe("CONFIRMED");
  expect(current.customer.serviceNote).toBe("Updated service note");
  await act(async () => { save.resolve({ success: true }); await pending; });
  expect(row()).toEqual({ ...current, notes: "Saved booking note" });
  expect(row().customer).toBe(current.customer);
  expect(row("sibling")).toEqual(sibling);
  expect(m.status).not.toHaveBeenCalled();
  expect(m.month).not.toHaveBeenCalled();
});

it("keeps a newer detail-editor note when an earlier inline response arrives afterward", async () => {
  const inline = deferred();
  m.save.mockReturnValueOnce(inline.promise);
  await render();
  let pending!: Promise<NoteSaveResult>;
  await act(async () => {
    pending = panel().onSaveBookingNote!("first", "Older inline note", "Original booking note");
  });
  await act(async () => panel().onBookingClick!("first"));
  expect(m.drawer?.open).toBe(true);
  expect(m.drawer?.bookingId).toBe("first");
  const detailSaved = m.drawer!.onNotesUpdated!;
  await act(async () => detailSaved({ kind: "booking", bookingId: "first", value: "Newer detail note" }));
  expect(row().notes).toBe("Newer detail note");
  expect(m.navigation.invalidate).toHaveBeenCalledTimes(1);

  await act(async () => { inline.resolve({ success: true }); await pending; });
  expect(row().notes).toBe("Newer detail note");
  expect(row("sibling").notes).toBe("Original booking note");
  expect(m.navigation.invalidate).toHaveBeenCalledTimes(1);
  expect(m.save).toHaveBeenCalledTimes(1);
  expect(m.status).not.toHaveBeenCalled();
  expect(m.month).not.toHaveBeenCalled();
});
