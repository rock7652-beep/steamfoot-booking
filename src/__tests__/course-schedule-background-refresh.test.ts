vi.mock("@/server/actions/course-browse", () => ({ loadCourseCustomerSearchIndex: vi.fn().mockResolvedValue({success:true,data:[],complete:true}), searchCourseCustomers: vi.fn().mockResolvedValue({success:true,data:[]}) }));
vi.mock("@/server/actions/course-rental", () => ({ createRentalCustomer: vi.fn() }));
vi.mock("@/server/actions/sports-attendance-evidence", () => ({ loadSportsAttendanceEvidence: vi.fn() }));
vi.mock("@/server/actions/course-members", () => ({ updateCourseRosterBatch: vi.fn(), cancelCourseSession: vi.fn() }));
vi.mock("@/server/actions/sports-staging", () => ({ recordSportsAttendance: vi.fn(), cancelSportsLesson: vi.fn(), moveSportsLesson: vi.fn() }));
vi.mock("@/server/actions/sports-series", () => ({ syncSportsPermanentCalendar: vi.fn() }));
// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CourseWorkspace } from "@/app/(dashboard)/dashboard/courses/workspace";

const m = vi.hoisted(() => ({ query: "", router: { refresh: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => m.router,
  usePathname: () => "/s/sports-test/admin/dashboard/courses",
  useSearchParams: () => new URLSearchParams(m.query),
}));
vi.mock("@/server/actions/course-slot-matches", () => ({ getMusicSlotMatches: vi.fn() }));
vi.mock("@/server/actions/course", () => ({}));
vi.mock("@/components/admin/course-display-order", () => ({ useCourseDisplayOrder: () => ({ ranks: new Map(), compare: () => 0, rowProps: () => ({}), handle: () => null }) }));
vi.mock("@/components/admin/course-status-button", () => ({ useCourseStatusRows: (rows: unknown[]) => [rows, vi.fn(), [], vi.fn()], CourseStatusButton: () => null }));
vi.mock("@/components/admin/course-batch-selection", () => ({ CourseBatchBar: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/roster", () => ({ CourseRoster: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/rental-panel", () => ({ RentalPanel: () => null, RentalHistory: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/music-schedule-wizard", () => ({ MusicScheduleWizard: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/daily-attendance-list", () => ({ DailyAttendanceList: () => null }));

const props = {
  storeId: "store-a", selectedDate: "2026-10-17", today: "2026-10-17",
  nowIso: "2026-10-17T01:00:00Z", calendarDays: {}, rooms: [], templates: [],
  sessions: [], cancelledBookings: [], coaches: [], canCreate: true, canEdit: true,
  view: "schedule" as const, staffAvailability: [], staffAvailabilityExceptions: [],
};
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date(props.nowIso));
  m.query = "";
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks();
});
async function render(businessProfile: "FITNESS" | "MUSIC" = "FITNESS", view: "schedule" | "catalog" = "schedule") {
  await act(async () => root.render(createElement(CourseWorkspace, { ...props, view, businessProfile })));
}
async function tick(ms = 60_000) { await act(async () => { vi.advanceTimersByTime(ms); }); }

it.each(["FITNESS", "MUSIC"] as const)("%s refreshes the closed calendar without navigation and preserves the selected view", async profile => {
  await render(profile);
  expect(m.router.refresh).not.toHaveBeenCalled();
  await tick(); expect(m.router.refresh).toHaveBeenCalledTimes(1);
  expect(host.querySelector<HTMLInputElement>('[aria-label="課表日期"]')?.value).toBe(props.selectedDate);
  await tick(); expect(m.router.refresh).toHaveBeenCalledTimes(2);
});
it("skips hidden tabs, resumes on visibility, and coalesces focus/pageshow events", async () => {
  const visibility = vi.spyOn(document, "visibilityState", "get");
  await render(); visibility.mockReturnValue("hidden"); await tick();
  expect(m.router.refresh).not.toHaveBeenCalled();
  visibility.mockReturnValue("visible");
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
  await act(async () => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("pageshow")); });
  expect(m.router.refresh).toHaveBeenCalledTimes(1);
});
it("pauses while a scheduling draft is open and resumes after closing it", async () => {
  m.query = "action=schedule"; await render(); await tick();
  expect(m.router.refresh).not.toHaveBeenCalled();
  const close = [...host.querySelectorAll("button")].find(button => button.textContent === "關閉");
  expect(close).toBeTruthy(); await act(async () => close!.click());
  await tick(); expect(m.router.refresh).toHaveBeenCalledTimes(1);
});
it("keeps the existing day sheet updating and excludes catalog pages", async () => {
  m.query = "action=booking"; await render(); await tick();
  expect(m.router.refresh).toHaveBeenCalledTimes(1);
  await render("FITNESS", "catalog"); m.router.refresh.mockClear(); await tick();
  expect(m.router.refresh).not.toHaveBeenCalled();
});
it("removes timers and focus listeners when leaving the calendar", async () => {
  await render(); await act(async () => root.unmount());
  root = createRoot(host);
  await tick(); window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("pageshow"));
  expect(m.router.refresh).not.toHaveBeenCalled();
});

// Server actions are transport boundaries; keep these UI regressions isolated from auth/database loading.
vi.mock("@/server/actions/sports-staging", () => ({ saveSportsFee: vi.fn(), sportsStagingCommand: vi.fn() }));
vi.mock("@/server/actions/sports-series", () => ({ syncSportsPermanentCalendar: vi.fn(), previewSportsCourseCancellation: vi.fn(), stopSportsSeries: vi.fn() }));
vi.mock("@/server/actions/sports-attendance-evidence", () => ({ loadSportsAttendanceEvidence: vi.fn() }));
vi.mock("@/server/actions/course-rental", () => ({ createRentalCustomer: vi.fn() }));
vi.mock("@/server/actions/course-members", () => ({ updateCourseRosterBatch: vi.fn(), cancelCourseSession: vi.fn() }));
