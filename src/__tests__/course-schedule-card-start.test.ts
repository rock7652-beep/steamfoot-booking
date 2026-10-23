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

it.each([
 [{expiresAt:"2026-10-16T15:59:59.999Z",expired:true,available:0},"有效至 2026-10-16"],
 [{available:0,remaining:8,held:8},"可用 0 堂，本次需 1 堂（已預約占用 8 堂）"],
 [{subjectMatches:false},"科目不符"],
])("displays a specific blocking reason for an unusable selected card: %j",async(overrides,reason)=>{
 reader.read.mockResolvedValue({success:true,customers:[{id:"a",name:"學員",phone:""}],cards:[{id:"card",name:"課卡",unit:"SESSION",available:2,expiresAt:"2027-01-13T15:59:59.999Z",subjectMatches:true,members:[{id:"a",name:"學員",phone:""}],...overrides}]});
 const div=document.createElement("div");const root=createRoot(div);const validity=vi.fn();
 function Harness(){const [value,onChange]=React.useState([{customerId:"a",cardId:"",name:"學員"}]);return React.createElement(CourseScheduleLearners,{templateId:"teaching:group",pointCost:1,capacity:8,value,onChange,onValidityChange:validity,allowDeferred:true,scheduleDate:"2026-10-17",scheduleTime:"16:00"});}
 await act(async()=>root.render(React.createElement(Harness)));
 expect(div.querySelector('[role="alert"]')?.textContent).toContain(reason);
 expect(validity).toHaveBeenLastCalledWith(false);expect((div.querySelector('option[value="card"]') as HTMLOptionElement).disabled).toBe(true);
 expect((div.querySelector('select') as HTMLSelectElement).value).toBe("card");
 await act(async()=>root.unmount());
});

it("prefers a usable matching card over expired or wrong-subject cards",async()=>{
 const base={unit:"SESSION",available:2,expiresAt:"2027-01-13T15:59:59.999Z",members:[{id:"a",name:"學員",phone:""}]};
 reader.read.mockResolvedValue({success:true,customers:[],cards:[{...base,id:"wrong",name:"別科",subjectMatches:false},{...base,id:"old",name:"舊卡",expired:true},{...base,id:"valid",name:"可用",subjectMatches:true}]});
 const div=document.createElement("div");const root=createRoot(div);const validity=vi.fn();
 function Harness(){const [value,onChange]=React.useState([{customerId:"a",cardId:"wrong",name:"學員"}]);return React.createElement(CourseScheduleLearners,{templateId:"teaching:group",pointCost:1,capacity:8,value,onChange,onValidityChange:validity,allowDeferred:true,scheduleDate:"2026-10-17",scheduleTime:"16:00"});}
 await act(async()=>root.render(React.createElement(Harness)));expect((div.querySelector('select') as HTMLSelectElement).value).toBe("valid");expect(validity).toHaveBeenLastCalledWith(true);expect(div.querySelector('[role="alert"]')).toBeNull();await act(async()=>root.unmount());
});


it.each([null,"2026-10-17T08:00:00Z"])("shows first-use validity instead of the sentinel date until activation (%s)",async musicActivatedAt=>{
 reader.read.mockResolvedValue({success:true,customers:[{id:"validity-student",name:"期限驗收",phone:""}],cards:[{id:"validity-card",name:"兩期八堂",unit:"SESSION",available:8,expiresAt:musicActivatedAt?"2026-12-25T15:59:59.999Z":"2099-12-31T15:59:59.999Z",musicValidityDays:70,musicActivatedAt,members:[{id:"validity-student",name:"期限驗收",phone:""}]}]});
 const div=document.createElement("div");const root=createRoot(div);
 try {
  await act(async()=>root.render(React.createElement(CourseScheduleLearners,{templateId:`validity-${musicActivatedAt}`,pointCost:1,capacity:1,value:[{customerId:"validity-student",cardId:"validity-card",name:"期限驗收"}],onChange:vi.fn(),allowDeferred:true,scheduleDate:"2026-10-23",scheduleTime:"16:00"})));
  expect(div.textContent).toContain(musicActivatedAt?"有效至 2026-12-25":"首次扣堂起 70 天");
  expect(div.textContent).not.toContain("2099-12-31");
 }finally{await act(async()=>root.unmount());}
});
