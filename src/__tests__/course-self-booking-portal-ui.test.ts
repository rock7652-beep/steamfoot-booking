// @vitest-environment jsdom
vi.mock("@/server/actions/course-phone-summary",()=>({loadCoursePhoneSummary:vi.fn(async()=>({success:true,learners:[]}))}));
vi.mock("@/server/actions/central-member-store", () => ({ selectCentralMemberStoreAction: vi.fn() }));
vi.mock("@/server/actions/course-teacher-session",()=>({loadCourseTeacherSession:vi.fn(),changeCourseTeacherSession:vi.fn()}));
import { act, createElement as el } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoursePortalData } from "@/app/(customer)/book/course-portal";
const m = vi.hoisted(() => ({ goods:vi.fn(), refresh: vi.fn(), replace: vi.fn(), attendance: vi.fn(), note: vi.fn(), purchase: vi.fn(), booking: vi.fn(), cancel: vi.fn(), join: vi.fn(), leave: vi.fn(), load: vi.fn(), confirm: vi.fn(), reschedule: vi.fn(), sportsTrial: vi.fn() }));
vi.mock("@/server/actions/customer-booking-goods",()=>({readCustomerBookingGoods:m.goods}));
vi.mock("@/server/actions/sports-staging",()=>({bookSportsTrial:m.sportsTrial}));
vi.mock("@/server/actions/course-store-notices",()=>({saveCourseOperationSwitch:vi.fn(),loadCourseStoreNotices:vi.fn(),markCourseStoreNotice:vi.fn()}));
vi.mock("@/server/actions/course-teacher-changes",()=>({loadCourseTeacherChange:vi.fn(),loadCourseTeacherLeave:vi.fn(),changeCourseTeacherBooking:vi.fn()}));
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
const message = "如需預約，請聯繫店家";
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
async function render(data = props()) {
  await act(async () => root.render(el(CoursePortalClient, data)));
  // The unified calendar now defaults to own lessons; browsing is explicit.
  if (data.initialView === "schedule" && data.selfBookingEnabled !== false && !dialog()) {
    const open = button("開放選課");
    if (open) await act(async () => open.click());
  }
}
async function selectSession() { await act(async () => { const input = dialog().querySelector("select")!; input.value = "new-session"; input.dispatchEvent(new Event("change", { bubbles: true })); }); }
beforeEach(() => {
  vi.resetAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.history.replaceState(null, "", "/s/a/book"); window.scrollTo = vi.fn(); HTMLElement.prototype.scrollIntoView = vi.fn();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  for (const action of [m.booking, m.cancel, m.join, m.leave, m.confirm, m.reschedule, m.purchase, m.attendance, m.sportsTrial]) action.mockResolvedValue({ success: true });
  m.goods.mockResolvedValue({success:true,data:null});
  m.load.mockResolvedValue(notificationData());
});
afterEach(async () => { vi.restoreAllMocks(); await act(async () => root.unmount()); host.remove(); });

