vi.mock("@/server/actions/course-browse", () => ({ loadCourseCustomerSearchIndex: vi.fn().mockResolvedValue({success:true,data:[],complete:true}), searchCourseCustomers: vi.fn().mockResolvedValue({success:true,data:[]}) }));
vi.mock('@/server/actions/course-charge',()=>({loadCourseChargeOptions:vi.fn().mockResolvedValue({success:true,rows:[],enabled:true,defaultTrialPrice:499})}));
vi.mock("@/server/actions/course-rental", () => ({ createRentalCustomer: vi.fn() }));
vi.mock("@/server/actions/sports-attendance-evidence", () => ({ loadSportsAttendanceEvidence: vi.fn() }));
vi.mock("@/server/actions/course-members", () => ({ updateCourseRosterBatch: vi.fn(), cancelCourseSession: vi.fn() }));
vi.mock("@/server/actions/sports-staging", () => ({ recordSportsAttendance: vi.fn(), cancelSportsLesson: vi.fn(), moveSportsLesson: vi.fn() }));
vi.mock("@/server/actions/sports-series", () => ({ syncSportsPermanentCalendar: vi.fn() }));
// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CourseWorkspace, type CourseCalendarSource } from "@/app/(dashboard)/dashboard/courses/workspace";

const m = vi.hoisted(() => ({ query: "", nativeRead: vi.fn(), detail:vi.fn(), router: { refresh: vi.fn() } }));
vi.mock("@/lib/course-session-detail-client",()=>({readCourseSessionDetailClient:m.detail}));
vi.mock("@/lib/sports-calendar-client",()=>({readSportsCalendar:m.nativeRead}));
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
const elementScrollDescriptor=Object.getOwnPropertyDescriptor(HTMLElement.prototype,"scrollTo");
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date(props.nowIso));
  m.query = "";m.detail.mockResolvedValue({success:false,error:"fixture"});
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver",class {observe(){}unobserve(){}disconnect(){}});
  vi.stubGlobal("matchMedia",vi.fn().mockReturnValue({matches:false,media:"",onchange:null,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn(),dispatchEvent:vi.fn()}));
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  Object.defineProperty(HTMLElement.prototype,"scrollTo",{configurable:true,value:vi.fn()});
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks();vi.unstubAllGlobals();
  if(elementScrollDescriptor)Object.defineProperty(HTMLElement.prototype,"scrollTo",elementScrollDescriptor);else Reflect.deleteProperty(HTMLElement.prototype,"scrollTo");
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

it.each(["month","week","day"] as const)("native sports and beauty %s calendars wait 60 seconds between background reads",async mode=>{
 m.query="scheduleView="+mode;
 const snapshot={month:"2026-10",sessions:[],calendarDays:{},cancelledBookings:[],staffAvailabilityExceptions:[]};
 m.nativeRead.mockResolvedValue({success:true,data:snapshot});
 for(const beauty of [false,true]){
  const read=vi.fn().mockResolvedValue({success:true,data:snapshot});
  const source:CourseCalendarSource={read,readBlocked:false,schedule:{catalogHref:"#",command:async()=>({success:false,error:"synthetic"}),createCustomer:async()=>({success:false,error:"synthetic"})},onOpen:()=>{},onRoster:()=>{},assignmentStaff:[]};
  const activeRead=beauty?read:m.nativeRead;
  await act(async()=>root.render(createElement(CourseWorkspace,{...props,key:String(beauty),sportsNative:true,businessProfile:"FITNESS",calendarSource:beauty?source:undefined})));
  await tick(59_999);expect(activeRead).not.toHaveBeenCalled();
  await tick(1);expect(activeRead).toHaveBeenCalledTimes(1);
  await tick(59_999);expect(activeRead).toHaveBeenCalledTimes(1);
  await tick(1);expect(activeRead).toHaveBeenCalledTimes(2);
 }
});
it.each(["month","week","day"] as const)("music %s uses the same 60-second calendar cadence",async mode=>{
 m.query="scheduleView="+mode;await render("MUSIC");
 await tick(59_999);expect(m.router.refresh).not.toHaveBeenCalled();
 await tick(1);expect(m.router.refresh).toHaveBeenCalledTimes(1);
 await tick(60_000);expect(m.router.refresh).toHaveBeenCalledTimes(2);
});

it('keeps the just-selected day view when opening a class before search params have caught up',async()=>{
 const original=window.location.href;const path='/s/sports-test/admin/dashboard/courses';m.query='date=2026-10-17&scheduleView=month';window.history.replaceState(null,'',path+'?'+m.query);
 try{
  await act(async()=>root.render(createElement(CourseWorkspace,{...props,canCreate:false,canEdit:false,businessProfile:'MUSIC',rooms:[{id:'room',name:'Room',category:'',isActive:true,capacity:2}],coaches:[{id:'coach',displayName:'Coach',phone:'',status:'ACTIVE',courseCoachEnabled:true,courseQualificationsConfirmed:true,courseQualifiedTemplateIds:[]}],sessions:[{id:'session',templateId:'template',nameSnapshot:'Teaching A',startsAt:'2026-10-17T02:00:00Z',endsAt:'2026-10-17T03:00:00Z',coachId:'coach',roomId:'room',capacity:2,pointCost:1,bookings:[]}]})));
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='日表')!.click());expect(new URLSearchParams(window.location.search).get('scheduleView')).toBe('day');
  const card=host.querySelector<HTMLButtonElement>('[data-calendar-session="session"]');expect(card).not.toBeNull();await act(async()=>card!.click());
  expect(new URLSearchParams(window.location.search).get('scheduleView')).toBe('day');expect(host.querySelector('[role="dialog"][aria-labelledby="course-operation-title"]')).not.toBeNull();expect(m.router.refresh).not.toHaveBeenCalled();
 }finally{window.history.replaceState(null,'',original);}
});
it('does not restore router history again when selecting an already active calendar view',async()=>{
 const original=window.location.href;m.query='date=2026-10-17&scheduleView=day';window.history.replaceState(null,'','/s/sports-test/admin/dashboard/courses?'+m.query);
 try{await render('MUSIC');const replace=vi.spyOn(window.history,'replaceState');await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='日表')!.click());expect(replace).not.toHaveBeenCalled();}finally{window.history.replaceState(null,'',original);}
});
it('preserves the latest browser view and other query fields during an immediate date change',async()=>{
 const original=window.location.href;m.query='date=2026-10-17&scheduleView=month';window.history.replaceState(null,'','/s/sports-test/admin/dashboard/courses?date=2026-10-17&scheduleView=day&keep=review');
 try{await render('MUSIC');await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='日表')!.click());await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()==='›')!.click());const query=new URLSearchParams(window.location.search);expect(query.get('date')).toBe('2026-10-18');expect(query.get('scheduleView')).toBe('day');expect(query.get('keep')).toBe('review');}finally{window.history.replaceState(null,'',original);}
});
