// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CourseWorkspace } from "@/app/(dashboard)/dashboard/courses/workspace";
import { courseTemplateInput } from "@/lib/course-scheduling";
import { courseTemplateRevision } from "@/lib/course-template-save";
const m = vi.hoisted(() => ({ refresh: vi.fn(), fetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }), usePathname: () => "/s/music-test/admin/dashboard/courses", useSearchParams: () => new URLSearchParams("view=catalog&action=create") }));
vi.mock("@/server/actions/course-slot-matches", () => ({ getMusicSlotMatches: vi.fn() }));
vi.mock("@/server/actions/course", () => ({}));
vi.mock("@/components/admin/course-display-order", () => ({ useCourseDisplayOrder: () => ({ ranks: new Map(), compare: () => 0, rowProps: () => ({}), handle: () => null }) }));
vi.mock("@/components/admin/course-status-button", () => ({ useCourseStatusRows: (rows: unknown[]) => [rows, vi.fn(), [], vi.fn()], CourseStatusButton: () => null }));
vi.mock("@/components/admin/course-batch-selection", () => ({ CourseBatchBar: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/roster", () => ({ CourseRoster: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/rental-panel", () => ({ RentalPanel: () => null, RentalHistory: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/music-schedule-wizard", () => ({ MusicScheduleWizard: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/daily-attendance-list", () => ({ DailyAttendanceList: () => null }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const props = { storeId: "store-a", selectedDate: "2026-10-10", today: "2026-10-10", nowIso: "2026-10-10T01:00:00Z", calendarDays: {}, rooms: [], templates: [], sessions: [], cancelledBookings: [], coaches: [], canCreate: true, canEdit: true, view: "catalog" as const, staffAvailability: [], staffAvailabilityExceptions: [] };
it("shows a confirmed course without RSC refresh; retries preserve the same payload and filters",async()=>{
 vi.spyOn(window,"scrollTo").mockImplementation(()=>{});vi.stubGlobal("fetch",m.fetch);m.fetch.mockReset();m.refresh.mockReset();
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 const render=(templates:React.ComponentProps<typeof CourseWorkspace>["templates"]=[])=>createElement(CourseWorkspace,{...props,businessProfile:"FITNESS",templates});
 try{
  await act(async()=>root.render(render()));
  const input=host.querySelector<HTMLInputElement>('#course-template-create-form input[name="name"]')!;input.value="新瑜珈";
  let done!:(value:unknown)=>void;m.fetch.mockReturnValueOnce(new Promise(resolve=>{done=resolve;}));
  await act(async()=>{const form=host.querySelector("#course-template-create-form")!;form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));});
  expect(m.fetch).toHaveBeenCalledTimes(1);expect(host.querySelector("tbody")!.textContent).not.toContain("新瑜珈");
  await act(async()=>done({json:async()=>{throw new Error("lost response");}}));
  expect(host.querySelector<HTMLFieldSetElement>("#course-template-create-form fieldset")!.disabled).toBe(true);
  const row={...courseTemplateInput.parse({name:"新瑜珈",durationMinutes:60,pointCost:1,capacity:10}),id:"T",isActive:true,visibility:"PUBLIC",musicSubjectId:null,musicSubject:null,hasSessions:false};
  m.fetch.mockResolvedValueOnce({json:async()=>({success:true,storeId:"store-a",data:{...row,revision:courseTemplateRevision(row)}})});
  await act(async()=>host.querySelector("#course-template-create-form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(m.fetch.mock.calls[0][1].body).toBe(m.fetch.mock.calls[1][1].body);expect(m.fetch.mock.calls[1][0]).toBe("/s/music-test/admin/dashboard/settings-save/course/template");
  expect(host.querySelector("#course-template-create-form")).toBeNull();expect(host.querySelector("tbody")!.textContent).toContain("新瑜珈");expect(m.refresh).not.toHaveBeenCalled();
  await act(async()=>root.render(render()));expect(host.querySelector("tbody")!.textContent).toContain("新瑜珈");
  await act(async()=>root.render(render([row])));expect(host.querySelectorAll("tbody tr")).toHaveLength(1);
  await act(async()=>root.render(render([{...row,name:"後續更新"}])));expect(host.querySelector("tbody")!.textContent).toContain("後續更新");
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();vi.restoreAllMocks();}
});
