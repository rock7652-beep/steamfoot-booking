// @vitest-environment jsdom
import React, { act, Component, type ErrorInfo } from "react";
import { jsx } from "react/jsx-runtime";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { LabelSnapshot } from "@/lib/customer-labels";
const mocks = vi.hoisted(() => ({ month: vi.fn(), slots: vi.fn(), detail: vi.fn(), labels: vi.fn(), write: vi.fn() }));
vi.mock("@/lib/booking-month-read", () => ({ readBookingMonth: mocks.month }));
vi.mock("@/lib/booking-client-transport", () => ({ readBookingSlots: mocks.slots, readBookingDetail: mocks.detail, updateBookingStatus: mocks.write }));
vi.mock("@/server/actions/booking", () => ({ markCompletedBatch: mocks.write }));
vi.mock("@/server/actions/customer-labels", () => ({ loadCustomerLabels: mocks.labels, setCustomerLabel: mocks.write, manageCustomerLabels: mocks.write }));
vi.mock("next/navigation", () => ({ usePathname: () => "/s/staging/admin/dashboard/bookings", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, prefetch: _prefetch, scroll: _scroll, onNavigate: _onNavigate, ...props }: { href: string; children: React.ReactNode; prefetch?: boolean; scroll?: boolean; onNavigate?: (event: { preventDefault: () => void }) => void }) => { void _prefetch; void _scroll; return React.createElement("a", { href, ...props, onClick: (event: React.MouseEvent) => { event.preventDefault(); _onNavigate?.({ preventDefault() {} }); } }, children); }, useLinkStatus: () => ({ pending: false }) }));
vi.mock("@/app/(dashboard)/dashboard/_components/trial-booking-drawer", () => ({ TrialBookingDrawer: () => null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/steam-booking-drawer", () => ({ SteamBookingDrawer: () => null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/booking-detail-drawer", () => ({ BookingDetailDrawer: ({ open, bookingId, onUpdated, onClose }: { open: boolean; bookingId: string; onUpdated: (id: string, status: null) => void; onClose: () => void }) => open ? React.createElement("button", { "data-fixture-payment": true, onClick: () => { onUpdated(bookingId, null); onClose(); } }, "合成逐人收款成功") : null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/day-slot-manager", () => ({ DaySlotManager: () => null }));
import { OperationScope } from "@/components/operations/operation-scope";
import { CustomerLabelsProvider } from "@/components/customer-labels";
import { BookingMonthWorkspace } from "@/app/(dashboard)/dashboard/bookings/booking-month-workspace";
import type { BookingsManagerProps } from "@/app/(dashboard)/dashboard/bookings/bookings-manager";

const date = "2026-09-24";
const labels: LabelSnapshot = { storeId: "staging-store", available: true, enabled: true, canEdit: true, canManage: true, categories: [{ id: "synthetic-category", name: "合成分類", number: 1, position: 0, active: true }], labels: [{ id: "synthetic-tag", name: "合成標籤", categoryId: "synthetic-category", active: true }], assignments: Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`synthetic-customer-${i}`, []])) };
function monthData(note = "合成本次\n第二行", count = 5): BookingsManagerProps["monthData"] {
  return [{ date, totalBookingCount: count, totalPeople: count, staffBookings: [], bookings: Array.from({ length: count }, (_, i) => ({ id: `synthetic-booking-${i}`, slotTime: "11:00", bookingStatus: i < 2 ? "COMPLETED" : "PENDING", isMakeup: false, isCheckedIn: false, people: 1, recurrenceIndex: null, recurrenceTotalOccurrences: null, customerConfirmedAt: null, attendedPeople: null, bookingType: "FIRST_TRIAL", expectedAmount: 499, trialDefaultPrice: 499, collected: i < 2, collectedAmount: i < 2 ? 499 : null, deductedPlanNames: [], notes: note, customerName: `合成顧客${i}`, staffId: null, staffName: null, staffColor: null, customer: { id: `synthetic-customer-${i}`, name: `合成顧客${i}`, phone: "", serviceNote: "合成平時\n末行", assignedStaff: null, validPackageSessions: 0 }, revenueStaff: null, serviceStaff: null, servicePlan: null, customerPlanWallet: null })) }];
}
const caught: Array<{ message: string; componentStack: string }> = [];
class TestBoundary extends Component<{ children?: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { caught.push({ message: error.message, componentStack: info.componentStack ?? "" }); }
  render() { return this.state.error ? jsx("div", { role: "alert", children: `頁級錯誤：${this.state.error.message}` }) : this.props.children; }
}
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  caught.length = 0;
  window.history.replaceState(null, "", "/s/staging/admin/dashboard/bookings?year=2026&month=9");
  sessionStorage.clear();
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-08T00:00:00Z"));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(() => [{ width: 100, height: 44 }] as unknown as DOMRectList);
  mocks.slots.mockResolvedValue({ slots: [] }); mocks.detail.mockResolvedValue(null); mocks.labels.mockResolvedValue(labels);
  mocks.month.mockImplementation(({ month }: { month: number }) => Promise.resolve({ monthData: month === 9 ? monthData("更新後合成備註") : [], monthSchedule: {}, slots: [], customerLabels: { ...labels, clientRevision: 100 } }));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host, { onCaughtError: () => {} });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
async function openDay(rows = monthData()) {
  await act(async () => root.render(jsx(TestBoundary, { children: jsx(OperationScope, { scope: "synthetic-matrix", children: jsx(CustomerLabelsProvider, { initial: { ...labels, assignments: {} }, children: jsx(BookingMonthWorkspace, { year: 2026, month: 9, storeId: "staging-store", monthData: rows, monthSchedule: {}, customerLabels: labels, servicePlans: [] }) }) }) })));
  const day = host.querySelector<HTMLElement>(`[role="button"][aria-label="${date} 的預約"]`)!;
  expect(day).not.toBeNull();
  await act(async () => day.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(host.querySelector('[aria-labelledby="day-detail-sheet-title"]')?.closest('[data-right-sheet]')?.getAttribute("aria-hidden")).toBe("false");
  expect(host.querySelectorAll("[data-batch]")).toHaveLength(rows[0].bookings!.filter(row => row.bookingStatus !== "CANCELLED").length);
}
it("keeps the five-row day roster mounted through repeated 60-second refreshes and row removal", async () => {
  await openDay();
  await act(async () => vi.advanceTimersByTimeAsync(60_100));
  expect(mocks.month).toHaveBeenCalledWith(expect.objectContaining({ month: 9, date }));
  expect(host.textContent).toContain("更新後合成備註");
  expect(host.querySelectorAll("[data-batch]")).toHaveLength(5);
  mocks.month.mockResolvedValue({ monthData: monthData("縮減後合成備註", 3), monthSchedule: {}, slots: [], customerLabels: { ...labels, clientRevision: 101 } });
  await act(async () => vi.advanceTimersByTimeAsync(60_100));
  expect(host.querySelectorAll("[data-batch]")).toHaveLength(3);
  expect(host.textContent).toContain("縮減後合成備註");
  expect(mocks.write).not.toHaveBeenCalled();
});
it("refreshes authoritative payment amounts immediately after closing a mutated drawer", async () => {
  await openDay();
  mocks.month.mockResolvedValue({ monthData: monthData("逐人收款後摘要"), monthSchedule: {}, slots: [], customerLabels: labels });
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="查看 11:00 合成顧客2 的預約詳情"]')!.click());
  const readsBeforePayment = mocks.month.mock.calls.length;
  await act(async () => host.querySelector<HTMLButtonElement>('[data-fixture-payment]')!.click());
  expect(mocks.month.mock.calls.length).toBeGreaterThan(readsBeforePayment);
  expect(host.textContent).toContain("逐人收款後摘要");
  expect(host.querySelectorAll("[data-batch]")).toHaveLength(5);
  expect(window.location.search).toBe("?year=2026&month=9");
});
it("pauses background refresh while full notes are open and preserves multiline content", async () => {
  await openDay();
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="合成顧客0 標籤與備註"]')!.click());
  const full = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(el => el.textContent?.includes("合成顧客0 · 標籤與備註"))!;
  expect(full.textContent).toContain("合成本次\n第二行");
  expect(full.textContent).toContain("合成平時\n末行");
  await act(async () => vi.advanceTimersByTimeAsync(120_100));
  expect(mocks.month.mock.calls.filter(([input]) => input.date === date)).toHaveLength(0);
  await act(async () => full.querySelector<HTMLButtonElement>("header button")!.click());
  await act(async () => vi.advanceTimersByTimeAsync(60_100));
  expect(host.textContent).toContain("更新後合成備註");
  expect(mocks.write).not.toHaveBeenCalled();
});

