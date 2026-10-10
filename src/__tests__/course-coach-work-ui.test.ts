// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoursePortalData } from "@/app/(customer)/book/course-portal";
const m = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn(), attendance: vi.fn(), checkIn: vi.fn(), note: vi.fn(), usage: vi.fn(), loadUsage: vi.fn(), purchase: vi.fn(), booking: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh, replace: m.replace }), usePathname: () => "/s/a/book", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/customer-labels", () => ({ CustomerLabelsProvider: ({children}: {children: unknown}) => children, CustomerLabels: () => null }));
vi.mock("@/components/share-referral", () => ({ ShareReferral: () => null }));
vi.mock("@/server/actions/course-referral-share", () => ({ trackCourseShare: vi.fn() }));
vi.mock("@/components/steam-butler-logo", () => ({ SteamButlerLogo: () => null }));
vi.mock("@/components/logout-button", () => ({ LogoutButton: () => null }));
vi.mock("@/server/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/components/course-member-contact-form", () => ({ CourseMemberContactForm: () => null }));
vi.mock("@/components/course-health-workspace", () => ({ CourseHealthWorkspace: () => null }));
vi.mock("@/server/actions/course-members", () => ({ createMemberCourseBooking: m.booking, markCourseCoachAttendance: m.checkIn, updateCourseBookingStatus: vi.fn() }));
vi.mock("@/server/actions/course-portal", () => ({ saveCourseAttendance: m.attendance, saveCourseCoachNote: m.note, purchaseCoursePlan: m.purchase }));
vi.mock("@/server/actions/course-companions", () => ({addCourseCompanion: vi.fn(), loadCourseCompanionUsage: m.loadUsage, saveCourseCompanionUsage: m.usage}));
vi.mock("@/server/actions/course-waitlist", () => ({joinMemberCourseWaitlist: vi.fn(), cancelMemberCourseWaitlistAction: vi.fn()}));
vi.mock("@/server/actions/course-booking-notification", () => ({
  loadCourseBookingNotification: vi.fn(),
  confirmMemberCourseTrial: vi.fn(),
  rescheduleMemberCourseBooking: vi.fn(),
}));
import { CoursePortalClient } from "@/app/(customer)/book/course-portal-client";
let host: HTMLDivElement, root: Root;
const learner = (id: string, checkedIn: boolean, status = "RESERVED") => ({ id, customerId: id, cardId: "card-a", companionIndex: null, reserverName: null, canAddCompanion: false, customerName: id, checkedIn, status, notes: "",serviceNote:"", updatedAt: "2026-09-20T02:00:00.000Z", cost: 2, available: 6, unit: "POINT", planName: "十點", expiresAt: null });
const props = () => ({ initialRole: "coach", rolePreferenceKey:"test-coach-role", month: "2026-09", serverNow: Date.parse("2026-09-20T11:00:00+08:00"), initialDate: "2026-09-20", memberEnabled: false, hasWork: true, customerId: "coach", customerName: "教練", storeName: "A", prefix: "/s/a", cards: [], plans: [], templates: [], bookings: [], orders: [], sessions: [], hours: [], special: [], config: {}, bookingWindow: { closesAt: "2026-10-20T00:00:00Z" }, nextWork: null, work: [{ id: "lesson", name: "伸展瑜珈", cost: 2, startsAt: "2026-09-20T10:00:00+08:00", endsAt: "2026-09-20T11:00:00+08:00", room: "A 教室", bookings: [learner("已到學員", true), learner("尚未到學員", false), learner("已取消學員", false, "CANCELLED")] }] }) as unknown as CoursePortalData;
const memberProps = () => ({
  ...props(),
  memberEnabled: true,
  initialRole: "member",
  rolePreferenceKey: "test-member-role",
  healthEnabled: true,
  customerId: "member",
  customerName: "會員本人",
  cancellationLeadMinutes: 120,
  nextBooking: { name: "伸展瑜珈", startsAt: "2026-09-21T10:00:00+08:00", coach: "林教練", room: "A 教室", participants: [{id:"member",name:"會員本人"},{id:"family",name:"家人"}] },
  sessions: [{ id:"session",templateId:"template",name:"伸展瑜珈",startsAt:"2026-09-21T10:00:00+08:00",coach:"林教練",room:"A 教室",cost:2,capacity:8,occupied:1,precautions:"" }],
  bookings: [{ id:"booking",sessionId:"session",name:"伸展瑜珈",startsAt:"2026-09-20T12:00:00+08:00",coach:"林教練",room:"A 教室",customerName:"會員本人",customerId:"member",operatorName:"會員本人",status:"RESERVED",notes:"",cost:2,trialPaid:null,trialPrice:null,unit:"POINT",planName:"十點方案",expiresAt:"2026-10-20T00:00:00Z" }],
  work: [],
}) as unknown as CoursePortalData;
const click = async (text: string) => {
  const button = [...host.querySelectorAll("button")].find(b => b.textContent?.includes(text));
  expect(button, text).toBeTruthy();
  await act(async () => button!.click());
};
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.scrollTo = vi.fn();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  m.attendance.mockImplementation(async (input) => ({ success: true, attendanceUpdates: input.bookings.map((b: {id:string}) => ({id:b.id,status:["CHECKED_IN", "UNDO_CHECK_IN"].includes(input.target) ? "RESERVED" : input.target,checkedIn:input.target === "ATTENDED" || input.target === "CHECKED_IN",updatedAt:"2026-09-20T03:00:00.000Z"})) }));
  m.purchase.mockResolvedValue({ success: true });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
