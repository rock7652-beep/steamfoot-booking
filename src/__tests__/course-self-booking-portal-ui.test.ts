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
import { CourseBookingNotificationDialog } from "@/components/course-booking-notification-dialog";

let host: HTMLDivElement, root: Root;
const message = "如需預約或調整時間，請聯繫店家";
const props = () => ({
  selfBookingEnabled: true, initialRole: "member", rolePreferenceKey: "self-booking-ui", month: "2099-01", serverNow: Date.parse("2099-01-20T08:00:00+08:00"), initialDate: "2099-01-20", initialView: "schedule", memberEnabled: true, hasWork: false,
  customerId: "member", customerName: "會員本人", storeName: "測試店", prefix: "/s/a", companionBookingEnabled: true, cancellationLeadMinutes: 120,
  cards: [{ id: "card", name: "自由選課", unit: "POINT", termSessionIds: [], templateIds: [], allowShared: true, available: 10, remaining: 10, held: 0, entries: [], expired: false, closed: false, expiresAt: "2099-12-31", members: [{ id: "member", name: "本人" }] }],
  plans: [], templates: [], bookings: [], orders: [], hours: [], special: [], config: {}, bookingWindow: { closesAt: "2099-02-20T00:00:00Z" }, nextBooking: null, nextWork: null, work: [],
  sessions: [{ id: "session", templateId: "template", name: "瑜珈", startsAt: "2099-01-20T12:00:00+08:00", coach: "教練", room: "教室", cost: 2, capacity: 3, occupied: 0, precautions: "", waitlistAllowed: true, waitlistPosition: null, waitlistRemaining: 3 }],
}) as unknown as CoursePortalData & { initialDate: string; initialView: "schedule" };
const notificationData = (enabled = true, trial = false) => ({ success: true, selfBookingEnabled: enabled, booking: { id: "booking", active: true, trial, customerName: "會員本人", name: "瑜珈", startsAt: "2099-01-20T12:00:00+08:00", cutoff: "2099-01-20T10:00:00+08:00" }, sessions: [{ id: "new-session", startsAt: "2099-01-21T12:00:00+08:00", room: "教室" }] });
const button = (text: string, scope: ParentNode = document.body) => [...scope.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === text && !node.closest("[hidden]"));
const dialog = () => document.body.querySelector('[role="dialog"]')!;
async function click(text: string, scope?: ParentNode) { const node = button(text, scope); expect(node, text).toBeTruthy(); await act(async () => node!.click()); }
async function render(data = props()) { await act(async () => root.render(el(CoursePortalClient, data))); }
async function selectSession() { await act(async () => { const input = dialog().querySelector("select")!; input.value = "new-session"; input.dispatchEvent(new Event("change", { bubbles: true })); }); }
beforeEach(() => {
  vi.resetAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.history.replaceState(null, "", "/s/a/book"); window.scrollTo = vi.fn(); HTMLElement.prototype.scrollIntoView = vi.fn();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  for (const action of [m.booking, m.cancel, m.join, m.leave, m.confirm, m.reschedule, m.purchase, m.attendance]) action.mockResolvedValue({ success: true });
  m.load.mockResolvedValue(notificationData());
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe("student booking switch portal", () => {
  it("cancels inside the reservation card, keeps failure retryable and submits once", async () => {
    const data = props();
    data.bookings = [{ ...data.sessions[0], id:"booking",sessionId:"session",status:"RESERVED",customerId:"member",customerName:"本人",operatorName:"本人",cost:2,unit:"POINT",planName:"方案",notes:"",expiresAt:"2099-12-31" }] as unknown as CoursePortalData["bookings"];
    await render({...data,initialView:"bookings"} as unknown as typeof data);
    await click("取消"); expect(dialog()).toBeNull();
    m.cancel.mockResolvedValueOnce({success:false,error:"預約已變更"});
    await click("確認取消");
    expect(host.querySelector('.cp-inline-confirm')?.textContent).toContain("預約已變更");
    expect(host.textContent).not.toContain("已取消預約，正在同步額度");
    const submit=button("確認取消")!;
    await act(async()=>{submit.click();submit.click();});
    expect(m.cancel).toHaveBeenCalledTimes(2);
    expect(host.querySelector('.cp-inline-confirm')).toBeNull();
    expect(host.textContent).toContain("已取消預約，正在同步額度");
  });

  it("keeps member date and filters when returning from work", async () => {
    const data={...props(),hasWork:true}; await render(data);
    const filter=host.querySelector<HTMLSelectElement>('.cp-filters select')!;
    await act(async()=>{filter.value='template';filter.dispatchEvent(new Event('change',{bubbles:true}));});
    await click("我的工作"); await click("會員");
    expect(host.querySelector('.cp-nav button[aria-current="page"]')?.textContent).toBe("預約");
    expect((host.querySelector('.cp-filters select') as HTMLSelectElement).value).toBe("template");
    expect(host.querySelector('.cp-daily h2')?.textContent).toContain("1/20");
  });

  it("dismisses an unsent inline cancellation when leaving the booking view", async () => {
    const data=props();
    data.bookings=[{...data.sessions[0],id:"booking",sessionId:"session",status:"RESERVED",customerId:"member",customerName:"本人",operatorName:"本人",cost:2,unit:"POINT",planName:"方案",notes:"",expiresAt:"2099-12-31"}] as unknown as CoursePortalData["bookings"];
    await render({...data,initialView:"bookings"} as unknown as typeof data);
    await click("取消"); await click("首頁"); await click("我的預約");
    expect(host.querySelector('.cp-inline-confirm')).toBeNull();
    expect(m.cancel).not.toHaveBeenCalled();
  });

  it("uses module-specific filters and makes course costs an inline disclosure", async () => {
    await render({...props(),musicStore:true});
    expect(host.querySelector('.cp-filters summary')?.textContent).toContain("教師：全部");
    expect(host.querySelector('.cp-filters')?.hasAttribute('open')).toBe(false);
    const details=host.querySelector('.cp-lesson details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    await act(async()=>(details.querySelector('summary') as HTMLElement).click());
    expect(details.open).toBe(true); expect(details.textContent).toContain("扣抵：每人 2 點");
    expect(dialog()).toBeNull();
  });
  it("keeps the schedule visible, changes entry labels and blocks both booking and new waitlists", async () => {
    const data = props(); data.selfBookingEnabled = false;
    await render({ ...data, initialView: "home" } as unknown as typeof data);
    expect(host.textContent).toContain("看課表"); expect(host.textContent).toContain(message); expect(button("立即預約")).toBeUndefined();
    await click("看課表"); expect(host.textContent).toContain("瑜珈");
    expect((host.querySelector(".cp-lesson button") as HTMLButtonElement).disabled).toBe(true);
    data.sessions[0].occupied = 3; await render(data);
    expect((host.querySelector(".cp-lesson button") as HTMLButtonElement).disabled).toBe(true);
    expect(m.booking).not.toHaveBeenCalled(); expect(m.join).not.toHaveBeenCalled();
  });

  it.each([false, true])("blocks an already-open %s waitlist/booking dialog after a settings refresh", async full => {
    const data = props(); if (full) data.sessions[0].occupied = 3;
    await render(data); await act(async () => (host.querySelector(".cp-lesson button") as HTMLButtonElement).click());
    expect(button(full ? "確認候補" : "確認預約", dialog())).toBeTruthy();
    await render({ ...data, selfBookingEnabled: false });
    expect(dialog().textContent).toContain(message); expect(dialog().querySelector("select")).toBeNull();
    expect(button("確認預約", dialog())).toBeUndefined(); expect(button("確認候補", dialog())).toBeUndefined();
    await click("返回", dialog()); expect(dialog()).toBeNull();
    expect(m.booking).not.toHaveBeenCalled(); expect(m.join).not.toHaveBeenCalled();
  });

  it("preserves waiting position reads and cancellation despite disabled bookings, waitlist rules and booking window", async () => {
    const data = props(); data.selfBookingEnabled = false;
    data.sessions[0] = { ...data.sessions[0], waitlistPosition: 2, waitlistAllowed: false, occupied: 3, waitlistRemaining: 0 };
    data.bookingWindow.closesAt = "2099-01-01T00:00:00Z";
    await render(data); await click("候補中・第 2 位");
    expect(dialog().textContent).toContain("目前候補第 2 位"); expect(dialog().textContent).toContain("暫停自動遞補");
    data.sessions[0].waitlistPosition = 1; await render({ ...data });
    expect(dialog().textContent).toContain("目前候補第 1 位");
    await click("取消候補", dialog()); expect(m.leave).toHaveBeenCalledExactlyOnceWith({ sessionId: "session" }); expect(m.join).not.toHaveBeenCalled();
  });

  it("keeps normal booking enabled by default and supports a later re-enable", async () => {
    const data = props(); await render({ ...data, selfBookingEnabled: false });
    await render({ ...data, selfBookingEnabled: undefined } as unknown as typeof data);
    await act(async () => (host.querySelector(".cp-lesson button") as HTMLButtonElement).click());
    await click("確認預約", dialog()); expect(m.booking).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "session", customerIds: ["member"] }));
  });

  it("keeps reservations and their cancellation cutoff, while removing reschedule", async () => {
    const data = props(); data.selfBookingEnabled = false;
    data.bookings = [{ ...data.sessions[0], id: "booking", sessionId: "session", status: "RESERVED", customerId: "member", customerName: "會員本人", operatorName: "本人", notes: "", unit: "POINT", planName: "十點方案", expiresAt: "2099-12-31", trialPaid: null, trialPrice: null }] as unknown as CoursePortalData["bookings"];
    await render({ ...data, initialView: "bookings" } as unknown as typeof data);
    expect(host.textContent).toContain("會員本人"); expect(button("改時段")).toBeUndefined();
    await click("取消"); expect(dialog()).toBeNull(); await click("確認取消", host.querySelector(".cp-inline-confirm")!); expect(m.cancel).toHaveBeenCalledWith({ bookingId: "booking", status: "CANCELLED", member: true });
    data.serverNow = Date.parse("2099-01-20T11:00:00+08:00"); await act(async () => root.render(el(CoursePortalClient, { ...data, initialView: "bookings", key: "after-cutoff" })));
    expect(button("取消")).toBeUndefined(); expect(host.textContent).toContain("已超過取消期限");
  });

  it("keeps purchase submission available with self-booking disabled", async () => {
    const data = props(); data.selfBookingEnabled = false;
    data.config = { bankName: "銀行", bankCode: "123", bankAccountNumber: "123456", lineOfficialUrl: "", address: "", mapUrl: "" } as unknown as CoursePortalData["config"];
    data.plans = [{ id: "plan", name: "十點方案", price: 500, points: 10, unit: "POINT", validDays: 30, templateIds: [], termSizes: [] }] as unknown as CoursePortalData["plans"];
    await render({ ...data, initialView: "shop" } as unknown as typeof data);
    await click("購買");
    const input = dialog().querySelector<HTMLInputElement>('input[inputmode="numeric"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "1234"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    await click("已匯款，送出核帳資料", dialog()); expect(m.purchase).toHaveBeenCalledWith(expect.objectContaining({ planId: "plan", transferLastFive: "1234" }));
  });

  it("does not restrict coach attendance or rename the coach schedule", async () => {
    const data = props(); data.selfBookingEnabled = false;
    data.initialRole = "coach"; data.memberEnabled = false; data.hasWork = true;
    data.work = [{ id: "work", name: "授課瑜珈", startsAt: data.sessions[0].startsAt, endsAt: "2099-01-20T13:00:00+08:00", room: "教室", cost: 2, bookings: [{ id: "booking", customerId: "member", customerName: "本人", status: "RESERVED", checkedIn: false, cost: 2, available: 10, unit: "POINT", planName: "十點", notes: "", serviceNote: "", updatedAt: "2099-01-20T00:00:00Z" }] }] as unknown as CoursePortalData["work"];
    await render(data); expect(button("課表")).toBeTruthy(); expect(host.textContent).not.toContain(message);
    await act(async () => (host.querySelector(".cp-daily .cp-menu") as HTMLButtonElement).click());
    await click("出席"); expect(m.attendance).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "work", target: "ATTENDED" }));
  });
});

