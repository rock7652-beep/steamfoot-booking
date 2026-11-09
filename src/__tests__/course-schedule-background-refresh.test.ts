import {preparedRoster} from "./fixtures/prepared-roster";
vi.mock("@/server/actions/course-browse", () => ({ loadCourseCustomerSearchIndex: vi.fn().mockResolvedValue({success:true,data:[],complete:true}), searchCourseCustomers: vi.fn().mockResolvedValue({success:true,data:[]}) }));
vi.mock('@/server/actions/course-charge',()=>({loadCourseChargeOptions:vi.fn().mockResolvedValue({success:true,rows:[],enabled:true,defaultTrialPrice:499})}));
vi.mock("@/server/actions/course-rental", () => ({ createRentalCustomer: vi.fn() }));
vi.mock("@/server/actions/sports-attendance-evidence", () => ({ loadSportsAttendanceEvidence: vi.fn() }));
vi.mock("@/server/actions/course-members", () => ({ updateCourseRosterBatch: vi.fn(), cancelCourseSession: vi.fn() }));
vi.mock("@/server/actions/sports-staging", () => ({ recordSportsAttendance: vi.fn(), cancelSportsLesson: vi.fn(), moveSportsLesson: vi.fn() }));
vi.mock("@/server/actions/sports-series", () => ({ syncSportsPermanentCalendar: vi.fn() }));
// @vitest-environment jsdom
import layoutStyles from "@/app/(dashboard)/dashboard/courses/schedule-layout.module.css";
import {mkdirSync,writeFileSync} from "node:fs";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CourseWorkspace, type CourseCalendarSource } from "@/app/(dashboard)/dashboard/courses/workspace";

const m = vi.hoisted(() => ({ query: "", nativeRead: vi.fn(), nativeSync:vi.fn(), detail:vi.fn(), roster:vi.fn(), router: { refresh: vi.fn(),replace:vi.fn() } }));
vi.mock("@/lib/course-session-detail-client",()=>({readCourseSessionDetailClient:m.detail}));
vi.mock("@/lib/sports-calendar-client",()=>({readSportsCalendar:m.nativeRead,readMusicCalendar:m.nativeRead,syncSportsCalendar:m.nativeSync}));
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
vi.mock("@/app/(dashboard)/dashboard/courses/roster", () => ({ CourseRoster: (props:unknown) => {m.roster(props);return null;} }));
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
  // Neighbor-month preloads are independent of the current month's 60s refresh cadence.
  const currentReads=()=>activeRead.mock.calls.filter(([date])=>date.startsWith('2026-10')).length;
  await act(async()=>root.render(createElement(CourseWorkspace,{...props,key:String(beauty),sportsNative:true,businessProfile:"FITNESS",calendarSource:beauty?source:undefined})));
  await tick(59_999);expect(currentReads()).toBe(0);
  await tick(1);expect(currentReads()).toBe(1);
  await tick(59_999);expect(currentReads()).toBe(1);
  await tick(1);expect(currentReads()).toBe(2);
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