describe("coach daily work interactions", () => {
  it("refreshes from the work account menu without submitting logout", async () => {
    await act(async()=>root.render(createElement(CoursePortalClient,props())));
    const form=host.querySelector('.cp-coach-options form') as HTMLFormElement;
    const submitted=vi.fn();form.addEventListener('submit',submitted);
    await act(async()=>(host.querySelector('.cp-coach-options summary') as HTMLElement).click());
    await act(async()=>(form.querySelector('.cp-refresh button') as HTMLButtonElement).click());
    expect(m.refresh).toHaveBeenCalledTimes(1);
    expect(submitted).not.toHaveBeenCalled();
    expect(host.querySelector('.cp-main .cp-refresh')).toBeNull();
  });

  it("keeps one income entry in the account menu across work pages", async () => {
    await act(async () => root.render(createElement(CoursePortalClient, {...props(), incomeAvailable:true})));
    for (const label of ["課表", "授課紀錄", "今日工作"]) {
      await click(label);
      const links = host.querySelectorAll('a[href^="/s/a/book/income"]');
      expect(links).toHaveLength(1);
      expect(links[0].closest(".cp-coach-options")).not.toBeNull();
    }
  });
  it("shows the music lesson unit when expanding a work roster", async () => {
    await act(async () => root.render(createElement(CoursePortalClient, {...props(), musicStore:true})));
    expect(host.querySelector('[role="list"] [role="listitem"] button')?.textContent).toContain("伸展瑜珈");
    expect(host.querySelector(".cp-course-cost")).toBeNull();
    await click("伸展瑜珈");
    expect(host.querySelector(".cp-course-cost")?.textContent).toBe("每人 2 堂");
    expect(host.textContent).not.toContain("無備註");
  });

  it("omits empty week counts and shows recorded attendance in the date-grouped list", async () => {
    const data = props();
    data.work[0].bookings = [learner("出席學員", true, "ATTENDED"), learner("未到學員", false, "NO_SHOW")];
    await act(async () => root.render(createElement(CoursePortalClient, data)));
    await click("課表");
    expect(host.querySelector(".cp-week-strip")?.textContent).not.toContain("0堂");
    expect(host.querySelector(".cp-week-strip")?.textContent).toContain("1堂");
    await click("授課紀錄");
    expect(host.querySelector(".cp-work-result")?.textContent).toBe("出席 1 位 · 未到 1 位");
    await click("伸展瑜珈");
    expect(host.querySelectorAll(".cp-roster-person")).toHaveLength(2);
    expect(m.attendance).not.toHaveBeenCalled();
  });

  it("updates companion usage and the reserver balance from the saved receipt before refresh", async () => {
    const data = props(); data.companionBookingEnabled = true;
    data.work[0].bookings = [learner("本人", false), {...learner("同行者", false), customerId: null, companionIndex: 1, reserverName: "本人"}] as CoursePortalData["work"][number]["bookings"];
    m.loadUsage.mockResolvedValue({success:true, data:{booking:{id:"同行者",name:"同行者",customerId:null,cardId:"card-a",reserverCardId:"card-a",reserverName:"本人",planName:"十點",updatedAt:"2026-09-20T02:00:00.000Z"},customers:[],cards:[],trialEnabled:true}});
    m.usage.mockResolvedValue({success:true,receipt:{booking:{id:"同行者",cardId:null,customerId:null,customerName:"同行者",updatedAt:"2026-09-20T03:01:00.000Z",cost:0,unit:"TRIAL",planName:"體驗（不使用方案）",available:null,expiresAt:null},balances:[{id:"card-a",available:8}],returned:{amount:2,unit:"POINT"},confirmedAt:data.serverNow+1}});
    await act(async () => root.render(createElement(CoursePortalClient, data)));
    await click("伸展瑜珈");
    expect(host.querySelectorAll(".cp-roster-details[open]")).toHaveLength(0);
    await click("變更使用方式");
    const select = host.querySelector("select") as HTMLSelectElement;
    await act(async () => {select.value="TRIAL";select.dispatchEvent(new Event("change",{bubbles:true}));});
    await act(async () => host.querySelector("[role=dialog] form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
    expect(host.textContent).toContain("已返還 2 點");
    expect(host.querySelector(".cp-roster-person")?.textContent).toContain("可用 8 點");
    expect(host.querySelectorAll(".cp-roster-person")[1].textContent).toContain("體驗");
    expect(m.refresh).toHaveBeenCalled();
    await act(async () => root.render(createElement(CoursePortalClient, {...data,serverNow:data.serverNow+2,work:[{...data.work[0],bookings:data.work[0].bookings.map(b=>({...b,available:9,updatedAt:"2026-09-20T03:02:00.000Z"}))}]})));
    expect(host.querySelector(".cp-roster-person")?.textContent).toContain("可用 9 點");
  });

  it("keeps twenty learners compact with expandable full names and notes", async () => {
    const data = props();
    data.work[0].bookings = Array.from({length: 20}, (_, i) => ({...learner(`學員${i + 1}超長姓名驗收`, false), serviceNote: "請留意膝蓋，避免跳躍。".repeat(8), notes: "本次希望降低強度。"})) as CoursePortalData["work"][number]["bookings"];
    await act(async () => root.render(createElement(CoursePortalClient, data)));
    await click("伸展瑜珈");
    expect(host.querySelectorAll(".cp-roster-person")).toHaveLength(20);
    expect(host.querySelectorAll(".cp-roster-details[open]")).toHaveLength(0);
    expect(host.querySelector(".cp-attendance-person .cp-roster-balance")?.textContent).toBe("可用 6 點");
    expect(host.querySelector(".cp-roster-details summary")?.textContent).toContain("本次希望降低強度");
    expect(host.querySelector(".cp-attendance-person")?.textContent).toContain("學員1超長姓名驗收");
    const details = host.querySelector(".cp-roster-details") as HTMLDetailsElement;
    await act(async () => details.querySelector("summary")!.click());
    expect(details.open).toBe(true);
    expect(details.querySelector(".cp-roster-note")?.textContent).toContain("請留意膝蓋，避免跳躍。".repeat(8));
    expect(details.querySelector(".cp-detail-open")?.textContent).toBe("收起");
    expect(details.textContent).not.toContain("學員1超長姓名驗收");
    expect(details.textContent?.split("本次希望降低強度。")).toHaveLength(2);
  });
  it("does not expand an empty roster but preserves cancelled bookings", async () => {
    const data = props(); data.work[0].bookings = [];
    await act(async () => root.render(createElement(CoursePortalClient, data)));
    await click("課表");
    const empty = host.querySelector(".cp-daily .cp-menu") as HTMLButtonElement;
    expect(empty.disabled).toBe(true);
    await act(async () => empty.click());
    expect(host.querySelector(".cp-roster-body")).toBeNull();
    data.work[0].bookings = [learner("取消學員", false, "CANCELLED")] as CoursePortalData["work"][number]["bookings"];
    await act(async () => root.render(createElement(CoursePortalClient, {...data})));
    await click("已取消預約");
    expect(host.querySelector(".cp-roster-body")?.textContent).toContain("取消學員");
  });
  it("allows attendance before class starts without a separate check-in action", async () => {
    const data = props(); data.serverNow = Date.parse("2026-09-20T09:00:00+08:00");
    await act(async () => root.render(createElement(CoursePortalClient, data)));
    await click("伸展瑜珈");
    expect(host.textContent).not.toContain("尚未開課");
    expect(host.textContent).not.toContain("報到");
    expect(host.textContent).toContain("待點名 2 位");
    expect(host.querySelectorAll(".cp-attendance-actions button")).toHaveLength(4);
    expect(m.attendance).not.toHaveBeenCalled();
  });
  it("lets a teacher correct attendance immediately after marking it", async () => {
    await act(async () => root.render(createElement(CoursePortalClient, props())));
    await click("伸展瑜珈");
    await act(async () => ([...host.querySelectorAll("button")].find(b => b.textContent === "出席") as HTMLButtonElement).click());
    expect(host.querySelector(".cp-roster-person .cp-badge")?.textContent).toBe("已出席・已扣 2 點");
    await click("更正");
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain("確認更正");
    expect([...host.querySelectorAll("select option")].map(o => o.textContent)).toEqual(expect.arrayContaining(["出席","未到","待點名"]));
  });
  it("aligns store actions and puts referral after contact information", async () => {
    await act(async () => root.render(createElement(CoursePortalClient, {...memberProps(), initialView: "store", config: {address:"竹北市測試地址一樓", mapUrl:"https://maps.google.com/", lineOfficialUrl:"https://lin.ee/test"}, referralShare:{referralUrl:"https://example.com",shareTemplate:"測試"}} as unknown as CoursePortalData)));
    const links = [...host.querySelectorAll(".cp-store-actions a")];
    expect(links.map(a => a.textContent?.trim())).toEqual(["開啟地圖", "LINE 聯絡"]);
    expect(links.every(a => a.classList.contains("cp-btn"))).toBe(true);
    expect(host.querySelector(".cp-store-info")?.nextElementSibling?.textContent).toContain("推薦給朋友");
  });
  it("moves to the next month with the chosen day and renders an empty day", async () => {
    await act(async () => root.render(createElement(CoursePortalClient, { ...props(), initialDate: "2026-09-30" })));
    await click("課表");
    expect(host.textContent).toContain("當日沒有排課");
    await act(async () => (host.querySelector('[aria-label="下一週"]') as HTMLButtonElement).click());
    expect(m.replace).toHaveBeenCalledWith("/s/a/book?month=2026-10", { scroll: false });
    await act(async () => root.render(createElement(CoursePortalClient, { ...props(), month: "2026-10", work: [] })));
    expect(host.textContent).toContain("10/7（三）");
  });
  it("preserves an unsaved note when navigation is declined", async () => {
    await act(async () => root.render(createElement(CoursePortalClient, props())));
    await click("伸展瑜珈"); await click("編輯本次備註");
    const textarea = host.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "膝蓋不適，降低強度");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await click("課表");
    expect(window.confirm).toHaveBeenCalled();
    expect((host.querySelector("textarea") as HTMLTextAreaElement).value).toBe("膝蓋不適，降低強度");
    expect(host.textContent).toContain("今天 · 2026-09-20");
    vi.restoreAllMocks();
  });
  it("starts with today's list and keeps the calendar collapsed", async () => {
    await act(async () => root.render(createElement(CoursePortalClient, props())));
    expect(host.textContent).toContain("今天 · 2026-09-20");
    expect(host.querySelector(".cp-calendar")).toBeNull();
    await click("課表");
    expect(host.querySelectorAll(".cp-week-strip button")).toHaveLength(7);
    await click("月曆"); expect(host.querySelector(".cp-calendar")).not.toBeNull();
    expect(host.querySelector(".cp-week-strip")).toBeNull();
    expect([...host.querySelectorAll("button")].filter(b => b.textContent === "今天")).toHaveLength(1);
    await click("切換週曆");
    expect(host.querySelector(".cp-calendar")).toBeNull();
    expect(host.querySelectorAll(".cp-week-strip button")).toHaveLength(7);
    expect(host.querySelector('.cp-week-strip [aria-pressed="true"] strong')?.textContent).toBe("20");
    await click("伸展瑜珈");
    expect(host.textContent).toContain("全班出席 2 人");
    expect(host.textContent).not.toContain("報到");
    expect(host.querySelectorAll(".cp-roster-person .cp-attendance-row")).toHaveLength(2);
    expect(host.querySelector(".cp-course-cost")?.textContent).toContain("每人 2 點");
    expect(host.querySelector(".cp-roster-balance")?.textContent).toBe("可用 6 點");
    expect([...host.querySelectorAll(".cp-roster-person")].every(row => row.querySelectorAll(".cp-attendance-actions button").length <= 2)).toBe(true);
  });
  it("batch attendance submits all unresolved learners regardless of old check-in and keeps the roster open", async () => {
    await act(async () => root.render(createElement(CoursePortalClient, props())));
    await click("伸展瑜珈"); await click("全班出席");
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("已到學員");
    expect(dialog.textContent).toContain("尚未到學員");
    expect(dialog.textContent).not.toContain("已取消學員");
    await click("確認 2 位出席");
    expect(m.attendance).toHaveBeenCalledWith({ sessionId: "lesson", target: "ATTENDED", bookings: [{ id: "已到學員", status: "RESERVED" }, { id: "尚未到學員", status: "RESERVED" }] });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.textContent).toContain("學員名單");
    expect(host.querySelector(".cp-roster-hint")).toBeNull();
    expect([...host.querySelectorAll(".cp-roster-person .cp-badge")].map(b => b.textContent)).toEqual(["已出席・已扣 2 點", "已出席・已扣 2 點"]);
  });
  it("batch attendance retains confirmation on failure", async () => {
    m.attendance.mockResolvedValue({ success: false, error: "名單已變更" });
    await act(async () => root.render(createElement(CoursePortalClient, props())));
    await click("伸展瑜珈"); await click("全班出席"); await click("確認 2 位出席");
    expect(m.attendance).toHaveBeenCalledWith({ sessionId: "lesson", target: "ATTENDED", bookings: [{ id: "已到學員", status: "RESERVED" }, { id: "尚未到學員", status: "RESERVED" }] });
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain("名單已變更");
  });
  it("keeps prior-month unresolved lessons on today's page and excludes them from monthly history", async () => {
    const p = props(); const old = {...p.work[0], id:"old", startsAt:"2026-08-31T10:00:00+08:00", endsAt:"2026-08-31T11:00:00+08:00", name:"跨月待辦"};
    await act(async () => root.render(createElement(CoursePortalClient,{...p, work:[old,...p.work]})));
    expect(host.textContent).toContain("過往待點名 · 1 堂");
    await click("授課紀錄");
    expect(host.textContent).not.toContain("跨月待辦");
    expect(host.textContent).toContain("已授課 0 堂 · 0 小時");
  });
  it("counts only ended completed classes with attendance and initially shows read-only history", async () => {
    const p = props(); const lesson=p.work[0];
    await act(async () => root.render(createElement(CoursePortalClient,{...p,work:[
      {...lesson,bookings:[learner("出席者",true,"ATTENDED")]},
      {...lesson,id:"no-show",bookings:[learner("未到者",false,"NO_SHOW")]},
      {...lesson,id:"empty",bookings:[]},
      {...lesson,id:"future",startsAt:"2026-09-21T10:00:00+08:00",endsAt:"2026-09-21T11:00:00+08:00",bookings:[]}
    ]})));
    await click("授課紀錄");
    expect(host.textContent).toContain("已授課 1 堂 · 1 小時");
    await click("伸展瑜珈");
    expect([...host.querySelectorAll("button")].some(b=>b.textContent==="更正")).toBe(true);
    await click("更正紀錄");
    expect([...host.querySelectorAll("button")].some(b=>b.textContent==="更正")).toBe(true);
  });

  it.each([['出席','ATTENDED'],['未到','NO_SHOW']])("saves single %s directly without a dialog", async (label,target) => {
    await act(async () => root.render(createElement(CoursePortalClient,props())));
    await click("伸展瑜珈");
    const button=[...host.querySelectorAll('button')].find(b=>b.textContent===label)!;
    await act(async()=>{button.click();button.click();});
    expect(m.attendance).toHaveBeenCalledTimes(1);
    expect(m.attendance).toHaveBeenCalledWith({sessionId:"lesson",target,bookings:[{id:"已到學員",status:"RESERVED"}]});
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.textContent).toContain(`已到學員 已標記${label}`);
  });
  it("keeps the roster and shows a direct-save error without claiming success", async()=>{
    m.attendance.mockResolvedValue({success:false,error:"名單已變更，請重試"});
    await act(async()=>root.render(createElement(CoursePortalClient,props())));
    await click("伸展瑜珈");
    await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==="出席")!.click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("名單已變更");
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.textContent).toContain("待點名");
  });

  it.each(["未到"])("shows saving on the first %s tap, then reconciles without a second tap", async label => {
    let resolve!: (value: unknown) => void;
    const action = m.attendance;
    action.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const p = props();
    await act(async () => root.render(createElement(CoursePortalClient, p)));
    await click("伸展瑜珈");
    const button = [...host.querySelectorAll("button")].find(b => b.textContent === label)!;
    const person = button.closest(".cp-person")!;
    const id = "已到學員";
    await act(async () => { button.click(); button.click(); });
    expect(action).toHaveBeenCalledTimes(1);
    expect(person.textContent).toContain("儲存中…");
    expect(button.disabled).toBe(true);
    expect(host.textContent).not.toContain("已標記未到");
    const update = { id, status: "NO_SHOW", checkedIn: false, updatedAt:"2026-09-20T03:00:00.000Z" };
    await act(async () => resolve({success:true,attendanceUpdates:[update]}));
    expect(person.querySelector(".cp-badge")?.textContent).toBe("未到");
    // A delayed refresh carrying the old row must not undo the confirmed write.
    await act(async () => root.render(createElement(CoursePortalClient, {...p, serverNow:p.serverNow+1000})));
    expect(person.querySelector(".cp-badge")?.textContent).toBe("未到");
    // A later authoritative correction is still allowed to replace the local result.
    const newer = {...p, work:p.work.map(s=>({...s,bookings:s.bookings.map(b=>b.id===id?{...b,status:"RESERVED",checkedIn:false,updatedAt:"2026-09-20T03:01:00.000Z"}:b)}))};
    await act(async () => root.render(createElement(CoursePortalClient,newer)));
    expect(person.querySelector(".cp-badge")?.textContent).toBe("待點名");
  });

});

