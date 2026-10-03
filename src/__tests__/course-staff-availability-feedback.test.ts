// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({save:vi.fn(),success:vi.fn(),error:vi.fn(),guard:vi.fn()}));
vi.mock("next/navigation",()=>({usePathname:()=>"/dashboard/teachers"}));
vi.mock("sonner",()=>({toast:{success:m.success,error:m.error}}));
vi.mock("@/server/actions/course-availability",()=>({getCourseStaffAvailability:async()=>({inheritStoreHours:false,weekly:[],exceptions:[]}),saveCourseStaffWeeklyAvailability:m.save,saveCourseStaffAvailabilityException:vi.fn()}));
import {CourseStaffAvailabilityEditor} from "@/app/(dashboard)/dashboard/courses/course-staff-availability-editor";
let host:HTMLDivElement,root:Root;
beforeEach(async()=>{vi.resetAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);await act(async()=>root.render(createElement(CourseStaffAvailabilityEditor,{staffId:"coach",fitness:true,onGuard:m.guard})));});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
function button(text:string){return [...host.querySelectorAll('button')].find(b=>b.textContent===text)!;}
it("shows a success toast and clears the saved draft guard",async()=>{
 await act(async()=>button("設為休息").click());
 m.save.mockResolvedValue({success:true});
 await act(async()=>button("儲存時間").click());
 expect(m.success).toHaveBeenCalledWith("授課時間已更新，已排課程不受影響");
 expect(m.guard).toHaveBeenLastCalledWith({dirty:false,pending:false});
 expect(m.save).toHaveBeenCalledWith(expect.objectContaining({days:expect.arrayContaining([{dayOfWeek:0,periods:[]}])}));
});
it("shows overlapping-time rejection immediately and preserves the added period",async()=>{
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="新增時段"]')!.click());
 m.save.mockResolvedValue({success:false,error:"可授課時段不可重疊，且結束時間需晚於開始時間"});
 await act(async()=>button("儲存時間").click());
 expect(m.error).toHaveBeenCalledWith("週日時段有誤，請修改紅框時間");
 expect(m.save).not.toHaveBeenCalled();
 expect(host.querySelectorAll('[aria-invalid="true"]')).toHaveLength(4);
 expect(host.querySelectorAll('input[type="time"]')).toHaveLength(16);
 expect(m.guard).toHaveBeenLastCalledWith({dirty:true,pending:false});
});
it("shows pending text, then a connection failure without discarding edits",async()=>{
 await act(async()=>button("設為休息").click());
 let reject!:(error:Error)=>void;m.save.mockReturnValue(new Promise((_,fail)=>{reject=fail}));
 await act(async()=>button("儲存時間").click());
 expect(button("儲存中…").disabled).toBe(true);
 await act(async()=>reject(new Error("offline")));
 expect(m.error).toHaveBeenCalledWith("儲存失敗，請重試；修改內容已保留");
 expect(m.guard).toHaveBeenLastCalledWith({dirty:true,pending:false});
 expect(button("開放授課")).toBeTruthy();
});

it("keeps affected existing classes visible after a successful weekly save",async()=>{
 m.save.mockResolvedValue({success:true,retainedSessions:[{id:"lesson",name:"舊課",startsAt:"2026-10-03T10:00:00Z",endsAt:"2026-10-03T11:00:00Z",capacity:3}]});
 await act(async()=>button("設為休息").click());
 await act(async()=>button("儲存時間").click());
 expect(host.textContent).toContain("以下 1 堂超出新時段，仍保留原安排");
 expect(host.textContent).toContain("舊課");
 expect(m.guard).toHaveBeenLastCalledWith({dirty:false,pending:false});
});

it("marks only equal-time rows and clears red borders when corrected",async()=>{
 const inputs=host.querySelectorAll<HTMLInputElement>('input[type="time"]');
 await act(async()=>{const input=inputs[5];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'09:00');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});
 await act(async()=>button("儲存時間").click());
 expect(m.save).not.toHaveBeenCalled();expect(m.error).toHaveBeenCalledWith("週二時段有誤，請修改紅框時間");
 expect(host.querySelectorAll('[aria-invalid="true"]')).toHaveLength(2);
 await act(async()=>{const input=inputs[5];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'21:00');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(host.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);
});