describe("notification deep-link booking switch", () => {
  const renderNotification = async (action: "reschedule" | "cancel" | "confirm", enabled = true) => {
    await act(async () => root.render(el(CourseBookingNotificationDialog, { bookingId: "booking", action, selfBookingEnabled: enabled, close: vi.fn() })));
  };
  it.each([false, true])("blocks a %s trial reschedule deep link using the fresh loader flag", async trial => {
    m.load.mockResolvedValue(notificationData(false, trial));
    window.history.replaceState(null, "", "/s/a/book?bookingId=booking&action=reschedule");
    await render(props()); expect(m.load).toHaveBeenCalledWith("booking");
    expect(dialog().textContent).toContain(message); expect(dialog().querySelector("select")).toBeNull(); expect(button("確認改期", dialog())).toBeUndefined(); expect(m.reschedule).not.toHaveBeenCalled();
  });
  it("blocks a selected reschedule after the parent flag turns off", async () => {
    await renderNotification("reschedule"); await selectSession(); expect(button("確認改期", dialog())!.disabled).toBe(false);
    await renderNotification("reschedule", false); expect(button("確認改期", dialog())).toBeUndefined(); expect(dialog().querySelector("select")).toBeNull(); expect(m.reschedule).not.toHaveBeenCalled();
  });
  it("preserves cancellation through a disabled-store notification", async () => {
    m.load.mockResolvedValue(notificationData(false)); await renderNotification("cancel", false); await click("確認取消", dialog());
    expect(m.cancel).toHaveBeenCalledExactlyOnceWith({ bookingId: "booking", status: "CANCELLED", member: true });
  });
  it("preserves trial arrival confirmation", async () => {
    m.load.mockResolvedValue(notificationData(false, true)); await renderNotification("confirm", false); await click("確認會到", dialog());
    expect(m.confirm).toHaveBeenCalledExactlyOnceWith("booking");
  });
  it("still sends an enabled reschedule once with the selected session", async () => {
    await renderNotification("reschedule"); await selectSession();
    const submit = button("確認改期", dialog())!; await act(async () => { submit.click(); submit.click(); });
    expect(m.reschedule).toHaveBeenCalledExactlyOnceWith({ bookingId: "booking", sessionId: "new-session" });
  });
});
