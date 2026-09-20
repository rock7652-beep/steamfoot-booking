// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoursePortalData } from "@/app/(customer)/book/course-portal";
const m = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn(), attendance: vi.fn(), checkIn: vi.fn(), note: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh, replace: m.replace }), usePathname: () => "/s/a/book", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/share-referral", () => ({ ShareReferral: () => null }));
vi.mock("@/server/actions/course-referral-share", () => ({ trackCourseShare: vi.fn() }));
vi.mock("@/components/steam-butler-logo", () => ({ SteamButlerLogo: () => null }));
vi.mock("@/components/logout-button", () => ({ LogoutButton: () => null }));
vi.mock("@/server/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/components/course-member-contact-form", () => ({ CourseMemberContactForm: () => null }));
vi.mock("@/components/course-health-workspace", () => ({ CourseHealthWorkspace: () => null }));
vi.mock("@/server/actions/course-members", () => ({ createMemberCourseBooking: vi.fn(), markCourseCoachAttendance: m.checkIn, updateCourseBookingStatus: vi.fn() }));
vi.mock("@/server/actions/course-portal", () => ({ saveCourseAttendance: m.attendance, saveCourseCoachNote: m.note, purchaseCoursePlan: vi.fn() }));
import { CoursePortalClient } from "@/app/(customer)/book/course-portal-client";
let host: HTMLDivElement, root: Root;
const learner = (id: string, checkedIn: boolean, status = "RESERVED") => ({ id, customerId: id, customerName: id, checkedIn, status, notes: "", updatedAt: "2026-09-20T02:00:00.000Z", cost: 2, unit: "POINT", planName: "十點", expiresAt: null });
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
  m.attendance.mockImplementation(async (input) => ({ success: true, attendanceUpdates: input.bookings.map((b: {id:string}) => ({id:b.id,status:input.target === "CHECKED_IN" ? "RESERVED" : input.target,checkedIn:input.target === "ATTENDED" || input.target === "CHECKED_IN",updatedAt:"2026-09-20T03:00:00.000Z"})) }));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
describe("coach daily work interactions", () => {
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
    await click("伸展瑜珈"); await click("編輯本堂備註");
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
    expect([...host.querySelectorAll("button")].some(b=>b.textContent==="更正")).toBe(false);
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

  it.each(["報到", "未到"])("shows saving on the first %s tap, then reconciles without a second tap", async label => {
    let resolve!: (value: unknown) => void;
    const action = label === "報到" ? m.checkIn : m.attendance;
    action.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const p = props();
    await act(async () => root.render(createElement(CoursePortalClient, p)));
    await click("伸展瑜珈");
    const button = [...host.querySelectorAll("button")].find(b => b.textContent === label)!;
    const person = button.closest(".cp-person")!;
    const id = label === "報到" ? "尚未到學員" : "已到學員";
    await act(async () => { button.click(); button.click(); });
    expect(action).toHaveBeenCalledTimes(1);
    expect(person.textContent).toContain("儲存中…");
    expect(button.disabled).toBe(true);
    expect(host.textContent).not.toContain("已標記未到");
    const update = { id, status: label === "報到" ? "RESERVED" : "NO_SHOW", checkedIn: label === "報到", updatedAt:"2026-09-20T03:00:00.000Z" };
    await act(async () => resolve({success:true,attendanceUpdates:[update]}));
    expect(person.querySelector(".cp-badge")?.textContent).toBe(label === "報到" ? "已報到・待出席" : "未到");
    // A delayed refresh carrying the old row must not undo the confirmed write.
    await act(async () => root.render(createElement(CoursePortalClient, {...p, serverNow:p.serverNow+1000})));
    expect(person.querySelector(".cp-badge")?.textContent).toBe(label === "報到" ? "已報到・待出席" : "未到");
    // A later authoritative correction is still allowed to replace the local result.
    const newer = {...p, work:p.work.map(s=>({...s,bookings:s.bookings.map(b=>b.id===id?{...b,status:"RESERVED",checkedIn:false,updatedAt:"2026-09-20T03:01:00.000Z"}:b)}))};
    await act(async () => root.render(createElement(CoursePortalClient,newer)));
    expect(person.querySelector(".cp-badge")?.textContent).toBe("待報到");
  });

});

describe("member plan and purchase navigation", () => {
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