it("retains the visible roster on a delayed slot rejection and retries without a page-level error", async () => {
  let rejectSlots!: (error: Error) => void;
  mocks.slots.mockReturnValue(new Promise((_resolve, reject) => { rejectSlots = reject; }));
  await openDay();
  await act(async () => vi.advanceTimersByTimeAsync(30_000));
  expect(host.querySelectorAll("[data-batch]")).toHaveLength(5);
  expect(caught).toEqual([]);
  await act(async () => rejectSlots(new Error("時段暫時無法載入")));
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.textContent).toContain("時段載入失敗，已保留預約名單");
  expect(host.querySelectorAll("[data-batch]")).toHaveLength(5);
  expect(caught).toEqual([]);
  expect(mocks.month.mock.calls.filter(([input]) => input.date === date)).toHaveLength(0);
  expect(mocks.slots).toHaveBeenCalledWith(date, "staging-store");
  mocks.slots.mockResolvedValue({ slots: [] });
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "重試時段")!.click());
  expect(mocks.slots).toHaveBeenCalledTimes(2);
  expect(host.textContent).not.toContain("時段載入失敗");
  expect(host.querySelectorAll("[data-batch]")).toHaveLength(5);
  await act(async () => vi.advanceTimersByTimeAsync(60_100));
  expect(host.textContent).toContain("更新後合成備註");
  expect(caught).toEqual([]);
  expect(mocks.write).not.toHaveBeenCalled();
});