describe("member plan and purchase navigation", () => {
  it("shows only one booking action on an empty member homepage", async () => {
    await act(async()=>root.render(createElement(CoursePortalClient,{...memberProps(),nextBooking:null})));
    expect(host.querySelector('.cp-next button')).toBeNull();
    expect([...host.querySelectorAll('button')].filter(button=>button.textContent==='立即預約')).toHaveLength(1);
  });
  it("distinguishes same-name teachers and keeps date/filter when returning across months", async () => {
    const data={...memberProps(),initialView:'schedule' as const,initialDate:'2026-09-21',sessions:[
      {...memberProps().sessions[0],id:'one',coachId:'teacher-one',name:'課程一'},
      {...memberProps().sessions[0],id:'two',coachId:'teacher-two',name:'課程二'},
    ]};
    await act(async()=>root.render(createElement(CoursePortalClient,data)));
    const select=host.querySelectorAll<HTMLSelectElement>('[aria-label="課表篩選"] select')[1];
    expect([...select.options].map(option=>option.text)).toEqual(['全部教練','林教練（同名教練 1）','林教練（同名教練 2）']);
    await act(async()=>{select.value='teacher-two';select.dispatchEvent(new Event('change',{bubbles:true}));});
    expect(host.querySelector('.cp-daily')?.textContent).toContain('課程二');
    expect(host.querySelector('.cp-daily')?.textContent).not.toContain('課程一');
    await act(async()=>(host.querySelector('.cp-month button:last-child') as HTMLButtonElement).click());
    expect(m.replace).toHaveBeenCalledWith('/s/a/book?month=2026-10&date=2026-10-21',{scroll:false});
    await act(async()=>root.render(createElement(CoursePortalClient,{...data,month:'2026-10',sessions:[]})));
    expect(host.querySelector('.cp-daily')?.textContent).toContain('10/21（三）');
    expect(host.querySelectorAll<HTMLSelectElement>('[aria-label="課表篩選"] select')[1].value).toBe('teacher-two');
    expect(host.textContent).toContain('本月無課');
    await click('我的預約');await click('預約');
    expect(host.querySelectorAll<HTMLSelectElement>('[aria-label="課表篩選"] select')[1].value).toBe('teacher-two');
    await click('清除篩選');
    expect(host.querySelectorAll<HTMLSelectElement>('[aria-label="課表篩選"] select')[1].value).toBe('');
  });
  it("shows the simplified member home, merged participants, direct role buttons and line icons", async () => {
    await act(async()=>root.render(createElement(CoursePortalClient,memberProps())));
    expect(host.textContent).toContain("林教練 · A 教室");
    expect(host.textContent).toContain("本人＋家人 · 共 2 位");
    for (const label of ["立即預約","我的預約","我的方案","健康追蹤"]) expect(host.textContent).toContain(label);
    expect(host.querySelector('[aria-label="身分"]')).toBeNull();
    expect(host.querySelectorAll('.cp-role-switch button')).toHaveLength(2);
    expect(host.querySelectorAll('.cp-nav svg')).toHaveLength(4);
    expect(host.textContent).not.toContain("操作指南");
    await click("我的工作");
    expect(host.textContent).not.toContain("操作指南");
    expect(host.textContent).toContain("今天 · 2026-09-20");
  });
  it("shows coach and room without field prefixes on course cards", async () => {
    await act(async()=>root.render(createElement(CoursePortalClient,{...memberProps(),initialDate:"2026-09-21"})));
    await click("預約");
    expect(host.querySelector(".cp-lesson")?.textContent).toContain("林教練 · A 教室");
    expect(host.querySelector(".cp-lesson")?.textContent).not.toContain("教練：");
    expect(host.querySelector(".cp-lesson")?.textContent).not.toContain("教室：");
  });
  it("keeps essential booking information visible and expands details inside the card", async () => {
    await act(async()=>root.render(createElement(CoursePortalClient,{...memberProps(),initialView:"bookings",serverNow:Date.parse("2026-09-20T13:00:00+08:00")})));
    expect(host.querySelector(".cp-booking-location")?.textContent).toBe("林教練 · A 教室 · 共 1 人");
    expect(host.textContent).toContain("待確認出席");
    expect(host.querySelector(".cp-booking-detail")).not.toBeNull();
    expect(host.querySelector(".cp-booking-detail ul")).not.toBeNull();
    await click("查看備註 ⌄");
    expect(host.querySelector(".cp-booking-detail")?.textContent).toContain("本次使用 2 點");
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    await click("收合備註 ⌃");
    expect(host.querySelector(".cp-booking-detail")?.textContent).toContain("本次使用 2 點");
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
  it("replaces late cancellation with store-contact guidance and keeps the deadline visible", async () => {
    await act(async()=>root.render(createElement(CoursePortalClient,{...memberProps(),initialView:"bookings"})));
    expect(host.textContent).toContain("已超過取消期限");
    expect(host.textContent).toContain("請洽店家");
    expect(host.querySelector(".cp-late-cancel")?.parentElement?.classList.contains("cp-booking-person-line")).toBe(true);
    expect([...host.querySelectorAll("button")].some(button=>button.textContent==="取消")).toBe(false);
    await act(async()=>root.render(createElement(CoursePortalClient,{...memberProps(),initialView:"bookings",cancellationLeadMinutes:30})));
    expect([...host.querySelectorAll("button")].some(button=>button.textContent==="取消")).toBe(true);
    expect(host.textContent).toContain("自行取消截止");
    await click("查看備註 ⌄");
    expect(host.textContent).toContain("自行取消截止");
  });
  it("uses one action when the selected course has no eligible plan", async () => {
    const data = {...memberProps(),initialDate:"2026-09-21",nextBooking:null,plans:[{id:"plan",name:"十點方案",points:10,price:2000,unit:"POINT",validDays:180,templateIds:[],termSessionIds:[]}]};
    await act(async()=>root.render(createElement(CoursePortalClient,data as unknown as CoursePortalData)));
    await click("預約");
    await act(async()=> (host.querySelector(".cp-lesson .primary") as HTMLButtonElement).click());
    const dialog=host.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("查看可購買方案");
    expect([...dialog.querySelectorAll("button")].filter(button=>button.textContent?.includes("NT$"))).toHaveLength(0);
  });
  it("collects only four transfer digits and exposes account copy beside the bank account", async () => {
    const data = {
      ...memberProps(),
      initialView: "shop",
      plans: [{id:"plan",name:"十點方案",points:10,price:2300,unit:"POINT",validDays:180,templateIds:[],termSessionIds:[]}],
      config: {bankName:"永豐銀行",bankCode:"807",bankAccountNumber:"19300400065479"},
    } as unknown as CoursePortalData;
    await act(async()=>root.render(createElement(CoursePortalClient,data)));
    const buyButton = [...host.querySelectorAll("button")].find(button => button.textContent === "購買");
    expect(buyButton).toBeTruthy();
    await act(async()=>buyButton!.click());
    const input = host.querySelector('[aria-label="轉出帳號後四碼"]') as HTMLInputElement;
    expect(input.maxLength).toBe(4);
    expect(host.textContent).toContain("複製帳號");
    expect(host.textContent).not.toContain("後五碼");
    await click("複製帳號");
    await act(async()=>new Promise<void>(resolve=>requestAnimationFrame(() => resolve())));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("19300400065479");
    expect(document.activeElement).toBe(input);
  });
  it("retains four digits on failure and opens progress after retry", async () => {
    m.purchase.mockResolvedValueOnce({ success: false, error: "系統錯誤，請稍後再試" });
    const data = {
      ...memberProps(),
      initialView: "shop",
      plans: [{id:"plan",name:"十點方案",points:10,price:2300,unit:"POINT",validDays:180,templateIds:[],termSessionIds:[]}],
      config: {bankName:"永豐銀行",bankCode:"807",bankAccountNumber:"19300400065479"},
    } as unknown as CoursePortalData;
    await act(async()=>root.render(createElement(CoursePortalClient,data)));
    const buyButton = [...host.querySelectorAll("button")].find(button => button.textContent === "購買")!;
    await act(async()=>buyButton.click());
    const input = host.querySelector('[aria-label="轉出帳號後四碼"]') as HTMLInputElement;
    await act(async()=>{
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,"1234");
      input.dispatchEvent(new Event("input",{bubbles:true}));
    });
    await click("已匯款，送出核帳資料");
    expect(host.textContent).toContain("系統錯誤，請稍後再試");
    expect(input.value).toBe("1234");
    expect(m.refresh).not.toHaveBeenCalled();
    const retry = [...host.querySelectorAll("button")].find(button => button.textContent === "已匯款，送出核帳資料")!;
    expect(retry.disabled).toBe(false);
    await click("已匯款，送出核帳資料");
    expect(m.purchase.mock.calls[0][0].requestKey).toBe(m.purchase.mock.calls[1][0].requestKey);
    await act(async()=>new Promise(resolve=>setTimeout(resolve,0)));
    expect(m.purchase).toHaveBeenCalledWith(expect.objectContaining({planId:"plan",transferLastFive:"1234"}));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.textContent).toContain("購買紀錄");
    expect(window.scrollTo).toHaveBeenCalledWith(0,0);
  });
  it("keeps expired cards collapsed while preserving distinct units and expiry", async () => {
    const card = (id:string, expired:boolean, unit:string) => ({id,name:id,expired,closed:false,unit,remaining:10,held:2,available:8,expiresAt:"2026-10-20T00:00:00Z",members:[],entries:[],templateIds:[]});
    await act(async()=>root.render(createElement(CoursePortalClient,{...props(),memberEnabled:true,initialRole:"member",initialView:"plans",cards:[card("有效堂數方案",false,"SESSION"),card("過期點數方案",true,"POINT")] as unknown as CoursePortalData["cards"]})));
    expect(host.textContent).toContain("有效堂數方案");
    expect(host.textContent).not.toContain("過期點數方案");
    await click("查看已到期");
    expect(host.textContent).toContain("過期點數方案");
    await click("收起已到期");
    expect(host.textContent).not.toContain("過期點數方案");
  });
  it("lists actual lesson dates and times inside each plan, separately from ledger timestamps", async () => {
    const data = memberProps();
    data.cards = [{id:"card",name:"十點方案",unit:"POINT",available:8,remaining:8,held:0,expiresAt:"2026-10-20",expired:false,closed:false,members:[{id:"member",name:"本人"},{id:"family",name:"家人"}],templateIds:[],entries:[{id:"entry",kind:"CORRECT:ATTENDED:CANCELLED",points:2,createdAt:"2026-10-06T08:21:00Z"}],history:{count:2,lessons:[{id:"lesson",name:"基礎伸展",startsAt:"2026-09-18T04:00:00Z",customerName:"家人",status:"已出席",used:2},{id:"cancelled",name:"瑜珈",startsAt:"2026-09-17T02:00:00Z",customerName:"本人",status:"已取消",used:0}]}}] as unknown as CoursePortalData["cards"];
    await act(async()=>root.render(createElement(CoursePortalClient,{...data,initialView:"plans"})));
    const rows = [...host.querySelectorAll(".cp-history-list tr[data-lesson]")];
    expect(rows[0].textContent).toContain("9/18（五）"); expect(rows[0].textContent).toContain("12:00");
    expect(rows[0].textContent).toContain("基礎伸展"); expect(rows[0].textContent).toContain("家人"); expect(rows[0].textContent).toContain("2 點");
    expect(rows[1].textContent).toContain("未扣抵");
    expect(host.querySelector(".cp-history-list")?.textContent).not.toContain("2026-10-06");
    expect(host.querySelector(".cp-ledger-list")?.textContent).toContain("2026-10-06 16:21");
    expect(host.querySelector("[role=dialog]")).toBeNull();
    data.cards[0].members = [{id:"member",name:"本人"}];
    await act(async()=>root.render(createElement(CoursePortalClient,{...data,initialView:"plans"})));
    expect(host.querySelector(".cp-history-list")?.textContent).toContain("家人");
  });
  it("shows three recent rows, groups months and preserves expanded history across navigation", async () => {
    const data = memberProps();
    data.cards = [{id:"card",name:"十點方案",unit:"POINT",available:8,remaining:8,held:0,expiresAt:"2026-10-20",expired:false,closed:false,members:[{id:"member",name:"會員本人"}],templateIds:[],entries:[],purchases:[{id:"purchase",points:10,createdAt:"2026-08-01T00:00:00Z",status:"CONFIRMED"}],history:{count:4,lessons:[
      {id:"1",name:"瑜珈一",startsAt:"2026-10-01T04:00:00Z",customerId:"member",customerName:"舊姓名",status:"已出席",used:2},
      {id:"2",name:"瑜珈二",startsAt:"2026-09-18T04:00:00Z",customerId:"member",customerName:"會員本人",status:"已出席",used:2},
      {id:"3",name:"瑜珈三",startsAt:"2026-09-17T04:00:00Z",customerId:null,customerName:"同行朋友",status:"請假",used:0},
      {id:"4",name:"瑜珈四",startsAt:"2026-08-30T04:00:00Z",customerId:"member",customerName:"會員本人",status:"已取消",used:0},
    ]}}] as unknown as CoursePortalData["cards"];
    await act(async()=>root.render(createElement(CoursePortalClient,{...data,initialView:"plans"})));
    expect(host.querySelector(".cp-plan")?.hasAttribute("open")).toBe(false);
    await act(async()=>{ (host.querySelector(".cp-plan-row") as HTMLElement).click(); await new Promise(resolve=>setTimeout(resolve,0)); });
    expect(host.querySelector(".cp-plan")?.hasAttribute("open")).toBe(true);
    expect([...host.querySelectorAll(".cp-history-list thead th")].map(el=>el.textContent)).toEqual(["日期時間","課程","使用點數"]);
    expect(host.querySelectorAll(".cp-history-list tr[data-lesson]")).toHaveLength(3);
    expect(host.textContent).toContain("2026 年 10 月"); expect(host.textContent).toContain("2026 年 9 月");
    expect(host.textContent).not.toContain("舊姓名"); expect(host.textContent).toContain("同行朋友");
    expect(host.textContent).toContain("剩餘 8"); expect(host.textContent).not.toContain("已預約 0");
    expect(host.textContent).toContain("購買 10 點｜8/1 購買｜10/20 到期");
    expect(host.querySelector('.cp-ledger')).toBeNull(); expect(host.querySelector('.cp-purchase-history')).toBeNull();
    await click("查看全部 4 筆");
    expect(host.querySelectorAll(".cp-history-list tr[data-lesson]")).toHaveLength(4);
    expect(host.textContent).toContain("2026 年 8 月");
    await act(async()=>host.querySelector<HTMLButtonElement>(".cp-nav button:last-child")!.click()); await click("我的方案");
    expect(host.querySelectorAll(".cp-history-list tr[data-lesson]")).toHaveLength(4);
    expect(host.querySelector(".cp-plan")?.hasAttribute("open")).toBe(true);
    await click("收起紀錄"); expect(host.querySelectorAll(".cp-history-list tr[data-lesson]")).toHaveLength(3);
  });
  it("distinguishes same-name cards and shows the history limit and actual leave debit", async () => {
    const data = memberProps();
    const card = (id: string, createdAt: string, used: number) => ({id,name:"十點方案",unit:"POINT",available:8,remaining:8,held:0,expiresAt:"2026-10-20",expired:false,closed:false,members:[],templateIds:[],entries:[],purchases:[],history:{createdAt,count:103,lessons:Array.from({length:100},(_,i)=>({id:`${id}-${i}`,name:id,startsAt:"2026-09-18T04:00:00Z",customerId:"member",customerName:"會員本人",status:"請假",used}))}});
    data.cards = [card("舊方案課程","2026-08-01T00:00:00Z",2),card("續報課程","2026-09-01T00:00:00Z",0)] as unknown as CoursePortalData["cards"];
    await act(async()=>root.render(createElement(CoursePortalClient,{...data,initialView:"plans"})));
    const plans = host.querySelectorAll(".cp-plan");
    expect(plans[0].textContent).toContain("2026-08-01");
    expect(plans[1].textContent).toContain("2026-09-01");
    expect(plans[0].textContent).toContain("2 點");
    expect(plans[1].textContent).toContain("未扣抵");
    expect(plans[0].textContent).not.toContain("續報課程");
    expect(host.textContent).not.toContain("查看全部 103");
    await click("查看最近 100 筆");
    expect(plans[0].querySelectorAll(".cp-history-list tr[data-lesson]")).toHaveLength(100);
    expect(plans[1].querySelectorAll(".cp-history-list tr[data-lesson]")).toHaveLength(3);
  });
  it("refreshes a restored page while retaining the visibility and debounce guards", async () => {
    const visibility = Object.getOwnPropertyDescriptor(document,"visibilityState");
    const clock = vi.spyOn(Date,"now").mockReturnValue(0);
    try {
      Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});
      await act(async()=>root.render(createElement(CoursePortalClient,memberProps())));
      clock.mockReturnValue(16000);
      await act(async()=>window.dispatchEvent(new Event("pageshow")));
      expect(m.refresh).toHaveBeenCalledTimes(1);
      clock.mockReturnValue(17000);
      await act(async()=>window.dispatchEvent(new Event("pageshow")));
      expect(m.refresh).toHaveBeenCalledTimes(1);
      Object.defineProperty(document,"visibilityState",{configurable:true,value:"hidden"});
      clock.mockReturnValue(32000);
      await act(async()=>window.dispatchEvent(new Event("pageshow")));
      expect(m.refresh).toHaveBeenCalledTimes(1);
    } finally {
      clock.mockRestore();
      if (visibility) Object.defineProperty(document,"visibilityState",visibility);
      else Reflect.deleteProperty(document,"visibilityState");
    }
  });
  it("orders reserved plans before other effective plans and keeps archived plans last", async () => {
    const card=(id:string,held:number,expired=false)=>({id,name:id,unit:"POINT",available:8,remaining:10,held,expired,closed:false,expiresAt:"2026-10-20",members:[],entries:[],templateIds:[]});
    await act(async()=>root.render(createElement(CoursePortalClient,{...memberProps(),initialView:"plans",cards:[card("其他方案",0),card("已到期",0,true),card("目前使用",2)] as unknown as CoursePortalData["cards"]})));
    expect([...host.querySelectorAll('.cp-plan h2')].map(el=>el.textContent)).toEqual(["目前使用","其他方案"]);
    await click("查看已到期");
    expect([...host.querySelectorAll('.cp-plan h2')].map(el=>el.textContent)).toEqual(["目前使用","其他方案","已到期"]);
  });
  it("shows pending orders first and exposes completed orders only in history", async () => {
    const order=(id:string,status:string)=>({id,name:id,status,price:500,listPrice:null,points:4,unit:"SESSION",termSizes:[],bonus:0,createdAt:"2026-09-20T00:00:00Z",refunds:[]});
    await act(async()=>root.render(createElement(CoursePortalClient,{...props(),memberEnabled:true,initialRole:"member",initialView:"plans",orders:[order("等待確認購買","PENDING"),order("先前核帳購買","CONFIRMED")] as unknown as CoursePortalData["orders"]})));
    await click("購買方案");
    await act(async()=>host.querySelector<HTMLElement>(".cp-purchase-history summary")!.click());
    expect(host.querySelector(".cp-purchase-history")?.hasAttribute("open")).toBe(true);
    expect(host.querySelector("[role=dialog]")).toBeNull();
    expect(host.textContent).toContain("等待確認購買");
    expect(host.textContent).not.toContain("先前核帳購買");
    await click("歷史紀錄");
    expect(host.textContent).toContain("先前核帳購買");
    expect(host.textContent).not.toContain("等待確認購買");
    await act(async()=>host.querySelector<HTMLButtonElement>(".cp-nav button:last-child")!.click()); await click("我的方案");
    expect(host.textContent).not.toContain("各方案期限與適用課程分開計算");
  });
});


