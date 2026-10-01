// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
vi.mock("@/server/actions/course-slot-matches",()=>({getMusicSlotMatches:vi.fn()}));
import {CourseScheduleBoard} from "@/app/(dashboard)/dashboard/courses/course-schedule-board";
const session={id:"occupied",templateId:"group",nameSnapshot:"團課",startsAt:"2026-10-01T02:00:00Z",endsAt:"2026-10-01T03:00:00Z",coachId:"coach",roomId:"room",capacity:10,pointCost:2,bookings:[]};
const base={businessProfile:"FITNESS" as const,selectedDate:"2026-10-01",today:"2026-10-01",sessions:[],rooms:[{id:"room",name:"A教室",isActive:true}],coaches:[{id:"coach",displayName:"林教練",status:"ACTIVE",courseCoachEnabled:true}],templates:[{id:"group",name:"團課",classType:"GROUP"},{id:"private",name:"私課",classType:"PRIVATE"}],storePeriods:[{openTime:"09:00",closeTime:"12:00"}],staffAvailability:[],staffAvailabilityExceptions:[],onSelectDate:vi.fn(),onOpenSession:vi.fn()};
it.each(["week","day"] as const)("%s opens a half-hour slot with room/time and blocks hidden occupancy",async(mode)=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const open=vi.fn();
 try {
  await act(async()=>root.render(createElement(CourseScheduleBoard,{...base,mode,occupiedSessions:[session],onOpenEmpty:open})));
  const free=host.querySelector<HTMLButtonElement>(mode==="week"?'button[aria-label="2026-10-01 09:30 排課"]':'button[aria-label="09:30 可排 30 分鐘"]')!;
  expect(free.disabled).toBe(false);await act(async()=>free.click());
  expect(open).toHaveBeenCalledWith({time:"09:30",roomId:"room",durationMinutes:30,...(mode==="week"?{date:"2026-10-01"}:{})});
  const busy=host.querySelector<HTMLButtonElement>(mode==="week"?'button[aria-label="2026-10-01 10:00 已有課程"]':'button[aria-label="10:00 已有課"]')!;
  expect(busy.disabled).toBe(true);
 } finally {await act(async()=>root.unmount());host.remove();}
});
it("week honors each day's opening periods and creation permission",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const open=vi.fn();
 try {
  const props={...base,mode:"week" as const,calendarDays:{"2026-10-02":{status:"closed",periods:[]}},onOpenEmpty:open};
  await act(async()=>root.render(createElement(CourseScheduleBoard,props)));
  expect(host.querySelector<HTMLButtonElement>('button[aria-label="2026-10-02 09:00 店家未開放"]')?.disabled).toBe(true);
  await act(async()=>root.render(createElement(CourseScheduleBoard,{...props,canCreate:false})));
  const free=host.querySelector<HTMLButtonElement>('button[aria-label="2026-10-01 09:30 排課"]')!;
  expect(free.disabled).toBe(true);await act(async()=>free.click());expect(open).not.toHaveBeenCalled();
 } finally {await act(async()=>root.unmount());host.remove();}
});
it("fitness class dots distinguish group/private without coloured fills",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(createElement(CourseScheduleBoard,{...base,mode:"week",sessions:[session,{...session,id:"private",templateId:"private",nameSnapshot:"私課",startsAt:"2026-10-01T03:00:00Z",endsAt:"2026-10-01T04:00:00Z"}],onOpenEmpty:vi.fn()})));
  const group=[...host.querySelectorAll("button")].find(b=>b.getAttribute("aria-label")?.startsWith("團課，"))!;
  const individual=[...host.querySelectorAll("button")].find(b=>b.getAttribute("aria-label")?.startsWith("私課，"))!;
  expect(group.querySelector("span[aria-hidden]")?.className).toContain("bg-emerald-600");expect(individual.querySelector("span[aria-hidden]")?.className).toContain("bg-blue-600");expect(group.className).toContain("bg-white");
  expect(group.querySelector("div")?.className).toContain("text-sm");
 } finally {await act(async()=>root.unmount());host.remove();}
});
it("day statistics use visible ownership matches but capacity and hidden slot conflicts use the whole class",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 const book=(customerId:string)=>({customerId,customerName:customerId,status:"RESERVED",bookingKind:"TRIAL"});
 const whole=[book("mine"),book("other")];
 const filtered={...session,capacity:2,bookings:whole,displayBookings:[whole[0]]};
 try {
  await act(async()=>root.render(createElement(CourseScheduleBoard,{...base,mode:"day",assignedFiltered:true,sessions:[filtered],occupiedSessions:[filtered],onOpenEmpty:vi.fn()})));
  expect(host.textContent).toContain("所屬 1 人次");
  expect(host.textContent).toContain("滿班1");
  expect(host.textContent).toContain("體驗1");
  await act(async()=>root.render(createElement(CourseScheduleBoard,{...base,mode:"day",assignedFiltered:true,sessions:[],occupiedSessions:[filtered],onOpenEmpty:vi.fn()})));
  expect(host.textContent).toContain("所屬 0 人次");
  expect(host.textContent).toContain("今日課程0");
  expect(host.querySelector<HTMLButtonElement>('button[aria-label="10:00 已有課"]')?.disabled).toBe(true);
 } finally {await act(async()=>root.unmount());host.remove();}
});
