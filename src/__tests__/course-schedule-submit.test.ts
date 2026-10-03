// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CourseWorkspace } from "@/app/(dashboard)/dashboard/courses/workspace";

const { createSchedule, refresh } = vi.hoisted(() => ({ createSchedule: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }), usePathname: () => "/dashboard/courses", useSearchParams: () => new URLSearchParams("action=schedule") }));
vi.mock("@/server/actions/course-slot-matches", () => ({ getMusicSlotMatches: vi.fn() }));
vi.mock("@/server/actions/course", () => ({ createCourseSchedule: createSchedule }));
vi.mock("@/components/admin/course-display-order", () => ({ useCourseDisplayOrder: () => ({ ranks: new Map() }) }));
vi.mock("@/components/admin/course-status-button", () => ({ useCourseStatusRows: (rows: unknown[]) => [rows, vi.fn(), [], vi.fn()], CourseStatusButton: () => null }));
vi.mock("@/components/admin/course-batch-selection", () => ({ CourseBatchBar: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/roster", () => ({ CourseRoster: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/rental-panel", () => ({ RentalPanel: () => null, RentalHistory: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/music-schedule-wizard", () => ({ MusicScheduleWizard: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/daily-attendance-list", () => ({ DailyAttendanceList: () => null }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const props = {
  selectedDate: "2026-10-01", today: "2026-10-01", nowIso: "2026-10-01T01:00:00Z", calendarDays: {},
  rooms: [{ id: "room", name: "A", category: "", isActive: true, capacity: 10 }],
  templates: [{ id: "yoga", name: "瑜珈", category: "", isActive: true, durationMinutes: 60, capacity: 10, pointCost: 2, defaultRoomId: "room" }],
  sessions: [], cancelledBookings: [], coaches: [{ id: "coach", displayName: "黃教練", phone: "", status: "ACTIVE", courseCoachEnabled: true, courseQualificationsConfirmed: true, courseQualifiedTemplateIds: ["yoga"] }],
  canCreate: true, canEdit: true, businessProfile: "FITNESS" as const, view: "schedule" as const,
  staffAvailability: [], staffAvailabilityExceptions: [],
};

it("keeps weekly selection after separate input/change events and confirms submitted dates without opening the day list", async () => {
  createSchedule.mockResolvedValue({ success: true, data: { count: 3, sessionId: "first" } });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(CourseWorkspace, props)));
    const mode = host.querySelector<HTMLSelectElement>('select[name="repeatMode"]')!;
    mode.value = "weekly";
    // Native mobile pickers may emit input before committing change.
    await act(async () => mode.dispatchEvent(new Event("input", { bubbles: true })));
    expect(mode.value).toBe("weekly");
    await act(async () => mode.dispatchEvent(new Event("change", { bubbles: true })));
    expect(mode.value).toBe("weekly");
    const weeks = host.querySelector<HTMLInputElement>('input[name="repeatWeeks"]')!;
    expect(weeks.value).toBe("1");
    expect(host.querySelector('input[name="until"]')).toBeNull();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(weeks, "3");
    await act(async () => weeks.dispatchEvent(new Event("input", { bubbles: true })));
    const preview = host.querySelector('[aria-label="重複排課日期"]')!;
    expect(preview.textContent).toContain("每週四・共 3 堂");
    ["10/01", "10/08", "10/15"].forEach(date => expect(preview.textContent).toContain(date));
    const monday = host.querySelector<HTMLButtonElement>('button[aria-label="每週一"]')!;
    await act(async () => monday.click());
    expect(monday.getAttribute("aria-pressed")).toBe("true");
    expect(preview.textContent).toContain("共 6 堂");
    expect(preview.textContent).toContain("10/19");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(weeks, "27");
    await act(async () => weeks.dispatchEvent(new Event("input", { bubbles: true })));
    expect(host.querySelector<HTMLButtonElement>('button[form="course-schedule-form"]')!.disabled).toBe(true);
    expect(preview.textContent).toContain("53 堂");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(weeks, "3");
    await act(async () => weeks.dispatchEvent(new Event("input", { bubbles: true })));
    await act(async () => monday.click());
    expect(host.querySelector<HTMLButtonElement>('button[form="course-schedule-form"]')!.disabled).toBe(false);
    const form = host.querySelector<HTMLFormElement>("#course-schedule-form")!;
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(createSchedule).toHaveBeenCalledWith(expect.objectContaining({ repeatUntil: undefined, additionalDates: ["2026-10-08", "2026-10-15"] }));
    const confirmation = host.querySelector('[aria-label="排課成功日期"]')!;
    expect(confirmation.textContent).toContain("已成功建立 3 堂課程");
    ["2026-10-01", "2026-10-08", "2026-10-15"].forEach(date => expect(confirmation.textContent).toContain(date));
    expect(host.querySelector("#course-panel-title")?.textContent).toBe("排課成功");
    expect(host.textContent).not.toContain("每 60 秒自動更新");
    expect(refresh).toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it("keeps selected dates after a failed batch and confirms all dates after a successful retry", async () => {
  createSchedule.mockReset();
  createSchedule.mockResolvedValueOnce({ success: false, error: "其中一天空間已有安排" });
  createSchedule.mockResolvedValueOnce({ success: true, data: { count: 3, sessionId: "first" } });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(CourseWorkspace, props)));
    const mode = host.querySelector<HTMLSelectElement>('select[name="repeatMode"]')!;
    mode.value = "dates";
    await act(async () => mode.dispatchEvent(new Event("change", { bubbles: true })));
    for (const date of ["2026-10-03", "2026-10-06"]) {
      await act(async () => host.querySelector<HTMLButtonElement>(`button[aria-label="${date}"]`)!.click());
    }
    const form = host.querySelector<HTMLFormElement>("#course-schedule-form")!;
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(host.textContent).toContain("其中一天空間已有安排");
    expect(host.querySelector('[aria-label="排課成功日期"]')).toBeNull();
    expect(new FormData(form).getAll("additionalDates")).toEqual(["2026-10-03", "2026-10-06"]);
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(createSchedule).toHaveBeenLastCalledWith(expect.objectContaining({ date: "2026-10-01", repeatUntil: undefined, additionalDates: ["2026-10-03", "2026-10-06"] }));
    const confirmation = host.querySelector('[aria-label="排課成功日期"]')!;
    expect(confirmation.textContent).toContain("已成功建立 3 堂課程");
    ["2026-10-01", "2026-10-03", "2026-10-06"].forEach(date => expect(confirmation.textContent).toContain(date));
    expect(host.querySelector("#course-schedule-form")).toBeNull();
    await act(async () => [...confirmation.querySelectorAll("button")].find(button => button.textContent === "再排課")!.click());
    expect(host.querySelector<HTMLSelectElement>('select[name="repeatMode"]')?.value).toBe("once");
    expect(host.querySelector('[aria-label="排課成功日期"]')).toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); }
});
