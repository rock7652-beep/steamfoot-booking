// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoursePortalData } from "@/app/(customer)/book/course-portal";
const m = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn(), attendance: vi.fn(), checkIn: vi.fn(), note: vi.fn(), purchase: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh, replace: m.replace }), usePathname: () => "/s/a/book", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/share-referral", () => ({ ShareReferral: () => null }));
vi.mock("@/server/actions/course-referral-share", () => ({ trackCourseShare: vi.fn() }));
vi.mock("@/components/steam-butler-logo", () => ({ SteamButlerLogo: () => null }));
vi.mock("@/components/logout-button", () => ({ LogoutButton: () => null }));
vi.mock("@/server/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/components/course-member-contact-form", () => ({ CourseMemberContactForm: () => null }));
vi.mock("@/components/course-health-workspace", () => ({ CourseHealthWorkspace: () => null }));
vi.mock("@/server/actions/course-members", () => ({ createMemberCourseBooking: vi.fn(), markCourseCoachAttendance: m.checkIn, updateCourseBookingStatus: vi.fn() }));
vi.mock("@/server/actions/course-portal", () => ({ saveCourseAttendance: m.attendance, saveCourseCoachNote: m.note, purchaseCoursePlan: m.purchase }));
import { CoursePortalClient } from "@/app/(customer)/book/course-portal-client";
let host: HTMLDivElement, root: Root;
const learner = (id: string, checkedIn: boolean, status = "RESERVED") => ({ id, customerId: id, customerName: id, checkedIn, status, notes: "",serviceNote:"", updatedAt: "2026-09-20T02:00:00.000Z", cost: 2, available: 6, unit: "POINT", planName: "十點", expiresAt: null });
const props = () => ({ month: "2026-09", serverNow: Date.parse("2026-09-20T11:00:00+08:00"), initialDate: "2026-09-20", memberEnabled: false, hasWork: true, customerId: "coach", customerName: "教練", storeName: "A", prefix: "/s/a", cards: [], plans: [], templates: [], bookings: [], orders: [], sessions: [], hours: [], special: [], config: {}, bookingWindow: { closesAt: "2026-10-20T00:00:00Z" }, nextWork: null, work: [{ id: "lesson", name: "伸展瑜珈", cost: 2, startsAt: "2026-09-20T10:00:00+08:00", endsAt: "2026-09-20T11:00:00+08:00", room: "A 教室", bookings: [learner("已到學員", true), learner("尚未到學員", false), learner("已取消學員", false, "CANCELLED")] }] }) as unknown as CoursePortalData;
const memberProps = () => ({
  ...props(),
  memberEnabled: true,
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
  it("keeps twenty learners compact with expandable full names and notes", async () => {
    const data = props();
    data.work[0].bookings = Array.from({length: 20}, (_, i) => ({...learner(`學員${i + 1}超長姓名驗收`, false), serviceNote: "請留意膝蓋，避免跳躍。".repeat(8), notes: "本次希望降低強度。"})) as CoursePortalData["work"][number]["bookings"];
    await act(async () => root.render(createElement(CoursePortalClient, data)));
    await click("伸展瑜珈");
    expect(host.querySelectorAll(".cp-roster-person")).toHaveLength(20);
    expect(host.querySelectorAll(".cp-roster-details[open]")).toHaveLength(0);
    expect(host.querySelector(".cp-attendance-person .cp-roster-balance")?.textContent).toBe("可用 6 點");
    expect(host.querySelector(".cp-roster-details summary")?.textContent).toContain("本次希望降低強度");
    expect(host.querySelector(".cp-roster-details")?.textContent).toContain("學員1超長姓名驗收");
  });
  it("undoes check-in on a future class and restores the check-in button", async () => {
    const data = props(); data.serverNow = Date.parse("2026-09-20T09:00:00+08:00");
    await act(async () => root.render(createElement(CoursePortalClient, data)));
    await click("伸展瑜珈"); await click("撤銷報到");
    expect(m.attendance).toHaveBeenCalledWith({sessionId:"lesson",target:"UNDO_CHECK_IN",bookings:[{id:"已到學員",status:"RESERVED"}]});
    expect(host.querySelector(".cp-roster-person")?.textContent).toContain("待報到");
    expect(host.querySelector(".cp-roster-person button")?.textContent).toBe("報到");
  });
  it("lets a teacher correct attendance immediately after marking it", async () => {
    await act(async () => root.render(createElement(CoursePortalClient, props())));
    await click("伸展瑜珈");
    await act(async () => ([...host.querySelectorAll("button")].find(b => b.textContent === "出席") as HTMLButtonElement).click());
    await click("更正");
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
    expect(host.textContent).toContain("2026-10-07");
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
    await click("伸展瑜珈");
    expect(host.textContent).toContain("全班報到 1 人");
    expect(host.textContent).toContain("已報到全數出席 1 人");
    expect(host.querySelectorAll(".cp-roster-person .cp-attendance-row")).toHaveLength(2);
    expect(host.querySelector(".cp-course-cost")?.textContent).toContain("2 點／1 堂");
    expect(host.querySelector(".cp-roster-balance")?.textContent).toBe("可用 6 點");
    expect([...host.querySelectorAll(".cp-roster-person")].every(row => row.querySelectorAll(".cp-attendance-actions button").length <= 2)).toBe(true);
  });
  it("batch attendance only submits checked-in learners and keeps the roster open", async () => {
    await act(async () => root.render(createElement(CoursePortalClient, props())));
    await click("伸展瑜珈"); await click("已報到全數出席");
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
  it("keeps prior-month unresolved lessons on today's page and excludes them from monthly history", async () => {
    const p = props(); const old = {...p.work[0], id:"old", startsAt:"2026-08-31T10:00:00+08:00", endsAt:"2026-08-31T11:00:00+08:00", name:"跨月待辦"};
    await act(async () => root.render(createElement(CoursePortalClient,{...p, work:[old,...p.work]})));
    expect(host.textContent).toContain("有 1 堂過往課程待完成點名");
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
    expect(host.textContent).toContain("已報到・待出席");
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
  it("shows the simplified member home, merged participants, direct role buttons and line icons", async () => {
    await act(async()=>root.render(createElement(CoursePortalClient,memberProps())));
    expect(host.textContent).toContain("林教練 · A 教室");
    expect(host.textContent).toContain("本人＋家人 · 共 2 位");
    for (const label of ["立即預約","我的預約","我的方案","健康紀錄","操作指南"]) expect(host.textContent).toContain(label);
    expect(host.querySelector('[aria-label="身分"]')).toBeNull();
    expect(host.querySelectorAll('.cp-role-switch button')).toHaveLength(2);
    expect(host.querySelectorAll('.cp-nav svg')).toHaveLength(4);
    await click("我的工作");
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
    expect(host.querySelector(".cp-booking-location")?.textContent).toBe("林教練 · A 教室");
    expect(host.textContent).toContain("待確認出席");
    expect(host.querySelector(".cp-booking-detail")).toBeNull();
    await click("明細 ⌄");
    expect(host.querySelector(".cp-booking-detail")?.textContent).toContain("本次使用 2 點");
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    await click("收合 ⌃");
    expect(host.querySelector(".cp-booking-detail")).toBeNull();
  });
  it("replaces late cancellation with store-contact guidance and keeps the deadline visible", async () => {
    await act(async()=>root.render(createElement(CoursePortalClient,{...memberProps(),initialView:"bookings"})));
    expect(host.textContent).toContain("已超過取消期限");
    expect(host.textContent).toContain("請洽店家");
    expect(host.querySelector(".cp-late-cancel")?.parentElement?.classList.contains("cp-booking-person-line")).toBe(true);
    expect([...host.querySelectorAll("button")].some(button=>button.textContent==="取消")).toBe(false);
    await act(async()=>root.render(createElement(CoursePortalClient,{...memberProps(),initialView:"bookings",cancellationLeadMinutes:30})));
    expect([...host.querySelectorAll("button")].some(button=>button.textContent==="取消")).toBe(true);
    expect(host.textContent).not.toContain("自行取消截止");
    await click("明細 ⌄");
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
    await act(async()=>root.render(createElement(CoursePortalClient,{...props(),memberEnabled:true,initialView:"plans",cards:[card("有效堂數方案",false,"SESSION"),card("過期點數方案",true,"POINT")] as unknown as CoursePortalData["cards"]})));
    expect(host.textContent).toContain("有效堂數方案");
    expect(host.textContent).not.toContain("過期點數方案");
    await click("查看已到期");
    expect(host.textContent).toContain("過期點數方案");
    await click("收起已到期");
    expect(host.textContent).not.toContain("過期點數方案");
  });
  it("shows pending orders first and exposes completed orders only in history", async () => {
    const order=(id:string,status:string)=>({id,name:id,status,price:500,createdAt:"2026-09-20T00:00:00Z",refunds:[]});
    await act(async()=>root.render(createElement(CoursePortalClient,{...props(),memberEnabled:true,initialView:"plans",orders:[order("等待確認購買","PENDING"),order("先前核帳購買","CONFIRMED")] as unknown as CoursePortalData["orders"]})));
    await click("購買方案"); await click("查看購買進度");
    expect(host.textContent).toContain("等待確認購買");
    expect(host.textContent).not.toContain("先前核帳購買");
    await click("歷史紀錄");
    expect(host.textContent).toContain("先前核帳購買");
    expect(host.textContent).not.toContain("等待確認購買");
    await click("我的方案");
    expect(host.textContent).toContain("可用額度＝剩餘－預約保留");
  });
});