describe("student booking switch portal", () => {
  it.each([499, 0])("books an explicitly priced sports trial (%s) without a regular card", async price => {
    const data=props();data.cards=[];data.sessions[0].sportsTrialPrice=price;
    vi.spyOn(window,'confirm').mockReturnValue(true);
    await render(data);
    await click(`體驗預約 NT$ ${price}`);
    expect(m.sportsTrial).toHaveBeenCalledExactlyOnceWith({sessionId:'session',expectedPrice:price,requestKey:expect.any(String)});
    expect(m.booking).not.toHaveBeenCalled();
  });
  it("keeps an absent trial price on the regular booking path", async () => {
    const data=props();
    await render(data);
    expect(host.textContent).not.toContain('體驗預約 NT$');
    await click('預約',host.querySelector('.cp-lesson')!);
    await click('確認預約',dialog());
    expect(m.booking).toHaveBeenCalledTimes(1);
    expect(m.sportsTrial).not.toHaveBeenCalled();
  });

  it("cancels inside the reservation card, keeps failure retryable and submits once", async () => {
    const data = props();
    data.bookings = [{ ...data.sessions[0], id:"booking",sessionId:"session",status:"RESERVED",customerId:"member",customerName:"本人",operatorName:"本人",cost:2,unit:"POINT",planName:"方案",notes:"",expiresAt:"2099-12-31" }] as unknown as CoursePortalData["bookings"];
    await render({...data,initialView:"bookings"} as unknown as typeof data);
    await click("取消"); expect(dialog()).toBeNull();
    expect(host.querySelector("[data-customer-booking-row]")?.textContent?.match(/取消截止/g)).toHaveLength(1);
    expect(host.querySelector('.cp-inline-confirm')?.closest('[inert]')).toBeNull();
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
    expect(host.querySelector('.cp-nav button[aria-current="page"]')?.textContent).toBe("課表");
    expect((host.querySelector('.cp-filters select') as HTMLSelectElement).value).toBe("template");
    expect(host.querySelector('.cp-daily h2')?.textContent).toContain("1/20");
  });

  it("dismisses an unsent inline cancellation when leaving the booking view", async () => {
    const data=props();
    data.bookings=[{...data.sessions[0],id:"booking",sessionId:"session",status:"RESERVED",customerId:"member",customerName:"本人",operatorName:"本人",cost:2,unit:"POINT",planName:"方案",notes:"",expiresAt:"2099-12-31"}] as unknown as CoursePortalData["bookings"];
    await render({...data,initialView:"bookings"} as unknown as typeof data);
    await click("取消"); await click("首頁"); await click("課表");
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
    expect(host.textContent).toContain("看課表"); expect(button("立即預約")).toBeUndefined();
    await click("查看課表"); expect(button("開放選課")).toBeUndefined();
    expect(host.querySelector(".cp-lesson")).toBeNull();
    data.sessions[0].occupied = 3; await render(data);
    expect(host.querySelector(".cp-lesson")).toBeNull();
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
    await render(data); expect(host.textContent).not.toContain("當日沒有課程"); expect(host.textContent).not.toContain("當天沒有課程"); await click("候補中・第 2 位");
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
    expect(button("取消")).toBeUndefined(); expect(host.textContent).toContain("已逾取消期限");
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
    expect(dialog().textContent).toContain("改期請聯繫店家"); expect(dialog().querySelector("select")).toBeNull(); expect(button("確認改期", dialog())).toBeUndefined(); expect(m.reschedule).not.toHaveBeenCalled();
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

describe("member leave debit confirmation",()=>{
 it.each([
  [true,"GROUP","SESSION","請假", "團體課請假仍會扣 1 堂，不提供補課。"],
  [true,"PRIVATE","SESSION","請假", "本次請假不扣堂，可於方案期限內安排補課。"],
  [true,"SELF_ORGANIZED","SESSION","請假", "本次請假不扣堂，可於方案期限內安排補課。"],
  [false,"GROUP","POINT","取消", "取消這堂預約，釋放保留額度。"],
 ] as const)("shows the actual rule before submitting (%s/%s)",async(music,classType,unit,action,text)=>{
  const data=props();data.musicStore=music;
  data.bookings=[{...data.sessions[0],id:"booking",sessionId:"session",classType,status:"RESERVED",customerId:"member",customerName:"本人",operatorName:"本人",cost:1,unit,planName:"方案",notes:"",expiresAt:"2099-12-31"}] as unknown as CoursePortalData["bookings"];
  await render({...data,initialView:"bookings"} as unknown as typeof data);
  await click(action);
  expect(host.querySelector('.cp-inline-confirm')?.textContent).toContain(text);
  expect(m.cancel).not.toHaveBeenCalled();
  await click(music?"確認請假":"確認取消");
  expect(m.cancel).toHaveBeenCalledExactlyOnceWith({bookingId:"booking",status:music?"STUDENT_LEAVE":"CANCELLED",member:true});
 });
});

it("shows the fresh debit notice before confirming a cancellation deep link",async()=>{
 m.load.mockResolvedValue({...notificationData(),leaveMessage:"團體課請假仍會扣 1 堂，不提供補課。"});
 await act(async()=>root.render(el(CourseBookingNotificationDialog,{bookingId:"booking",action:"cancel",close:vi.fn()})));
 expect(dialog().textContent).toContain("團體課請假仍會扣 1 堂，不提供補課。");
 expect(m.cancel).not.toHaveBeenCalled();
 await click("確認取消",dialog());
 expect(m.cancel).toHaveBeenCalledExactlyOnceWith({bookingId:"booking",status:"CANCELLED",member:true});
});

it("does not append an empty open-course message beneath an existing personal lesson",async()=>{
 const data=props();data.selfBookingEnabled=false;
 data.bookings=[{...data.sessions[0],id:"booking",sessionId:"session",status:"ATTENDED",customerId:"member",customerName:"本人",operatorName:"本人",cost:2,unit:"POINT",planName:"方案",notes:"",expiresAt:"2099-12-31"}] as unknown as CoursePortalData["bookings"];
 await render(data);expect(host.textContent).toContain("已出席");expect(host.textContent).not.toContain("當天沒有課程");expect(host.textContent).not.toContain("當日沒有課程");
});

it('submits selected goods once with the same member reservation and keeps candidate metadata separate from quota',async()=>{m.goods.mockResolvedValue({success:true,data:{revision:3,groups:[{id:'g',title:'飲品',kind:'SHARED_GOODS',multiple:true,required:false,options:[{id:'tea',name:'茶',price:80,duration:0,active:true}]}]}});await render(props());await click('預約');const d=dialog();await act(async()=>d.querySelector<HTMLInputElement>('[aria-label="加購商品選購"] input')!.click());await act(async()=>d.querySelector<HTMLButtonElement>('[aria-label="增加茶"]')!.click());await click('確認預約',d);expect(m.booking).toHaveBeenCalledWith(expect.objectContaining({sessionId:'session',sharedGoods:{revision:3,selections:[{id:'tea',quantity:2}]}}));});

it('個人課程卡精簡重複確認與說明，保留金額及店家請假規則',async()=>{
 const data=props();data.selfBookingEnabled=false;data.selfLeaveEnabled=false;data.selfRescheduleEnabled=false;
 data.bookings=[{...data.sessions[0],id:'trial-booking',sessionId:'session',status:'RESERVED',customerId:'member',customerName:'本人',operatorName:'本人',bookingAudience:'ASSIGNED',cost:0,unit:'TRIAL',planName:'體驗',trialPrice:480,trialPaid:null,notes:'攜帶室內鞋',expiresAt:null}] as unknown as CoursePortalData['bookings'];
 await render({...data,initialView:'bookings'} as unknown as typeof data);
 expect(button('查看明細 ⌄')).toBeUndefined();expect(button('收合明細 ⌃')).toBeUndefined();expect(button('確認會到')).toBeUndefined();
 expect(host.textContent).toContain('體驗 NT$ 480');expect(host.textContent).toContain('攜帶室內鞋');expect(host.textContent).not.toContain('體驗不使用方案額度');expect(host.textContent).not.toContain('取消截止');expect(host.textContent).not.toContain('共 1 人');expect(host.textContent).toContain('請假請洽店家');expect(button('取消')).toBeUndefined();expect(button('改時段')).toBeUndefined();
});

it('keeps customer plan facts visible without the internal balance-adjustment ledger',async()=>{
 const data={...props(),initialView:'plans'} as unknown as CoursePortalData;
 data.cards[0].unit='SESSION';data.cards[0].remaining=8;data.cards[0].available=8;
 data.cards[0].entries=[{id:'grant',kind:'GRANT',points:10,createdAt:'2099-01-01T02:00:00Z'},{id:'void',kind:'VOID',points:1,createdAt:'2099-01-20T02:00:00Z'},{id:'reverse',kind:'RELEASE',points:1,createdAt:'2099-01-20T02:00:00Z'}];
 data.cards[0].purchases=[{id:'order',points:10,price:4800,createdAt:'2099-01-01T02:00:00Z',status:'CONFIRMED'}];
 data.cards[0].grid={total:10,dates:['2099-01-02T02:00:00Z','2099-01-09T02:00:00Z']};
 await act(async()=>root.render(el(CoursePortalClient,data)));
 expect(host.querySelector('.cp-plan')?.textContent).toContain('剩餘 8 堂');expect(host.querySelector('.cp-plan')?.textContent).toContain('1/1');expect(host.querySelector('.cp-plan')?.textContent).toContain('方案金額 NT$ 4,800');
 expect(host.querySelectorAll('[data-lesson-slot]')).toHaveLength(10);expect(host.querySelectorAll('[data-completed="true"]')).toHaveLength(2);expect(host.querySelector('.cp-ledger')).toBeNull();expect(host.textContent).not.toContain('其他堂數異動');
});

it.each([false,true])('keeps the member plan grid open with its purchased price above it (%s music)',async musicStore=>{
 const base=props();
 await render({...base,musicStore,initialView:'plans',cards:[{...base.cards[0],unit:'SESSION',grid:{total:10,dates:[],completed:[]},purchases:[{id:'paid-plan',createdAt:'2099-01-01T02:00Z',price:3000,points:10,status:'CONFIRMED'}]}]} as unknown as typeof base);
 const slot=host.querySelector('[data-lesson-slot]');expect(host.querySelectorAll('[data-lesson-slot]')).toHaveLength(10);expect(slot?.closest('details')).toBeNull();
 const card=slot?.closest('article');expect(card?.textContent).toContain('方案金額 NT$ 3,000');expect(card?.querySelector('.cp-plan-row')?.textContent).toContain('3,000');
 expect(card?.textContent).not.toContain('可預約課程');expect(card?.textContent).not.toContain('繳費明細');expect(card?.querySelector('summary')).toBeNull();
});

it.each([false,true])('removes repeated payment/course accordions even with actual member records (%s music)',async musicStore=>{
 const base=props();
 const records=[{id:'paid-plan',cardId:'card',name:'十堂方案',date:'2099-01-01T02:00Z',status:'CONFIRMED',termSizes:[10],templateIds:[],points:10,unit:'SESSION',due:3000,received:3000,periods:[],receipts:[],refunds:[],lessonsAvailable:true,lessons:[{id:'used',date:'2099-01-02T02:00Z',name:'鋼琴',learner:'本人',status:'已出席',period:null,ordinal:null,used:1,unit:'SESSION'}]}];
 await render({...base,musicStore,initialView:'plans',memberRecords:records,cards:[{...base.cards[0],unit:'SESSION',grid:{total:10,dates:['2099-01-02T02:00Z'],completed:[{id:'used',date:'2099-01-02T02:00Z'}]},purchases:[{id:'paid-plan',createdAt:'2099-01-01T02:00Z',price:3000,points:10,status:'CONFIRMED'}]}]} as unknown as typeof base);
 const card=host.querySelector('article.cp-plan')!;expect(card.textContent).toContain('方案金額 NT$ 3,000');expect(card.textContent).not.toContain('繳費明細');expect(card.textContent).not.toContain('可預約課程');expect(card.querySelectorAll('details')).toHaveLength(0);expect(card.querySelectorAll('[data-lesson-slot]')).toHaveLength(10);
 await act(async()=>card.querySelector<HTMLHeadingElement>('h2')!.click());expect(card.querySelector('[data-lesson-slot]')?.closest('details')).toBeNull();expect(card.querySelectorAll('[data-lesson-slot]')).toHaveLength(10);
});

it('keeps point balances and the usage list while removing repeated plan sections',async()=>{
 const base=props();await render({...base,initialView:'plans',cards:[{...base.cards[0],history:{count:1,createdAt:'2099-01-01T02:00Z',lessons:[{id:'used',name:'瑜珈',startsAt:'2099-01-02T02:00Z',customerId:'member',customerName:'本人',status:'已出席',used:2}]}}]} as unknown as typeof base);
 const card=host.querySelector('article.cp-plan')!;expect(card.textContent).toContain('剩餘 10 點');expect(card.textContent).toContain('瑜珈');expect(card.textContent).toContain('2 點');expect(card.querySelectorAll('[data-lesson-slot]')).toHaveLength(0);expect(card.querySelectorAll('[data-lesson]')).toHaveLength(1);expect(card.textContent).not.toContain('可預約課程');
});