it("shows uncertainty rather than closed or zero slots when an empty day's slot read fails", async () => {
  mocks.slots.mockRejectedValue(new Error("時段暫時無法載入"));
  await openDay(monthData("", 0));
  expect(caught).toEqual([]);
  expect(host.textContent).toContain("目前無法確認可預約時段");
  expect(host.textContent).not.toContain("該日不營業");
  expect(host.textContent).not.toContain("未設定可預約時段");
  expect(mocks.write).not.toHaveBeenCalled();
});
it("survives long multiline notes, mixed status and wallet data, label enablement changes and removed assignments", async () => {
  const rows = monthData("第一行\n" + "合成長備註".repeat(3000) + "\n最後一行");
  rows[0].bookings!.forEach((row, index) => {
    row.bookingStatus = ["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW", "CANCELLED"][index];
    if (index % 2 === 0) {
      row.bookingType = "PACKAGE_SESSION";
      row.customerPlanWallet = { status: "ACTIVE", remainingSessions: 3, expiryDate: new Date("2027-01-01"), plan: { name: "合成方案" } };
    }
  });
  await openDay(rows);
  const changed = { ...labels, labels: Array.from({ length: 8 }, (_, index) => ({ id: `synthetic-tag-${index}`, name: `合成${index}`, categoryId: "synthetic-category", active: true })), assignments: { "synthetic-customer-0": Array.from({ length: 8 }, (_, index) => `synthetic-tag-${index}`) } };
  let revision = 200;
  for (const enabled of [true, false, true]) {
    mocks.month.mockResolvedValue({ monthData: rows, monthSchedule: {}, slots: [], customerLabels: { ...changed, enabled, clientRevision: ++revision } });
    await act(async () => vi.advanceTimersByTimeAsync(60_100));
    expect(host.querySelectorAll("[data-batch]")).toHaveLength(4);
    expect(caught).toEqual([]);
    expect(host.querySelector('[aria-label="合成顧客0 查看或修改標籤"]') !== null).toBe(enabled);
  }
  expect(mocks.write).not.toHaveBeenCalled();
});

it.each(["old-failure-last", "new-success-last"])("keeps the latest same-day slot result when reads settle %s", async (order) => {
  let rejectOld!: (error: Error) => void;
  let resolveNew!: (result: { slots: [] }) => void;
  mocks.slots.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectOld = reject; }))
    .mockReturnValueOnce(new Promise(resolve => { resolveNew = resolve; }));
  await openDay();
  const day = host.querySelector<HTMLElement>(`[role="button"][aria-label="${date} 的預約"]`)!;
  await act(async () => day.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(mocks.slots).toHaveBeenCalledTimes(2);
  if (order === "old-failure-last") {
    await act(async () => resolveNew({ slots: [] }));
    await act(async () => rejectOld(new Error("synthetic late old failure")));
  } else {
    await act(async () => rejectOld(new Error("synthetic old failure")));
    await act(async () => resolveNew({ slots: [] }));
  }
  expect(host.textContent).not.toContain("時段載入失敗");
  expect(host.querySelectorAll("[data-batch]")).toHaveLength(5);
  expect(caught).toEqual([]);
  // A cached successful read must survive the older rejection.
  await act(async () => day.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(mocks.slots).toHaveBeenCalledTimes(2);
  expect(mocks.write).not.toHaveBeenCalled();
});
it("does not let an old day's failure erase the current day's retry state", async () => {
  let rejectOld!: (error: Error) => void, rejectNew!: (error: Error) => void;
  mocks.slots.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectOld = reject; }))
    .mockReturnValueOnce(new Promise((_resolve, reject) => { rejectNew = reject; }));
  const rows = monthData(); rows.push({ ...monthData()[0], date: "2026-09-25", bookings: [] });
  await openDay(rows);
  await act(async () => host.querySelector<HTMLElement>('[role="button"][aria-label="2026-09-25 的預約"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  await act(async () => rejectNew(new Error("synthetic current day failure")));
  await act(async () => rejectOld(new Error("synthetic old day failure")));
  expect(host.textContent).toContain("時段載入失敗，已保留預約名單");
  expect(host.textContent).toContain("目前無法確認可預約時段");
  expect(caught).toEqual([]);
});

it("restores the retained day roster after a synthetic history Back between months without a write", async () => {
  await openDay();
  const pop = vi.fn(); window.addEventListener("popstate", pop);
  try {
    await act(async () => host.querySelector<HTMLAnchorElement>('a[aria-label="下個月"]')!.click());
    expect(window.location.search).toBe("?year=2026&month=10");
    expect(host.textContent).toContain("2026 年 10 月");
    await act(async () => { window.history.back(); await vi.advanceTimersByTimeAsync(50); });
    expect(pop).toHaveBeenCalled();
    expect(window.location.search).toBe("?year=2026&month=9");
    expect(host.textContent).toContain("9/24（週四） 當日預約");
    expect(host.querySelectorAll("[data-batch]")).toHaveLength(5);
    expect(caught).toEqual([]); expect(mocks.write).not.toHaveBeenCalled();
  } finally { window.removeEventListener("popstate", pop); }
});
