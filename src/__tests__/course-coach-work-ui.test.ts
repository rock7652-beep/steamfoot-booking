// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoursePortalData } from "@/app/(customer)/book/course-portal";
const m = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn(), attendance: vi.fn(), note: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh, replace: m.replace }), usePathname: () => "/s/a/book", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/share-referral", () => ({ ShareReferral: () => null }));
vi.mock("@/server/actions/course-referral-share", () => ({ trackCourseShare: vi.fn() }));
vi.mock("@/components/steam-butler-logo", () => ({ SteamButlerLogo: () => null }));
vi.mock("@/components/logout-button", () => ({ LogoutButton: () => null }));
vi.mock("@/server/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/components/course-member-contact-form", () => ({ CourseMemberContactForm: () => null }));
vi.mock("@/components/course-health-workspace", () => ({ CourseHealthWorkspace: () => null }));
vi.mock("@/server/actions/course-members", () => ({ createMemberCourseBooking: vi.fn(), markCourseCoachAttendance: vi.fn(), updateCourseBookingStatus: vi.fn() }));
vi.mock("@/server/actions/course-portal", () => ({ saveCourseAttendance: m.attendance, saveCourseCoachNote: m.note, purchaseCoursePlan: vi.fn() }));
import { CoursePortalClient } from "@/app/(customer)/book/course-portal-client";
let host: HTMLDivElement, root: Root;
const learner = (id: string, checkedIn: boolean, status = "RESERVED") => ({ id, customerId: id, customerName: id, checkedIn, status, notes: "", cost: 2, unit: "POINT", planName: "十點", expiresAt: null });
const props = () => ({ month: "2026-09", serverNow: Date.parse("2026-09-20T11:00:00+08:00"), initialDate: "2026-09-20", memberEnabled: false, hasWork: true, customerId: "coach", customerName: "教練", storeName: "A", prefix: "/s/a", cards: [], plans: [], templates: [], bookings: [], orders: [], sessions: [], hours: [], special: [], config: {}, bookingWindow: { closesAt: "2026-10-20T00:00:00Z" }, nextWork: null, work: [{ id: "lesson", name: "伸展瑜珈", startsAt: "2026-09-20T10:00:00+08:00", endsAt: "2026-09-20T11:00:00+08:00", room: "A 教室", bookings: [learner("已到學員", true), learner("尚未到學員", false), learner("已取消學員", false, "CANCELLED")] }] }) as unknown as CoursePortalData;
const click = async (text: string) => {
  const button = [...host.querySelectorAll("button")].find(b => b.textContent?.includes(text));
  expect(button, text).toBeTruthy();
  await act(async () => button!.click());
};
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.scrollTo = vi.fn();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  m.attendance.mockResolvedValue({ success: true });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
describe("coach daily work interactions", () => {
  it("moves to the next month with the chosen day and renders an empty day", async () => {
    await act(async () => root.render(createElement(CoursePortalClient, { ...props(), initialDate: "2026-09-30" })));
    expect(host.textContent).toContain("這天沒有課程");
    await act(async () => (host.querySelector('[aria-label="後一天"]') as HTMLButtonElement).click());
    expect(m.replace).toHaveBeenCalledWith("/s/a/book?month=2026-10", { scroll: false });
    await act(async () => root.render(createElement(CoursePortalClient, { ...props(), month: "2026-10", work: [] })));
    expect(host.textContent).toContain("2026-10-01");
  });
  it("preserves an unsaved note when navigation is declined", async () => {
    await act(async () => root.render(createElement(CoursePortalClient, props())));
    await click("伸展瑜珈"); await click("編輯本堂備註");
    const textarea = host.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "膝蓋不適，降低強度");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await act(async () => (host.querySelector('[aria-label="後一天"]') as HTMLButtonElement).click());
    expect(window.confirm).toHaveBeenCalled();
    expect((host.querySelector("textarea") as HTMLTextAreaElement).value).toBe("膝蓋不適，降低強度");
    expect(host.textContent).toContain("今天 · 2026-09-20");
    vi.restoreAllMocks();
  });
  it("starts with today's list and keeps the calendar collapsed", async () => {
    await act(async () => root.render(createElement(CoursePortalClient, props())));
    expect(host.textContent).toContain("今天 · 2026-09-20");
    expect(host.querySelector(".cp-calendar")).toBeNull();
    await click("選日期"); expect(host.querySelector(".cp-calendar")).not.toBeNull();
    await click("伸展瑜珈");
    expect(host.textContent).toContain("全班報到（尚未報到 1 人）");
    expect(host.textContent).toContain("將已報到 1 人標記出席");
  });
  it("batch attendance only submits checked-in learners and keeps the roster open", async () => {
    await act(async () => root.render(createElement(CoursePortalClient, props())));
    await click("伸展瑜珈"); await click("將已報到");
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("已到學員");
    expect(dialog.textContent).not.toContain("尚未到學員");
    await click("確認 1 位出席");
    expect(m.attendance).toHaveBeenCalledWith({ sessionId: "lesson", target: "ATTENDED", bookings: [{ id: "已到學員", status: "RESERVED" }] });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.textContent).toContain("學員名單");
  });
  it("batch check-in excludes cancelled/already-arrived learners and retains confirmation on failure", async () => {
    m.attendance.mockResolvedValue({ success: false, error: "名單已變更" });
    await act(async () => root.render(createElement(CoursePortalClient, props())));
    await click("伸展瑜珈"); await click("全班報到"); await click("確認 1 位報到");
    expect(m.attendance).toHaveBeenCalledWith({ sessionId: "lesson", target: "CHECKED_IN", bookings: [{ id: "尚未到學員", status: "RESERVED" }] });
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain("名單已變更");
  });
});