it.each([false,true])('opens with prepared data and keeps its refresh completion observable: native=%s',async native=>{
 const original=window.location.href;m.query='date=2026-10-17&scheduleView=day';if(!native)vi.stubEnv('NEXT_PUBLIC_BUILD_ENV','staging');window.history.replaceState(null,'',`/s/${native?'sports-test':'lubymusic'}/admin/dashboard/courses?`+m.query);
 const data=preparedRoster(),rosterSnapshots={storeId:'store-a',details:{session:data}};
 try{
  await act(async()=>root.render(createElement(CourseWorkspace,{...props,rosterSnapshots,canCreate:false,canEdit:false,sportsNative:native,businessProfile:native?'FITNESS':'MUSIC',rooms:[{id:'room',name:'Room',category:'',isActive:true,capacity:2}],coaches:[{id:'coach',displayName:'Coach',phone:'',status:'ACTIVE',courseCoachEnabled:true,courseQualificationsConfirmed:true,courseQualifiedTemplateIds:[]}],sessions:[{id:'session',templateId:'template',nameSnapshot:'Teaching A',startsAt:'2026-10-17T02:00:00Z',endsAt:'2026-10-17T03:00:00Z',coachId:'coach',roomId:'room',capacity:2,pointCost:1,bookings:[]}]})));
  expect(host.querySelector('[data-calendar-rosters-ready="true"]')).not.toBeNull();
  await act(async()=>host.querySelector<HTMLButtonElement>('[data-calendar-session="session"]')!.click());
  expect(m.detail).not.toHaveBeenCalled();expect(m.roster.mock.lastCall?.[0].initialSnapshot).toEqual({sessionId:'session',data});
  if(!native){
   const lease=m.roster.mock.lastCall?.[0].beginTeacherNoteSnapshot('session');expect(lease).not.toBeNull();
   const updated={...data,session:{...data.session,teacherNote:'只更新這堂的備註'}};
   await act(async()=>expect(lease.accept({sessionId:'session',data:updated})).toBe(true));lease.dispose();
   expect(m.roster.mock.lastCall?.[0].initialSnapshot.data).toBe(updated);expect(rosterSnapshots.details.session).toBe(data);
   await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='關閉')!.click());
   await act(async()=>host.querySelector<HTMLButtonElement>('[data-calendar-session="session"]')!.click());
   expect(m.roster.mock.lastCall?.[0].initialSnapshot.data).toBe(updated);expect(m.router.refresh).not.toHaveBeenCalled();expect(m.detail).not.toHaveBeenCalled();
   await act(async()=>window.dispatchEvent(new StorageEvent('storage',{key:'music-preview:lubymusic:finance-v1',newValue:'general:teacher-note-parent-external'})));expect(host.querySelector('[data-calendar-rosters-ready="false"]')).not.toBeNull();
  }
  const owner=m.roster.mock.lastCall?.[0].onCommitted;expect(owner).toBeTypeOf('function');
  await act(async()=>m.roster.mock.lastCall?.[0].onSnapshotInvalidated());expect(host.querySelector('[data-calendar-rosters-ready="false"]')).not.toBeNull();
  // Snapshot invalidation must not drop the parent owner while its read is pending.
  expect(m.roster.mock.lastCall?.[0].onCommitted).toBe(owner);
  if(native){
   let finish!:(value:{success:false;error:string})=>void;const read=new Promise(resolve=>{finish=resolve;});m.nativeRead.mockReturnValue(read);
   let completion!:Promise<boolean|null>;await act(async()=>{completion=owner();});expect(completion).toBeInstanceOf(Promise);expect(m.nativeRead).toHaveBeenCalledOnce();
   let outcome:unknown;await act(async()=>{finish({success:false,error:'controlled sync failure'});outcome=await completion;});expect(outcome).toBe(false);expect(host.textContent).toContain('controlled sync failure');
  }else{await act(async()=>m.roster.mock.lastCall?.[0].onCommitted());expect(m.router.refresh).toHaveBeenCalledTimes(1);}
 }finally{window.history.replaceState(null,'',original);vi.unstubAllEnvs();}
});

it('music date navigation uses month JSON reads and ignores responses after returning to the loaded month',async()=>{
 const original=window.location.href,replace=window.history.replaceState.bind(window.history);
 vi.spyOn(window.history,'replaceState').mockImplementation((data,title,url)=>{replace(data,title,url);m.query=new URL(window.location.href).searchParams.toString();});
 let finishNovember!:(value:unknown)=>void,finishDecember!:(value:unknown)=>void;
 m.nativeRead.mockReturnValueOnce(new Promise(resolve=>{finishNovember=resolve;})).mockReturnValueOnce(new Promise(resolve=>{finishDecember=resolve;}));
 try{
  await render('MUSIC');const date=()=>host.querySelector<HTMLInputElement>('[aria-label="課表日期"]')!;
  const choose=async(value:string)=>{await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(date(),value);date().dispatchEvent(new Event('change',{bubbles:true}));date().dispatchEvent(new Event('input',{bubbles:true}));});await render('MUSIC');};
  await choose('2026-11-17');expect(date().disabled).toBe(false);expect(date().value).toBe('2026-11-17');expect(host.querySelector('[aria-label="課表載入"]')).not.toBeNull();
  await act(async()=>window.dispatchEvent(new Event('focus')));expect(m.router.refresh).not.toHaveBeenCalled();
  await choose('2026-12-17');expect(date().disabled).toBe(false);expect(m.nativeRead.mock.calls.map(call=>call[0])).toEqual(['2026-11-01','2026-12-01']);
  await choose('2026-10-17');expect(host.querySelector('[aria-label="課表載入"]')).toBeNull();
  await act(async()=>{for(const [resolve,month]of [[finishDecember,'2026-12'],[finishNovember,'2026-11']] as const)resolve({success:true,data:{month,sessions:[],calendarDays:{},cancelledBookings:[],staffAvailabilityExceptions:[]}});});
  expect(date().value).toBe('2026-10-17');expect(host.querySelector('[aria-label="課表載入"]')).toBeNull();expect(m.router.replace).not.toHaveBeenCalled();expect(m.router.refresh).not.toHaveBeenCalled();
 }finally{replace(null,'',original);}
});

