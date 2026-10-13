// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({slots:vi.fn(),create:vi.fn(),check:vi.fn(),options:vi.fn()}));
vi.mock("@/server/actions/course-schedule-check",()=>({inspectCourseSchedule:m.check}));
vi.mock("@/server/actions/course-schedule-enrollment",()=>({loadCourseScheduleEnrollmentOptions:m.options,createScheduleCustomer:vi.fn()}));
vi.mock("@/server/actions/course-slot-matches",()=>({getMusicSlotMatches:m.slots}));
vi.mock("@/server/actions/course",()=>({createCourseSchedule:m.create}));
vi.mock("@/components/dashboard-link",()=>({DashboardLink:({children,...props}:Record<string,unknown>)=>createElement("a",props,children as never)}));
import {useCourseDraftGuard,requestCourseDraftLeave} from "@/components/admin/use-course-draft-guard";
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{vi.resetAllMocks();m.check.mockResolvedValue({success:true,issues:[]});m.options.mockResolvedValue({success:true,cards:[],customers:[]});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
it("blocks sidebar navigation with an unsaved draft but permits opening a repair tab",async()=>{
 function Fixture(){useCourseDraftGuard(true);return createElement("div",null,createElement("a",{href:"/dashboard/teachers"},"離開"),createElement("a",{href:"/dashboard/courses/hours",target:"_blank"},"修正"));}
 vi.spyOn(window,"confirm").mockReturnValue(false);await act(async()=>root.render(createElement(Fixture)));
 const leave=new MouseEvent("click",{bubbles:true,cancelable:true});host.querySelector("a")!.dispatchEvent(leave);expect(leave.defaultPrevented).toBe(true);
 const repair=new MouseEvent("click",{bubbles:true,cancelable:true});host.querySelectorAll("a")[1].dispatchEvent(repair);expect(repair.defaultPrevented).toBe(false);expect(window.confirm).toHaveBeenCalledTimes(1);
});

it("guards store changes before mutations and blocks them during submission",async()=>{
 function Fixture({pending=false}){useCourseDraftGuard(true,pending);return null;}
 const confirm=vi.spyOn(window,"confirm").mockReturnValue(false);
 await act(async()=>root.render(createElement(Fixture)));
 expect(requestCourseDraftLeave()).toBe(false);
 confirm.mockReturnValue(true);expect(requestCourseDraftLeave()).toBe(true);
 await act(async()=>root.render(createElement(Fixture,{pending:true})));
 confirm.mockClear();expect(requestCourseDraftLeave()).toBe(false);expect(confirm).not.toHaveBeenCalled();
});
