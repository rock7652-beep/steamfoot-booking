// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CourseWorkspace } from "@/app/(dashboard)/dashboard/courses/workspace";
const m = vi.hoisted(() => ({ refresh: vi.fn(), fetch: vi.fn(),query:"view=catalog" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }), usePathname: () => "/s/music-test/admin/dashboard/courses", useSearchParams: () => new URLSearchParams(m.query) }));
vi.mock("@/server/actions/course-slot-matches", () => ({ getMusicSlotMatches: vi.fn() }));
vi.mock("@/server/actions/course", () => ({}));
vi.mock("@/components/admin/course-display-order", () => ({ useCourseDisplayOrder: () => ({ ranks: new Map(), compare: () => 0, rowProps: () => ({}), handle: () => null }) }));
vi.mock("@/components/admin/course-status-button", () => ({ useCourseStatusRows: (rows: unknown[]) => [rows, vi.fn(), [], vi.fn()], CourseStatusButton: () => null }));
vi.mock("@/components/admin/course-batch-selection", () => ({ CourseBatchBar: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/roster", () => ({ CourseRoster: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/rental-panel", () => ({ RentalPanel: () => null, RentalHistory: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/music-schedule-wizard", () => ({ MusicScheduleWizard: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/daily-attendance-list", () => ({ DailyAttendanceList: () => null }));
// Server actions are transport boundaries; keep these UI regressions isolated from auth/database loading.
vi.mock("@/server/actions/sports-staging", () => ({ saveSportsFee: vi.fn(), sportsStagingCommand: vi.fn() }));
vi.mock("@/server/actions/sports-series", () => ({ syncSportsPermanentCalendar: vi.fn(), previewSportsCourseCancellation: vi.fn(), stopSportsSeries: vi.fn() }));
vi.mock("@/server/actions/sports-attendance-evidence", () => ({ loadSportsAttendanceEvidence: vi.fn() }));
vi.mock("@/server/actions/course-rental", () => ({ createRentalCustomer: vi.fn() }));
vi.mock("@/server/actions/course-members", () => ({ updateCourseRosterBatch: vi.fn(), cancelCourseSession: vi.fn() }));

vi.mock("@/server/actions/course-browse",()=>({loadCourseCustomerSearchIndex:vi.fn(),searchCourseCustomers:vi.fn()}));
vi.mock("@/server/actions/course-charge",()=>({loadCourseChargeOptions:vi.fn()}));
vi.mock("@/server/actions/course-schedule-enrollment",()=>({loadCourseScheduleEnrollmentOptions:vi.fn(),createScheduleCustomer:vi.fn()}));
vi.mock("@/server/actions/course-batch",()=>({courseStatusImpact:vi.fn()}));

Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
const base={storeId:'store',selectedDate:'2026-10-22',today:'2026-10-22',nowIso:'2026-10-22T01:00:00Z',calendarDays:{},rooms:[],sessions:[],coaches:[],cancelledBookings:[],staffAvailability:[],staffAvailabilityExceptions:[],canEdit:true,canCreate:true,businessProfile:'FITNESS' as const,view:'catalog' as const};
const row={id:'service',name:'做臉',category:'保養',isActive:true,visibility:'PUBLIC',durationMinutes:60,bufferMinutes:15,catalogRevision:4,capacity:1,pointCost:1,defaultRoomId:null};
const save=vi.fn();
async function render(overrides:Partial<React.ComponentProps<typeof CourseWorkspace>>={}){
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);vi.spyOn(window,'scrollTo').mockImplementation(()=>{});save.mockReset();m.fetch.mockReset();
 await act(async()=>root.render(createElement(CourseWorkspace,{...base,templates:[row],catalogSource:{save,status:{impact:async()=>({success:true as const,count:0}),apply:async()=>({success:true as const,succeeded:[],failed:[]})}},...overrides})));
 return {host,root,close:async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();}};
}
function button(name:string){const b=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===name);expect(b,name).toBeTruthy();return b!;}
it('edits service duration in the original course dialog and sends only through the module driver',async()=>{
 const {host,close}=await render();try{
 await act(async()=>button('做臉').click());const form=document.querySelector<HTMLFormElement>('#course-edit-form')!;expect(form).toBeTruthy();expect(form.querySelector('[name="price"]')).toBeNull();expect(form.querySelector('[name="capacity"]')).toBeNull();expect(form.querySelector('[name="cost"]')).toBeNull();expect(form.querySelector('[name="classType"]')).toBeNull();
 (form.querySelector('[name="duration"]') as HTMLInputElement).value='90';(form.querySelector('[name="buffer"]') as HTMLInputElement).value='20';save.mockResolvedValue({success:true,data:{...row,durationMinutes:90,bufferMinutes:20,catalogRevision:5}});
 await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(save).toHaveBeenCalledWith('template',expect.objectContaining({id:'service',catalogRevision:4,durationMinutes:90,bufferMinutes:20}));expect(document.querySelector('#course-edit-form')).toBeNull();expect(host.querySelector('tbody')?.textContent).toContain('90 分');expect(m.fetch).not.toHaveBeenCalled();
 }finally{await close();}
});
it('retains service input after a rejected save and prevents readonly creation',async()=>{
 const {close}=await render();try{await act(async()=>button('做臉').click());save.mockResolvedValue({success:false,error:'服務已更新'});await act(async()=>document.querySelector('form#course-edit-form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(document.body.textContent).toContain('服務已更新');expect(document.querySelector('form#course-edit-form')).toBeTruthy();}finally{await close();}
 const second=await render({canCreate:false,canEdit:false});try{expect(document.body.textContent).not.toContain('新增服務項目');await act(async()=>button('做臉').click());expect(document.querySelector('form#course-edit-form')).toBeNull();expect(save).not.toHaveBeenCalled();}finally{await second.close();}
});
