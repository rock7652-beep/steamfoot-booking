// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
import {CourseScheduleLearners} from "@/components/admin/course-schedule-learners";
const reader=vi.hoisted(()=>({read:vi.fn(),invalidate:vi.fn()}));
vi.mock("@/components/operations/panel-read-cache",()=>({usePanelReader:()=>reader}));
vi.mock("@/server/actions/course-schedule-enrollment",()=>({loadCourseScheduleEnrollmentOptions:vi.fn(),createScheduleCustomer:vi.fn()}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true,React});
it("shows the precise start reason, blocks early scheduling, and updates at the boundary without refetching",async()=>{
 reader.read.mockResolvedValue({success:true,customers:[{id:"a",name:"學員",phone:""}],cards:[{id:"card",name:"團班8堂",unit:"SESSION",available:2,expiresAt:"2027-01-13T15:59:59.999Z",startRequired:true,startsAt:"2026-11-05T12:00:00Z",members:[{id:"a",name:"學員",phone:""}]}]});
 const div=document.createElement("div");document.body.append(div);const root=createRoot(div);const onValidityChange=vi.fn();const onChange=vi.fn();
 const props={templateId:"teaching:group",pointCost:1,capacity:8,value:[{customerId:"a",cardId:"card",name:"學員"}],onChange,onValidityChange,allowDeferred:true};
 const render=async(date:string,time:string)=>{await act(async()=>root.render(React.createElement(CourseScheduleLearners,{...props,scheduleDate:date,scheduleTime:time})));};
 await render("2026-10-17","16:00");
 expect(div.querySelector('[role="alert"]')?.textContent).toContain("2026-11-05 20:00");expect(onValidityChange).toHaveBeenLastCalledWith(false);
 expect((div.querySelector('option[value="card"]') as HTMLOptionElement).disabled).toBe(true);
 await render("2026-11-05","19:59");expect(onValidityChange).toHaveBeenLastCalledWith(false);
 await render("2026-11-05","20:00");expect(onValidityChange).toHaveBeenLastCalledWith(true);expect(div.querySelector('[role="alert"]')).toBeNull();expect((div.querySelector('option[value="card"]') as HTMLOptionElement).disabled).toBe(false);
 await render("2026-11-04","20:00");expect(onValidityChange).toHaveBeenLastCalledWith(false);expect(reader.read).toHaveBeenCalledTimes(1);
 await act(async()=>root.unmount());div.remove();
});