it.each([['month','下個月'],['week','下一週'],['day','後一天']])('music %s crossing a month reads the complete new month without page navigation',async(mode,label)=>{
 const original=window.location.href,replace=window.history.replaceState.bind(window.history);
 m.query=`date=2026-10-31&scheduleView=${mode}`;
 replace(null,'','/s/music-test/admin/dashboard/courses?'+m.query);
 vi.spyOn(window.history,'replaceState').mockImplementation((data,title,url)=>{replace(data,title,url);m.query=new URL(window.location.href).searchParams.toString();});
 m.nativeRead.mockResolvedValue({success:true,data:{month:'2026-11',sessions:[],calendarDays:{},cancelledBookings:[],staffAvailabilityExceptions:[],rosterSnapshots:{storeId:'store-a',details:{}}}});
 try{
  await render('MUSIC');await act(async()=>host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click());await render('MUSIC');
  expect(m.nativeRead).toHaveBeenCalledOnce();expect(m.nativeRead.mock.calls[0][0]).toMatch(/^2026-11-/);expect(m.router.replace).not.toHaveBeenCalled();expect(m.router.refresh).not.toHaveBeenCalled();expect(host.querySelector('[aria-label="課表載入"]')).toBeNull();
  const directory=process.env.CALENDAR_NAVIGATION_PREVIEW_DIR;
  if(directory){mkdirSync(directory,{recursive:true});writeFileSync(`${directory}/layout-classnames.json`,JSON.stringify(layoutStyles));writeFileSync(`${directory}/music-${mode}.html`,`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="styles.css"><body>${host.innerHTML}</body></html>`);}
 }finally{replace(null,'',original);}
});

