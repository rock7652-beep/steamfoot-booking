// @vitest-environment jsdom
import { act, createElement as el } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoursePortalData } from "@/app/(customer)/book/course-portal";
const m = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn(), attendance: vi.fn(), note: vi.fn(), purchase: vi.fn(), booking: vi.fn(), cancel: vi.fn(), join: vi.fn(), leave: vi.fn(), load: vi.fn(), confirm: vi.fn(), reschedule: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => m, usePathname: () => "/s/a/book", useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/components/customer-labels", () => ({ CustomerLabelsProvider: ({ children }: { children: unknown }) => children, CustomerLabels: () => null }));
vi.mock("@/components/share-referral", () => ({ ShareReferral: () => null }));
vi.mock("@/server/actions/course-referral-share", () => ({ trackCourseShare: vi.fn() }));
vi.mock("@/components/steam-butler-logo", () => ({ SteamButlerLogo: () => null }));
vi.mock("@/components/logout-button", () => ({ LogoutButton: () => null }));
vi.mock("@/server/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/components/course-member-contact-form", () => ({ CourseMemberContactForm: () => null }));
vi.mock("@/components/course-health-workspace", () => ({ CourseHealthWorkspace: () => null }));
vi.mock("@/components/course-companion-editor", () => ({ CourseCompanionEditor: () => null }));
vi.mock("@/server/actions/course-members", () => ({ createMemberCourseBooking: m.booking, updateCourseBookingStatus: m.cancel }));
vi.mock("@/server/actions/course-portal", () => ({ saveCourseAttendance: m.attendance, saveCourseCoachNote: m.note, purchaseCoursePlan: m.purchase }));
vi.mock("@/server/actions/course-waitlist", () => ({ joinMemberCourseWaitlist: m.join, cancelMemberCourseWaitlistAction: m.leave }));
vi.mock("@/server/actions/course-booking-notification", () => ({ loadCourseBookingNotification: m.load, confirmMemberCourseTrial: m.confirm, rescheduleMemberCourseBooking: m.reschedule }));
import { CoursePortalClient } from "@/app/(customer)/book/course-portal-client";

let host: HTMLDivElement, root: Root;
const props = () => ({
  selfBookingEnabled: true, initialRole: "member", rolePreferenceKey: "self-booking-ui", month: "2099-01", serverNow: Date.parse("2099-01-20T08:00:00+08:00"), initialDate: "2099-01-20", initialView: "schedule", memberEnabled: true, hasWork: false,
  customerId: "member", customerName: "會員本人", storeName: "測試店", prefix: "/s/a", companionBookingEnabled: true, cancellationLeadMinutes: 120,
  cards: [{ id: "card", name: "自由選課", unit: "POINT", termSessionIds: [], templateIds: [], allowShared: true, available: 10, remaining: 10, held: 0, entries: [], expired: false, closed: false, expiresAt: "2099-12-31", members: [{ id: "member", name: "本人" }] }],
  plans: [], templates: [], bookings: [], orders: [], hours: [], special: [], config: {}, bookingWindow: { closesAt: "2099-02-20T00:00:00Z" }, nextBooking: null, nextWork: null, work: [],
  sessions: [{ id: "session", templateId: "template", name: "瑜珈", startsAt: "2099-01-20T12:00:00+08:00", coach: "教練", room: "教室", cost: 2, capacity: 3, occupied: 0, precautions: "", waitlistAllowed: true, waitlistPosition: null, waitlistRemaining: 3 }],
}) as unknown as CoursePortalData & { initialDate: string; initialView: "schedule" };
const button = (text: string, scope: ParentNode = document.body) => [...scope.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === text && !node.closest("[hidden]"));
const dialog = () => document.body.querySelector('[role="dialog"]')!;
async function click(text: string, scope?: ParentNode) { const node = button(text, scope); expect(node, text).toBeTruthy(); await act(async () => node!.click()); }
async function render(data = props()) { await act(async () => root.render(el(CoursePortalClient, data))); }
beforeEach(() => {
  vi.resetAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.history.replaceState(null, "", "/s/a/book"); window.scrollTo = vi.fn(); HTMLElement.prototype.scrollIntoView = vi.fn();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  for (const action of [m.booking, m.cancel, m.join, m.leave, m.confirm, m.reschedule, m.purchase, m.attendance]) action.mockResolvedValue({ success: true });
  m.load.mockResolvedValue({ success: false, error: "請由店家處理" });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });


