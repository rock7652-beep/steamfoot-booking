// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/booking-month-read", () => ({ readBookingMonth: mocks.read }));
vi.mock("@/app/(dashboard)/dashboard/bookings/bookings-manager", async () => {
 const { useBookingMonthNavigation } = await import("@/app/(dashboard)/dashboard/bookings/booking-month-context");
 return { BookingsManager: ({ year, month }: { year: number; month: number }) => {
  const nav = useBookingMonthNavigation()!;
  return React.createElement("div", null, `loaded ${year}-${month}`,
   React.createElement("button", { onClick: () => nav.navigate(year, month + 1) }, "next"),
   React.createElement("button", { onClick: () => nav.navigate(year, month - 1) }, "previous"),
   React.createElement("button", { onClick: () => nav.invalidate() }, "mutate"));
 } };
});
import { BookingMonthWorkspace } from "@/app/(dashboard)/dashboard/bookings/booking-month-workspace";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const snapshot = { monthData: [], monthSchedule: {} };
afterEach(() => { vi.useRealTimers(); mocks.read.mockReset(); });
function setup() {
 const container = document.createElement("div");
 const root = createRoot(container);
 act(() => root.render(React.createElement(BookingMonthWorkspace, { year: 2026, month: 9, ...snapshot, servicePlans: [], storeId: "test" })));
 const click = (name: string) => act(() => { const button = [...container.querySelectorAll("button")].find(b => b.textContent === name || b.getAttribute("aria-label") === name)!; button.click(); });
 return { container, root, click };
}
it("does not preload during first render and shows a prepared month before its refresh resolves", async () => {
 vi.useFakeTimers(); mocks.read.mockResolvedValue(snapshot);
 const { container, root, click } = setup();
 try {
  expect(mocks.read).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
  expect(mocks.read.mock.calls.map(([arg]) => arg.month)).toEqual([8, 10]);
  mocks.read.mockImplementation(() => new Promise(() => {}));
  click("next"); expect(container.textContent).toContain("loaded 2026-10");
 } finally { act(() => root.unmount()); }
});
it("shows a loading month immediately and ignores an older navigation response", async () => {
 const resolves: Array<(value: typeof snapshot) => void> = [];
 mocks.read.mockImplementation(() => new Promise(resolve => resolves.push(resolve)));
 const { container, root, click } = setup();
 try {
  click("next"); expect(container.textContent).toContain("2026 年 10 月");
  expect(container.textContent).toContain("預約載入中");
  click("下個月"); expect(container.textContent).toContain("2026 年 11 月");
  await act(async () => resolves[1](snapshot)); expect(container.textContent).toContain("loaded 2026-11");
  await act(async () => resolves[0](snapshot)); expect(container.textContent).toContain("loaded 2026-11");
 } finally { act(() => root.unmount()); }
});
it("invalidates prepared months after a mutation and distinguishes read failure from an empty month", async () => {
 vi.useFakeTimers(); mocks.read.mockResolvedValue(snapshot);
 const { container, root, click } = setup();
 try {
  await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
  click("mutate"); mocks.read.mockRejectedValue(Error("offline"));
  await act(async () => click("next"));
  expect(container.textContent).toContain("尚無法判斷本月預約");
  expect(container.textContent).not.toContain("loaded 2026-10");
 } finally { act(() => root.unmount()); }
});
