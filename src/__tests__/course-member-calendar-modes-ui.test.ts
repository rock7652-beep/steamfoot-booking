// @vitest-environment jsdom
vi.mock("@/server/actions/sports-staging",()=>({bookSportsTrial:vi.fn()}));
vi.mock("@/server/actions/course-teacher-session",()=>({loadCourseTeacherSession:vi.fn(),changeCourseTeacherSession:vi.fn()}));
vi.mock("@/server/actions/course-store-notices",()=>({saveCourseOperationSwitch:vi.fn()}));
vi.mock("@/server/actions/course-teacher-changes",()=>({loadCourseTeacherChange:vi.fn(),loadCourseTeacherLeave:vi.fn(),changeCourseTeacherBooking:vi.fn()}));
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

let host:HTMLDivElement, root:Root;
const date="2099-01-20T09:00:00+08:00";
function props(open=true,assigned=true) { return {selfBookingEnabled:open,assignedSchedulingEnabled:assigned,selfLeaveEnabled:true,selfRescheduleEnabled:true,initialRole:"member",rolePreferenceKey:"calendar-test",initialView:"schedule",initialDate:"2099-01-20",month:"2099-01",serverNow:Date.parse("2099-01-20T08:00:00+08:00"),customerId:"child",customerName:"虛構學員",memberEnabled:true,hasWork:false,musicStore:true,healthEnabled:true,storeName:"測試店",prefix:"/s/test",cards:[],plans:[],templates:[],orders:[],work:[],hours:[],special:[],config:{},bookingWindow:{closesAt:"2099-02-01T00:00:00Z"},cancellationLeadMinutes:0,nextBooking:null,nextWork:null,sessions:[{id:"open",templateId:"t",classType:"PRIVATE",name:"開放吉他",startsAt:date,coach:"教師",room:"01",cost:1,capacity:4,occupied:0}],bookings:[{id:"own",sessionId:"assigned",bookingAudience:"ASSIGNED",name:"指定鋼琴",startsAt:date,customerId:"child",customerName:"虛構學員",reserverCustomerId:"child",status:"RESERVED",coach:"教師",room:"01",unit:"SESSION",cost:1,planName:"鋼琴一期",notes:""},{id:"unrelated",sessionId:"other",name:"其他共卡成員的課",startsAt:date,customerId:"other",reserverCustomerId:"other",status:"RESERVED",coach:"教師",room:"01",unit:"SESSION",cost:1,planName:"鋼琴一期",notes:""}]} as unknown as CoursePortalData; }
async function click(text:string) {const button=[...host.querySelectorAll("button")].find(b=>b.textContent?.startsWith(text));expect(button,text).toBeTruthy();await act(async()=>button!.click());}
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});window.scrollTo=vi.fn();HTMLElement.prototype.scrollIntoView=vi.fn();host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it.each([[true,true],[true,false],[false,true],[false,false]])("keeps existing personal classes in mode configuration %s/%s",async(open,assigned)=>{
 await act(async()=>root.render(createElement(CoursePortalClient,props(open,assigned))));
 expect([...host.querySelectorAll(".cp-nav button")].map(b=>b.textContent)).toEqual(["首頁","課表","我的"]);
 expect(host.querySelector(".cp-daily")?.textContent).toContain("指定鋼琴");expect(host.textContent).not.toContain("其他共卡成員的課");
 expect(host.querySelector(".cp-daily")?.textContent).not.toContain("開放吉他");expect(host.querySelector(".cp-days .self")).not.toBeNull();
 expect(host.querySelectorAll(".cp-calendar-modes button")).toHaveLength(open?2:0);
 if(open){await click("開放選課");expect(host.querySelector(".cp-daily")?.textContent).toContain("開放吉他");expect(host.querySelector(".cp-daily")?.textContent).not.toContain("指定鋼琴");expect(host.querySelector(".cp-days")?.textContent).toContain("1堂");await click("我的課表");}
 await click("查看明細 ⌄");expect([...host.querySelectorAll("button")].some(b=>b.textContent==="改時段")).toBe(false);
 expect([...host.querySelectorAll("button")].some(b=>b.textContent==="請假")).toBe(true);
});
it("keeps authorized proxy bookings separate from unrelated shared-card members",async()=>{
 const data=props();data.bookings[1].reserverCustomerId="child";
 await act(async()=>root.render(createElement(CoursePortalClient,data)));
 expect(host.querySelectorAll(".cp-booking-card")).toHaveLength(2);expect(host.querySelector(".cp-days .shared")).not.toBeNull();
 await click("我的");expect(host.textContent).toContain("課程與繳費");expect(host.textContent).toContain("共卡成員");expect(host.textContent).toContain("健康紀錄");
 await click("課程與繳費");expect(host.querySelector('.cp-nav button[aria-current="page"]')?.textContent).toBe("我的");
});
it("shows closures on the calendar only",async()=>{
 const data=props(false);data.special=[{date:"2099-01-20",type:"closed"}];
 await act(async()=>root.render(createElement(CoursePortalClient,data)));
 expect(host.querySelector('.cp-days button.closed')?.textContent).toContain("公休");await click("首頁");expect(host.textContent).not.toContain("店家公告");
});