it('does not accept another store month after the active store changes during a read',async()=>{
 const original=window.location.href,replace=window.history.replaceState.bind(window.history);
 vi.spyOn(window.history,'replaceState').mockImplementation((data,title,url)=>{replace(data,title,url);m.query=new URL(window.location.href).searchParams.toString();});
 m.nativeRead.mockResolvedValue({success:true,data:{storeId:'other-store',month:'2026-11',sessions:[],calendarDays:{},cancelledBookings:[],staffAvailabilityExceptions:[]}});
 try{
  await render('MUSIC');const input=host.querySelector<HTMLInputElement>('[aria-label="課表日期"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'2026-11-01');input.dispatchEvent(new Event('change',{bubbles:true}));input.dispatchEvent(new Event('input',{bubbles:true}));});await render('MUSIC');
  expect(host.querySelector('[aria-label="課表載入"]')).not.toBeNull();expect(host.querySelector('[role="alert"]')?.textContent).toContain('課表讀取失敗');
 }finally{replace(null,'',original);}
});

it('blocks a late parent after a cleared note and requests one fresh calendar without losing its owner',async()=>{
 const original=window.location.href;m.query='date=2026-10-17&scheduleView=day';vi.stubEnv('NEXT_PUBLIC_BUILD_ENV','staging');window.history.replaceState(null,'','/s/lubymusic/admin/dashboard/courses?'+m.query);
 const data=preparedRoster(),initial={storeId:'store-a',details:{session:data}};
 const input={...props,canCreate:false,canEdit:false,sportsNative:false,businessProfile:'MUSIC' as const,rooms:[{id:'room',name:'Room',category:'',isActive:true,capacity:2}],coaches:[{id:'coach',displayName:'Coach',phone:'',status:'ACTIVE',courseCoachEnabled:true,courseQualificationsConfirmed:true,courseQualifiedTemplateIds:[]}],sessions:[{id:'session',templateId:'template',nameSnapshot:'Teaching A',startsAt:'2026-10-17T02:00:00Z',endsAt:'2026-10-17T03:00:00Z',coachId:'coach',roomId:'room',capacity:2,pointCost:1,bookings:[]}]};
 try{
  await act(async()=>root.render(createElement(CourseWorkspace,{...input,rosterSnapshots:initial})));
  await act(async()=>host.querySelector<HTMLButtonElement>('[data-calendar-session="session"]')!.click());
  const owner=m.roster.mock.lastCall?.[0].onCommitted,lease=m.roster.mock.lastCall?.[0].beginTeacherNoteSnapshot('session');
  const empty={...data,session:{...data.session,teacherNote:''}};
  await act(async()=>expect(lease.accept({sessionId:'session',data:empty})).toBe(true));lease.dispose();
  expect(m.router.refresh).not.toHaveBeenCalled();
  await act(async()=>root.render(createElement(CourseWorkspace,{...input,rosterSnapshots:JSON.parse(JSON.stringify(initial))})));
  expect(host.querySelector('[data-calendar-rosters-ready="false"]')).not.toBeNull();
  expect(m.roster.mock.lastCall?.[0].initialSnapshot).toBeUndefined();expect(m.roster.mock.lastCall?.[0].onCommitted).toBe(owner);expect(m.router.refresh).toHaveBeenCalledOnce();
  await act(async()=>root.render(createElement(CourseWorkspace,{...input,rosterSnapshots:{...initial,details:{session:empty}}})));
  expect(host.querySelector('[data-calendar-rosters-ready="true"]')).not.toBeNull();expect(m.roster.mock.lastCall?.[0].initialSnapshot.data.session.teacherNote).toBe('');expect(m.router.refresh).toHaveBeenCalledOnce();
 }finally{window.history.replaceState(null,'',original);vi.unstubAllEnvs();}
});

it.each([['month','下個月'],['week','下一週'],['day','後一天']])('sports %s crossing a month consumes one sync-and-read response',async(mode,label)=>{
 const original=window.location.href,replace=window.history.replaceState.bind(window.history);
 m.query=`date=2026-10-31&scheduleView=${mode}`;replace(null,'','/s/sports-test/admin/dashboard/courses?'+m.query);
 vi.spyOn(window.history,'replaceState').mockImplementation((data,title,url)=>{replace(data,title,url);m.query=new URL(window.location.href).searchParams.toString();});
 try{
 let finish!:(value:unknown)=>void;
 m.nativeSync.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
 await act(async()=>root.render(createElement(CourseWorkspace,{...props,selectedDate:'2026-10-31',sportsNative:true,businessProfile:'FITNESS'})));
 await act(async()=>host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click());
 expect(m.nativeSync).toHaveBeenCalledOnce();expect(m.nativeSync.mock.calls[0][0]).toMatch(/^2026-11-/);
 expect(m.nativeRead).not.toHaveBeenCalled();expect(host.querySelector('[aria-label="課表載入"]')).not.toBeNull();
 await act(async()=>finish({success:true,warning:'部分固定課需核對',data:{storeId:'store-a',month:'2026-11',sessions:[],calendarDays:{},cancelledBookings:[],staffAvailabilityExceptions:[],rosterSnapshots:{storeId:'store-a',details:{}}}}));
 expect(host.querySelector('[aria-label="課表載入"]')).toBeNull();expect(host.querySelector('[data-calendar-rosters-ready="true"]')).not.toBeNull();
 expect(host.textContent).toContain('部分固定課需核對');expect(m.nativeRead).not.toHaveBeenCalled();expect(m.router.refresh).not.toHaveBeenCalled();expect(m.router.replace).not.toHaveBeenCalled();
 }finally{replace(null,'',original);}
});

it('ignores a late combined sports response after a newer month has completed',async()=>{
 const original=window.location.href,replace=window.history.replaceState.bind(window.history);
 m.query='date=2026-10-31&scheduleView=month';replace(null,'','/s/sports-test/admin/dashboard/courses?'+m.query);
 vi.spyOn(window.history,'replaceState').mockImplementation((data,title,url)=>{replace(data,title,url);m.query=new URL(window.location.href).searchParams.toString();});
 let november!:(value:unknown)=>void,december!:(value:unknown)=>void;
 m.nativeSync.mockReturnValueOnce(new Promise(resolve=>{november=resolve;})).mockReturnValueOnce(new Promise(resolve=>{december=resolve;}));
 try{
  await act(async()=>root.render(createElement(CourseWorkspace,{...props,selectedDate:'2026-10-31',sportsNative:true,businessProfile:'FITNESS'})));
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="下個月"]')!.click());
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="下個月"]')!.click());
  expect(m.nativeSync.mock.calls.map(call=>call[0])).toEqual(['2026-11-01','2026-12-01']);
  await act(async()=>december({success:true,data:{storeId:'store-a',month:'2026-12',sessions:[],calendarDays:{},cancelledBookings:[],staffAvailabilityExceptions:[],rosterSnapshots:{storeId:'store-a',details:{}}}}));
  await act(async()=>november({success:false,error:'較舊的同步失敗'}));
  expect(host.querySelector<HTMLInputElement>('[aria-label="課表日期"]')!.value).toBe('2026-12-01');
  expect(host.querySelector('[data-calendar-rosters-ready="true"]')).not.toBeNull();expect(host.textContent).not.toContain('較舊的同步失敗');expect(m.nativeRead).not.toHaveBeenCalled();
 }finally{replace(null,'',original);}
});
it.each([{success:false,error:'固定課同步失敗'},{success:true,data:{storeId:'other-store',month:'2026-11',sessions:[]}}])('keeps sports loading blocked when the combined response is rejected: %j',async result=>{
 const original=window.location.href,replace=window.history.replaceState.bind(window.history);
 m.query='date=2026-10-31&scheduleView=month';replace(null,'','/s/sports-test/admin/dashboard/courses?'+m.query);
 vi.spyOn(window.history,'replaceState').mockImplementation((data,title,url)=>{replace(data,title,url);m.query=new URL(window.location.href).searchParams.toString();});
 m.nativeSync.mockReset().mockResolvedValue(result);
 try{
  await act(async()=>root.render(createElement(CourseWorkspace,{...props,selectedDate:'2026-10-31',sportsNative:true,businessProfile:'FITNESS'})));
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="下個月"]')!.click());
  expect(host.querySelector<HTMLInputElement>('[aria-label="課表日期"]')!.value).toBe('2026-11-01');
  expect(host.querySelector('[aria-label="課表載入"] [role="alert"]')).not.toBeNull();expect(m.nativeRead).not.toHaveBeenCalled();
 }finally{replace(null,'',original);}
});