function openingData() {
  const data = props();
  data.cards = [];
  data.bookings = [{ ...data.sessions[0], id: "opening-booking", sessionId: "session", openingMakeup: true,
    status: "RESERVED", customerId: "member", customerName: "會員本人", operatorName: "店家", notes: "",
    unit: "SESSION", planName: "期初補課（獨立權益，請由店家處理）", expiresAt: null,
    trialPaid: null, trialPrice: null, cost: 0,
  }] as unknown as CoursePortalData["bookings"];
  data.nextBooking = { openingMakeup: true, name: "瑜珈", startsAt: data.sessions[0].startsAt,
    coach: "教師", room: "教室", participants: [{ id: "opening-booking", name: "會員本人" }],
  } as NonNullable<CoursePortalData["nextBooking"]>;
  return data;
}
function expectNoOpeningMutation() {
  for (const label of ["改時段", "取消", "請假", "報到", "確認會到", "確認取消", "確認改期", "出席", "未到"])
    expect(button(label), label).toBeUndefined();
  for (const action of [m.cancel, m.reschedule, m.confirm, m.attendance]) expect(action).not.toHaveBeenCalled();
}

describe("own independent opening makeup in the member portal", () => {
  it.each([true, false])("shows upcoming and booking details read-only with student self-booking=%s", async enabled => {
    const data = openingData(); data.selfBookingEnabled = enabled;
    await render({ ...data, initialView: "home" } as unknown as typeof data);
    expect(host.querySelector(".cp-next")?.textContent).toContain("期初補課・請由店家處理");
    expect(host.querySelector(".cp-next")?.textContent).toContain("共 1 位");
    await click("查看");
    expect(host.querySelector(".cp-booking-card")?.textContent).toContain("期初補課・請由店家處理");
    expectNoOpeningMutation();
    await click("明細 ⌄");
    expect(host.textContent).toContain("獨立補課權益，不使用方案額度；請由店家處理");
    expect(host.textContent).not.toContain("0 堂");
    expect(host.textContent).not.toContain("自行取消截止");
    expect(host.textContent).not.toContain("2099-12-31");
    expectNoOpeningMutation();
  });
  it("marks the learner's own calendar without needing a paid card", async () => {
    const data = openingData(); data.selfBookingEnabled = false;
    await render(data);
    const day = host.querySelector('button[aria-label="2099-01-20 1堂"]')!;
    expect(day.querySelector(".cp-dots .self")).not.toBeNull();
    expect(day.querySelector(".cp-dots .shared")).toBeNull();
    expect(data.cards).toEqual([]);
    expectNoOpeningMutation();
  });
  it.each(["ATTENDED", "CANCELLED"])("keeps %s history cardless and does not claim a paid-card deduction", async status => {
    const data = openingData(); data.bookings[0].status = status;
    await render({ ...data, initialView: "bookings" } as unknown as typeof data);
    await click("歷史紀錄"); await click("明細 ⌄");
    expect(host.textContent).toContain("獨立補課權益，不使用方案額度");
    expect(host.textContent).not.toContain("已扣除"); expect(host.textContent).not.toContain("已釋放");
    expectNoOpeningMutation();
  });
  it.each(["cancel", "reschedule", "confirm"])("replaces a known opening %s deep link with a read-only detail", async action => {
    window.history.replaceState(null, "", `/s/a/book?bookingId=opening-booking&action=${action}`);
    await render(openingData());
    expect(dialog().getAttribute("aria-label")).toBe("期初補課");
    expect(dialog().textContent).toContain("如需調整，請聯繫店家");
    expectNoOpeningMutation(); expect(m.load).not.toHaveBeenCalled();
    await click("返回", dialog());
    expect(dialog()).toBeNull();
    expect(m.replace).toHaveBeenCalledWith("/s/a/book?", {scroll:false});
    expectNoOpeningMutation();
  });
  it("removes an already-open native cancellation when a refreshed row is classified as opening", async () => {
    const data = openingData();
    const native = {...data, bookings:[{...data.bookings[0], openingMakeup:false}]};
    await render({ ...native, initialView: "bookings" } as unknown as typeof data);
    await click("取消"); expect(button("確認取消", dialog())).toBeTruthy();
    await render({ ...data, initialView: "bookings" } as unknown as typeof data);
    expect(dialog().getAttribute("aria-label")).toBe("期初補課");
    expectNoOpeningMutation();
    await click("返回", dialog()); expect(dialog()).toBeNull();
    expectNoOpeningMutation();
  });
});
