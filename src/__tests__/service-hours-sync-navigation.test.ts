// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ sync: vi.fn(), read: vi.fn(), toast: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/s/a/admin/dashboard/settings/hours" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: m.toast } }));
vi.mock("@/app/(dashboard)/dashboard/courses/hours/weekly-hours-editor", () => ({ CourseWeeklyHoursEditor: () => null }));
vi.mock("@/server/actions/course-business-hours", () => ({ getCourseDayHours: vi.fn(), getCourseMonthScheduleSummary: vi.fn(), getCourseMonthSpecialDays: vi.fn() }));
vi.mock("@/server/actions/business-hours", () => ({ getMonthSpecialDays: vi.fn(), getMonthScheduleSummary: vi.fn(), getDaySlotDetails: vi.fn(), syncFromHeadquarters: m.sync, getServiceHoursSnapshot: m.read }));
import { ScheduleManager } from "@/app/(dashboard)/dashboard/settings/hours/schedule-manager";
const periods = [{ openTime: "09:00", closeTime: "18:00", slotInterval: 60, defaultCapacity: 6 }];
const weekly = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"].map((dayName, dayOfWeek) => ({ dayName, dayOfWeek, isOpen: true, persisted: true, openTime: "09:00", closeTime: "18:00", slotInterval: 60, defaultCapacity: 6, periods }));
const snapshot = { date: "2030-10-01", weekly, specials: [], summary: {}, day: { status: "open", openTime: "09:00", closeTime: "18:00", reason: null, specialDayId: null, dayOfWeek: 2, dayName: "週二", slots: [], slotInterval: 60, defaultCapacity: 6, periods, weeklyDefault: weekly[2], hoursRevision: "a".repeat(64) } };
let host: HTMLDivElement, root: Root;
beforeEach(async () => {
  vi.resetAllMocks(); vi.spyOn(window, "confirm").mockReturnValue(true); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  m.sync.mockResolvedValue({ success: true, data: { businessHours: 7, bookingSlots: 20 } });
  m.read.mockResolvedValue(snapshot);
  await act(async () => root.render(createElement(ScheduleManager, { storeId: "s", weeklyHours: weekly, initialSpecialDays: [], initialSummary: {}, initialYear: 2030, initialMonth: 10, canManage: true, isHeadquarters: false, isSpaStore: false })));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
async function click(label: string) { await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === label)!.click()); }
it("adopts authorized hours in place after sync", async () => {
  await click("套用總部設定");
  expect(m.sync).toHaveBeenCalledOnce(); expect(m.read).toHaveBeenCalledWith("s", "2030-10-01");
  expect(m.toast).not.toHaveBeenCalled(); expect(host.textContent).not.toContain("重新讀取設定");
});
it("retries only the read after a confirmed sync loses its read response", async () => {
  m.read.mockRejectedValueOnce(new Error("offline"));
  await click("套用總部設定");
  expect(host.textContent).toContain("重新讀取設定");
  await click("重新讀取設定");
  expect(m.sync).toHaveBeenCalledOnce(); expect(m.read).toHaveBeenCalledTimes(2);
  expect(window.confirm).toHaveBeenCalledOnce(); expect(host.textContent).not.toContain("重新讀取設定");
});