it('keeps a visited music month usable after 75 seconds and restores the initial month while revalidating',async()=>{
 const original=window.location.href,replace=window.history.replaceState.bind(window.history);
 vi.spyOn(window.history,'replaceState').mockImplementation((data,title,url)=>{replace(data,title,url);m.query=new URL(window.location.href).searchParams.toString();});
 const snapshot=(month:string)=>({success:true,data:{storeId:'store-a',month,sessions:[],calendarDays:{},cancelledBookings:[],staffAvailabilityExceptions:[]}});
 m.nativeRead.mockImplementation(async(date:string)=>snapshot(date.slice(0,7)));
 const choose=async(value:string)=>{await act(async()=>{const input=host.querySelector<HTMLInputElement>('[aria-label="課表日期"]')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('change',{bubbles:true}));input.dispatchEvent(new Event('input',{bubbles:true}));});await render('MUSIC');};
 try{
  await render('MUSIC');await choose('2026-11-02');
  expect(host.querySelector('[aria-label="課表載入"]')).toBeNull();
  vi.setSystemTime(new Date(Date.now()+120_000));
  m.nativeRead.mockImplementation(()=>new Promise(()=>{}));
  await choose('2026-10-26');
  expect(host.querySelector('[aria-label="課表載入"]')).toBeNull();
  await choose('2026-11-02');
  expect(host.querySelector('[aria-label="課表載入"]')).toBeNull();
 }finally{replace(null,'',original);}
});
