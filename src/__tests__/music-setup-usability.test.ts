// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({slots:vi.fn(),create:vi.fn()}));
vi.mock("@/server/actions/course-slot-matches",()=>({getMusicSlotMatches:m.slots}));
vi.mock("@/server/actions/course",()=>({createCourseSchedule:m.create}));
vi.mock("@/components/dashboard-link",()=>({DashboardLink:({children,...props}:Record<string,unknown>)=>createElement("a",props,children as never)}));
import {MusicScheduleWizard} from "@/app/(dashboard)/dashboard/courses/music-schedule-wizard";
import {useCourseDraftGuard,requestCourseDraftLeave} from "@/components/admin/use-course-draft-guard";
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{vi.resetAllMocks();host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
const props={templates:[{id:"guitar",name:"吉他個別課",durationMinutes:60,capacity:1,defaultRoomId:null,musicScheduleMode:"FIXED"}],rooms:[{id:"room",name:"吉他教室"}],coaches:[{id:"teacher",displayName:"驗收教師"}],initialDate:"2026-10-10",requestKey:"test",onCreated:vi.fn()};
const click=async(text:string)=>{const button=[...host.querySelectorAll("button")].find(b=>b.textContent?.startsWith(text))!;await act(async()=>button.click());};
it("automatically selects a sole qualified pair and creates only after explicit submission",async()=>{
 m.slots.mockResolvedValue({success:true,data:[{time:"10:00",roomId:"room",coachIds:["teacher"]}]});m.create.mockResolvedValue({success:true,data:{sessionId:"new"}});
 await act(async()=>root.render(createElement(MusicScheduleWizard,props)));
 await click("10:00");expect(host.textContent).toContain("建立課程，接著選學員");expect(m.create).not.toHaveBeenCalled();
 await click("建立課程");expect(m.create).toHaveBeenCalledWith(expect.objectContaining({templateId:"guitar",coachId:"teacher",roomId:"room",date:"2026-10-10",time:"10:00"}));
});
it("does not auto-select a fixed-origin pair that the user cannot select",async()=>{
 m.slots.mockResolvedValue({success:true,data:[{time:"10:00",roomId:"room",coachIds:["teacher"],fixedOriginCoachIds:["teacher"]}]});
 await act(async()=>root.render(createElement(MusicScheduleWizard,props)));await click("10:00");
 expect(host.textContent).not.toContain("建立課程，接著選學員");expect(host.querySelector<HTMLButtonElement>('button[title]')?.disabled).toBe(true);
});
it("offers the relevant repair in another tab and refreshes while keeping entered settings",async()=>{
 m.slots.mockResolvedValue({success:true,data:[],unavailable:[{time:"10:00",reason:"沒有符合這門課資格的老師",fixTarget:"teacher"}]});
 await act(async()=>root.render(createElement(MusicScheduleWizard,props)));
 expect(host.querySelector("details")?.open).toBe(false);
 expect(host.querySelector('[aria-label="可排時段"] > p')?.textContent).toBe("沒有符合這門課資格的老師");
 const link=host.querySelector<HTMLAnchorElement>('a[href="/dashboard/teachers"]')!;expect(link.target).toBe("_blank");
 const capacity=host.querySelector<HTMLInputElement>('input[type="number"]')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(capacity,"2");capacity.dispatchEvent(new Event("input",{bubbles:true}));});
 await click("已修正");expect(capacity.value).toBe("2");expect(m.slots).toHaveBeenCalledTimes(2);expect(host.querySelector<HTMLInputElement>('input[type="date"]')?.value).toBe("2026-10-10");
});
it("blocks sidebar navigation with an unsaved draft but permits opening a repair tab",async()=>{
 function Fixture(){useCourseDraftGuard(true);return createElement("div",null,createElement("a",{href:"/dashboard/teachers"},"離開"),createElement("a",{href:"/dashboard/courses/hours",target:"_blank"},"修正"));}
 vi.spyOn(window,"confirm").mockReturnValue(false);await act(async()=>root.render(createElement(Fixture)));
 const leave=new MouseEvent("click",{bubbles:true,cancelable:true});host.querySelector("a")!.dispatchEvent(leave);expect(leave.defaultPrevented).toBe(true);
 const repair=new MouseEvent("click",{bubbles:true,cancelable:true});host.querySelectorAll("a")[1].dispatchEvent(repair);expect(repair.defaultPrevented).toBe(false);expect(window.confirm).toHaveBeenCalledTimes(1);
});

it("protects drafts when only duration or capacity changes",async()=>{
 m.slots.mockResolvedValue({success:true,data:[]});const guard=vi.fn();
 await act(async()=>root.render(createElement(MusicScheduleWizard,{...props,onGuard:guard})));
 expect(guard).toHaveBeenLastCalledWith(false,false);
 const duration=host.querySelectorAll<HTMLSelectElement>("select")[2];
 await act(async()=>{duration.value="90";duration.dispatchEvent(new Event("change",{bubbles:true}));});
 expect(guard).toHaveBeenLastCalledWith(true,false);
 await act(async()=>{duration.value="60";duration.dispatchEvent(new Event("change",{bubbles:true}));});
 expect(guard).toHaveBeenLastCalledWith(false,false);
 const capacity=host.querySelector<HTMLInputElement>('input[type="number"]')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(capacity,"2");capacity.dispatchEvent(new Event("input",{bubbles:true}));});
 expect(guard).toHaveBeenLastCalledWith(true,false);
});

it("shows a day-wide blocker before detailed outside-hours reasons",async()=>{
 m.slots.mockResolvedValue({success:true,data:[],unavailable:[{time:"09:00",reason:"非營業時段",fixTarget:"hours"}],blocker:{reason:"教師尚未勾選此班型的授課資格",fixTarget:"teacher"}});
 await act(async()=>root.render(createElement(MusicScheduleWizard,props)));
 expect(host.querySelector('[aria-label="可排時段"] > p')?.textContent).toContain("尚未勾選此班型");
 expect(host.querySelector('a[href="/dashboard/teachers"]')).not.toBeNull();
 expect(host.querySelector('a[href="/dashboard/courses/hours"]')).toBeNull();
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
