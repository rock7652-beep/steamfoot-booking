// @vitest-environment jsdom
import { act, createElement as el, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ save: vi.fn(), fetch:vi.fn(), refresh: vi.fn(), push: vi.fn() }));
vi.mock("@/server/actions/course-store-notices",()=>({saveCourseOperationSwitch:vi.fn(),loadCourseStoreNotices:vi.fn(),markCourseStoreNotice:vi.fn()}));
vi.mock("@/server/actions/course-teacher-changes",()=>({loadCourseTeacherChange:vi.fn(),loadCourseTeacherLeave:vi.fn(),changeCourseTeacherBooking:vi.fn()}));
vi.mock("next/navigation", () => ({ useRouter: () => m, usePathname: () => window.location.pathname, useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/server/actions/course-settings", () => ({ saveCourseSelfBookingSettings: m.save }));
vi.mock("@/components/customer-labels", () => ({ CustomerLabelsSettings: () => null }));
vi.mock("@/components/desktop", () => ({ InfoList: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/settings-section-editor", () => ({ CourseSettingsSectionEditor: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/settings-panel", () => ({ CourseSettingsPanel: () => null }));
vi.mock("@/app/(dashboard)/dashboard/settings/hours/bookable-until-form", () => ({ BookableUntilForm: () => null }));
vi.mock("@/app/(dashboard)/dashboard/settings/duty/duty-toggle", () => ({ DutySchedulingToggle: () => null }));
vi.mock("@/app/(dashboard)/dashboard/settings/trial/trial-form", () => ({ TrialSettingsForm: () => null }));
vi.mock("@/server/actions/course-trial", () => ({ saveCourseTrialSettings: vi.fn() }));
vi.mock("@/app/(dashboard)/dashboard/courses/course-waitlist-settings", () => ({ CourseWaitlistSettings: () => null }));
import { CourseSettingsWorkspace } from "@/app/(dashboard)/dashboard/courses/settings-workspace";

let host: HTMLDivElement, root: Root;
const props: ComponentProps<typeof CourseSettingsWorkspace> = {
  storeId: "store-a", name: "測試店", planLabel: "方案", address: "", mapUrl: "", lineOfficialUrl: "",
  bankName: "", bankCode: "", bankAccountNumber: "", bookingLeadMinutes: 60, cancellationLeadMinutes: 120,
  canEdit: true, canPayment: false, canStaff: false, canPlans: false,
};

const switches=()=>[...host.querySelectorAll<HTMLInputElement>('fieldset[aria-label="排課模式"] input')];
const button=(label:string)=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===label)!;
async function render(extra:Partial<typeof props>={}) {await act(async()=>root.render(el(CourseSettingsWorkspace,{...props,...extra})));}
async function toggle(index=0) {await act(async()=>switches()[index].click());}
beforeEach(()=>{
 vi.resetAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 window.history.replaceState(null,"","/s/a/admin/dashboard/courses?view=settings&section=booking");
 host=document.createElement("div");document.body.append(host);root=createRoot(host);
 vi.stubGlobal("fetch",m.fetch.mockImplementation(async(_url:string,init:RequestInit)=>{const d=JSON.parse(String(init.body));return {json:async()=>({success:true,storeId:d.expectedStoreId,data:{open:d.mode==="OPEN"?d.enabled:true,assigned:d.mode==="ASSIGNED"?d.enabled:true,revision:1}})};}));
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
describe("scheduling mode settings workspace",()=>{
 it("presents both independent modes once in the existing booking settings",async()=>{await render();expect(switches()).toHaveLength(2);expect(switches().map(s=>s.checked)).toEqual([true,true]);expect(host.textContent).not.toContain("允許學員自行預約");});
 it("confirms only the chosen mode and preserves later state across stale refresh",async()=>{await render();await toggle();expect(switches().map(s=>s.checked)).toEqual([false,true]);await render({selfBookingEnabled:true,selfBookingRevision:0});expect(switches()[0].checked).toBe(false);expect(m.fetch).toHaveBeenCalledTimes(1);});
 it("isolates store switches and respects read-only permission",async()=>{await render({canEdit:false,selfBookingEnabled:false,assignedSchedulingEnabled:false});expect(switches().every(s=>s.disabled)).toBe(true);expect(switches().map(s=>s.checked)).toEqual([false,false]);await render({storeId:"b",selfBookingEnabled:true});expect(switches().map(s=>s.checked)).toEqual([true,true]);});
 it("blocks navigation while a save is unresolved and accepts the authoritative receipt",async()=>{
  let finish!:(r:unknown)=>void;m.fetch.mockReturnValue(new Promise(resolve=>{finish=resolve;}));await render();await toggle();
  expect(switches().every(s=>s.disabled)).toBe(true);await act(async()=>button("店家資料").click());expect(window.location.search).toContain("section=booking");
  await act(async()=>finish({json:async()=>({success:true,storeId:"store-a",data:{open:false,assigned:true,revision:1}})}));expect(switches()[0].checked).toBe(false);
 });
 it("rejects a failed save without pretending the stored flag changed",async()=>{m.fetch.mockResolvedValueOnce({json:async()=>({success:false,error:"沒有設定權限"})});await render();await toggle();expect(host.textContent).toContain("沒有設定權限");expect(switches().map(s=>s.checked)).toEqual([true,true]);expect(switches().every(s=>!s.disabled)).toBe(true);});
 it("reconciles newer external revisions for both flags",async()=>{await render();await render({selfBookingEnabled:false,assignedSchedulingEnabled:false,selfBookingRevision:2});expect(switches().map(s=>s.checked)).toEqual([false,false]);await render({selfBookingEnabled:true,selfBookingRevision:1});expect(switches().map(s=>s.checked)).toEqual([false,false]);});
});