describe("simple companion booking", () => {
  function bookingProps(shared = true) {
    return {...memberProps(), initialView: "schedule" as const, companionBookingEnabled: true,
      cards: [{id: "card-a", name: "自由選課", unit: "POINT", termSessionIds: [], templateIds: [], allowShared: shared, available: 10, remaining: 10, expired: false, closed: false, expiresAt: "2099-12-31", members: [{id: "member", name: "本人"}]}],
      sessions: [{id: "session", templateId: "template", name: "瑜珈", startsAt: "2026-09-20T12:00:00+08:00", coach: "教練", room: "教室", cost: 2, capacity: 3, occupied: 0, precautions: "", waitlistAllowed: false}],
    } as unknown as CoursePortalData;
  }
  it("defaults to one and submits three people with both companion names empty", async () => {
    m.booking.mockResolvedValue({success: true});
    await act(async () => root.render(createElement(CoursePortalClient, bookingProps())));
    await act(async () => (host.querySelector(".cp-lesson button") as HTMLButtonElement).click());
    expect(host.querySelector('.cp-headcount button[aria-pressed="true"]')?.textContent).toBe("1 人");
    await click("3 人");
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain("人數：3 人");
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain("本次保留：3 人 × 2 點＝6 點");
    expect(host.querySelector('.cp-headcount')?.parentElement?.querySelector('input[type="checkbox"]')).toBeNull();
    expect(host.querySelector('[role="dialog"]')?.textContent).not.toContain("下一步");
    await click("確認預約");
    expect(m.booking).toHaveBeenCalledWith(expect.objectContaining({sessionId: "session", cardId: "card-a", customerIds: ["member"], companionNames: ["", ""]}));
  });
  it("shows committed bookings and held points before a page refresh, then uses the fresh snapshot", async () => {
    const data = bookingProps();
    data.bookings = []; data.nextBooking = null;
    data.cards[0].held = 0; data.cards[0].entries = [];
    const updates = ["本人", "同行者 1", "同行者 2"].map((name, i) => ({id: `new-${i}`, sessionId: "session", cardId: "card-a", customerId: i ? null : "member", customerName: name, operatorName: "本人", reserverCustomerId: "member", status: "RESERVED", cost: 2, confirmedAt: data.serverNow + 1000}));
    m.booking.mockResolvedValue({success: true, bookingUpdates: updates});
    await act(async () => root.render(createElement(CoursePortalClient, data)));
    await act(async () => (host.querySelector(".cp-lesson button") as HTMLButtonElement).click());
    await click("3 人"); await click("確認預約");
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector('.cp-lesson')?.textContent).toContain('已預約');
    expect(host.querySelector('.cp-nav button[aria-current="page"]')?.textContent).toBe('預約');
    await act(async () => ([...host.querySelectorAll("button")].find(b => b.textContent === "我的") as HTMLButtonElement).click());
    await click("我的方案");
    expect(host.textContent).toContain("還能預約 4 點");
    const snapshot = {...data, serverNow: data.serverNow + 2000, bookings: updates.map(b => ({...b, name: "瑜珈", startsAt: data.sessions[0].startsAt, coach: "教練", room: "教室", notes: "", unit: "POINT", planName: "自由選課", trialPaid: null, trialPrice: null, expiresAt: data.cards[0].expiresAt})), cards: [{...data.cards[0], available: 4, held: 6}]} as unknown as CoursePortalData;
    await act(async () => root.render(createElement(CoursePortalClient, snapshot)));
    expect(host.textContent).toContain("還能預約 4 點");
    await click("我的預約");
    expect(host.querySelectorAll('.cp-booking-person-line')).toHaveLength(3);
  });
  it("responds immediately, blocks duplicate taps, and preserves inputs after a failure", async () => {
    let finish!: (value: {success: boolean; error: string}) => void;
    m.booking.mockImplementation(() => new Promise(resolve => {finish = resolve;}));
    await act(async () => root.render(createElement(CoursePortalClient, bookingProps())));
    await act(async () => (host.querySelector(".cp-lesson button") as HTMLButtonElement).click());
    await click("2 人");
    const submit = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === "確認預約")!;
    await act(async () => {submit.click(); submit.click();});
    expect(m.booking).toHaveBeenCalledTimes(1);
    expect(submit.textContent).toBe("預約中…"); expect(submit.disabled).toBe(true);
    expect(host.textContent).not.toContain("預約成功");
    await act(async () => finish({success: false, error: "本堂已滿"}));
    expect(host.querySelector('.cp-headcount button[aria-pressed="true"]')?.textContent).toBe("2 人");
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain("本堂已滿");
    expect(submit.disabled).toBe(false);
  });
  it("respects the existing plan sharing setting", async () => {
    await act(async () => root.render(createElement(CoursePortalClient, bookingProps(false))));
    await act(async () => (host.querySelector(".cp-lesson button") as HTMLButtonElement).click());
    expect([...host.querySelectorAll<HTMLButtonElement>('.cp-headcount button')].map(button => button.disabled)).toEqual([false, true, true]);
  });
  it("blocks new anonymous companions in LOCKED while keeping self booking", async()=>{
    m.booking.mockResolvedValue({success:true});
    await act(async()=>root.render(createElement(CoursePortalClient,{...bookingProps(),sharedCardState:"LOCKED"})));
    await act(async()=> (host.querySelector(".cp-lesson button") as HTMLButtonElement).click());
    expect([...host.querySelectorAll<HTMLButtonElement>(".cp-headcount button")].map(button=>button.disabled)).toEqual([false,true,true]);
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain("功能未開通");
    await click("確認預約");
    expect(m.booking).toHaveBeenCalledWith(expect.objectContaining({customerIds:["member"],companionNames:[]}));
  });
  it("removes anonymous controls and stale extra people when an open booking becomes HIDDEN", async()=>{
    const data=bookingProps();m.booking.mockResolvedValue({success:true});
    await act(async()=>root.render(createElement(CoursePortalClient,data)));
    await act(async()=> (host.querySelector(".cp-lesson button") as HTMLButtonElement).click());
    await click("3 人");
    await act(async()=>root.render(createElement(CoursePortalClient,{...data,sharedCardState:"HIDDEN"})));
    expect(host.querySelector(".cp-headcount")).toBeNull();
    expect(host.querySelector('[role="dialog"]')?.textContent).not.toContain("同行姓名");
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain("人數：1 人");
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain("本次保留：1 人 × 2 點＝2 點");
    await click("確認預約");
    expect(m.booking).toHaveBeenCalledWith(expect.objectContaining({customerIds:["member"],companionNames:[]}));
  });
  it.each(["LOCKED","HIDDEN"] as const)("keeps named-member proxy bookings in %s without creating anonymous companions",async(sharedCardState)=>{
    const data=bookingProps();data.cards[0].members.push({id:"family",name:"已有授權且姓名很長的家庭成員"});
    m.booking.mockResolvedValue({success:true});
    await act(async()=>root.render(createElement(CoursePortalClient,{...data,sharedCardState})));
    await act(async()=> (host.querySelector(".cp-lesson button") as HTMLButtonElement).click());
    expect(host.querySelector(".cp-headcount")).toBeNull();
    const choices=[...host.querySelectorAll<HTMLInputElement>('[role="dialog"] input[type="checkbox"]')];
    expect(choices).toHaveLength(2);
    await act(async()=>{choices[0].click();choices[1].click();});
    expect([...host.querySelectorAll("button")].some(button=>button.textContent==="下一步")).toBe(false);
    await click("確認預約");
    expect(m.booking).toHaveBeenCalledWith(expect.objectContaining({customerIds:["family"],companionNames:undefined}));
  });
  it("drops removed named authorizations from an open booking instead of submitting stale ids",async()=>{
    const data=bookingProps();data.cards[0].members.push({id:"family",name:"原授權成員"});
    await act(async()=>root.render(createElement(CoursePortalClient,{...data,sharedCardState:"HIDDEN"})));
    await act(async()=> (host.querySelector(".cp-lesson button") as HTMLButtonElement).click());
    const choices=[...host.querySelectorAll<HTMLInputElement>('[role="dialog"] input[type="checkbox"]')];
    await act(async()=>{choices[0].click();choices[1].click();});
    // Preserve named mode by keeping a different authorized family member in the latest snapshot.
    const latest={...data,cards:[{...data.cards[0],members:[{id:"member",name:"本人"},{id:"other",name:"另一位授權成員"}]}],sharedCardState:"HIDDEN" as const};
    await act(async()=>root.render(createElement(CoursePortalClient,latest)));
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain("人數：0 人");
    const submit=[...host.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==="確認預約")!;
    expect(submit.disabled).toBe(true);expect(m.booking).not.toHaveBeenCalled();
  });
  it("reopens a booking with a clean one-person selection",async()=>{
    await act(async()=>root.render(createElement(CoursePortalClient,bookingProps())));
    await act(async()=> (host.querySelector(".cp-lesson button") as HTMLButtonElement).click());await click("3 人");
    await act(async()=>host.querySelector<HTMLButtonElement>('[role="dialog"] [aria-label="關閉"]')!.click());
    await act(async()=> (host.querySelector(".cp-lesson button") as HTMLButtonElement).click());
    expect(host.querySelector('.cp-headcount button[aria-pressed="true"]')?.textContent).toBe("1 人");
    expect(host.querySelector('[placeholder="姓名（選填）"]')).toBeNull();
  });
  it("hides shared navigation and new-sharing help but retains legacy card detail/history",async()=>{
    const data=bookingProps();data.cards[0].members.push({id:"family",name:"已有授權成員"});data.cards[0].entries=[];
    await act(async()=>root.render(createElement(CoursePortalClient,{...data,initialView:"home"})));
    await act(async()=> ([...host.querySelectorAll<HTMLButtonElement>("button")].find(button=>button.textContent==="我的")!).click());
    await click("我的方案");
    await act(async()=>root.render(createElement(CoursePortalClient,{...data,sharedCardState:"HIDDEN"})));
    expect(host.textContent).toContain("我的方案");expect(host.textContent).toContain("授權成員（2 人）");expect(host.textContent).toContain("已有授權成員");expect(host.querySelector(".cp-plan-history")).toBeNull();
    await act(async()=> ([...host.querySelectorAll<HTMLButtonElement>("button")].find(button=>button.textContent==="我的")!).click());
    expect([...host.querySelectorAll("button")].some(button=>button.textContent?.startsWith("共卡成員"))).toBe(false);
    await click("首頁");
    expect(host.textContent).not.toContain("操作指南");
    expect(host.textContent).not.toContain("如何預約 1–3 人同行");expect(host.textContent).not.toContain("如何替共卡成員預約");
  });
  it("keeps blue self and orange other attendees regardless of who operated the booking when HIDDEN",async()=>{
    const data=memberProps();data.cancellationLeadMinutes=30;
    data.bookings=[{...data.bookings[0],operatorName:"他人代約"},{...data.bookings[0],id:"other-booking",customerId:"family",customerName:"家人",operatorName:"會員本人"}];
    await act(async()=>root.render(createElement(CoursePortalClient,{...data,initialView:"bookings",sharedCardState:"HIDDEN"})));
    const names=[...host.querySelectorAll(".cp-booking-person-line strong")].map(node=>node.textContent);
    expect(names).toEqual(["🔵 會員本人","🟠 家人"]);
    expect([...host.querySelectorAll("button")].filter(button=>button.textContent==="取消")).toHaveLength(2);
  });

});
