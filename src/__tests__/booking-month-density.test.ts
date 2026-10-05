// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { BookingCalendarDesktop } from "../app/(dashboard)/dashboard/bookings/booking-calendar-desktop";

vi.mock("@/components/dashboard-link", () => ({ DashboardLink: "a" }));
vi.mock("../app/(dashboard)/dashboard/bookings/booking-month-link", () => ({ BookingMonthLink: "a" }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const host = document.createElement("div");
document.body.append(host);
const root = createRoot(host);
afterEach(() => act(() => root.render(null)));

it("shows five entries and expands the rest without selecting the date by keyboard", () => {
  const onDaySelect = vi.fn();
  const onBookingClick = vi.fn();
  const bookings = Array.from({ length: 8 }, (_, i) => ({
    id: `booking-${i}`, slotTime: "17:30", customerName: `顧客${i}`,
    bookingStatus: "PENDING", isMakeup: false, people: 1,
    staffId: null, staffName: null, staffColor: null,
  }));
  act(() => root.render(createElement(BookingCalendarDesktop, {
    year: 2026, month: 10, selectedDate: null, onDaySelect, onBookingClick,
    monthData: [{ date: "2026-10-06", totalBookingCount: 8, totalPeople: 8,
      staffBookings: [], bookings }],
  })));
  const cell = host.querySelector('[aria-label="2026-10-06 的預約"]')!;
  expect(cell.querySelectorAll('button[title^="17:30"]')).toHaveLength(5);
  const more = cell.querySelector('button[title="展開全部預約"]')!;
  act(() => more.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(onDaySelect).not.toHaveBeenCalled();
  act(() => more.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(more.getAttribute("aria-expanded")).toBe("true");
  expect(cell.querySelectorAll('button[title^="17:30"]')).toHaveLength(8);
  act(() => cell.querySelectorAll('button[title^="17:30"]')[7].dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(onBookingClick).toHaveBeenCalledWith("booking-7");
  expect(onDaySelect).not.toHaveBeenCalled();
  expect(more.getAttribute("aria-expanded")).toBe("false");
});

it("renders only the weeks required by a month, including six-week months", () => {
  for (const [month, expected] of [[2, 28], [10, 35], [8, 42]]) {
    act(() => root.render(createElement(BookingCalendarDesktop, {
      year: 2026, month, monthData: [], selectedDate: null, onDaySelect: vi.fn(),
    })));
    const day = host.querySelector('[aria-label$=" 的預約"]')!;
    expect(day.parentElement!.children).toHaveLength(expected);
  }
});
