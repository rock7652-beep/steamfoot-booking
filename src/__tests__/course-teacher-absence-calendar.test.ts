// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
vi.mock("@/server/actions/course-slot-matches",()=>({getMusicSlotMatches:vi.fn()}));
import {CourseScheduleBoard} from "@/app/(dashboard)/dashboard/courses/course-schedule-board";
it.each([['FITNESS','week'],['FITNESS','day'],['MUSIC','week'],['MUSIC','day']] as const)("%s %s keeps a released teacher-absence class accessible for correction",async(businessProfile,mode)=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const onOpen=vi.fn();const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(createElement(CourseScheduleBoard,{businessProfile,mode,selectedDate:"2026-10-01",today:"2026-10-01",sessions:[{id:"absent",templateId:"template",nameSnapshot:"請假測試課",startsAt:"2026-10-01T02:00:00Z",endsAt:"2026-10-01T03:00:00Z",coachId:"coach",roomId:"room",capacity:10,pointCost:2,teacherAttendance:"LEAVE",previewFaded:"異動／請假",bookings:[{customerId:"student",customerName:"學員",status:"CANCELLED",bookingKind:"CARD"}]}],rooms:[{id:"room",name:"A教室",isActive:true}],coaches:[{id:"coach",displayName:"林老師",status:"ACTIVE",courseCoachEnabled:true}],templates:[{id:"template",name:"請假測試課",classType:"GROUP"}],storePeriods:[{openTime:"09:00",closeTime:"12:00"}],staffAvailability:[],staffAvailabilityExceptions:[],onOpenEmpty:vi.fn(),onSelectDate:vi.fn(),onOpenSession:onOpen})));
  const card=[...host.querySelectorAll('button')].find(button=>button.getAttribute('aria-label')?.includes('請假測試課'))!;
  expect(card.disabled).toBe(false);
  expect(card.parentElement?.className).not.toContain('pointer-events-none');
  await act(async()=>card.click());
  expect(onOpen).toHaveBeenCalledWith('absent','2026-10-01');
 }finally{await act(async()=>root.unmount());host.remove();}
});

it.each(["ATTENDED","NO_SHOW"])("retains a one-student %s class in day and week calendars",async status=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const open=vi.fn();
 try {
 for(const mode of ["day","week"] as const){
 await act(async()=>root.render(createElement(CourseScheduleBoard,{businessProfile:"FITNESS",mode,selectedDate:"2026-10-07",today:"2026-10-06",sessions:[{id:"session",templateId:"template",nameSnapshot:"單人紀錄測試",startsAt:"2026-10-07T02:00:00Z",endsAt:"2026-10-07T03:00:00Z",coachId:"coach",roomId:"room",capacity:1,pointCost:1,bookings:[{customerId:"student",customerName:"學員",status,bookingKind:"CARD"}]}],rooms:[{id:"room",name:"A教室",isActive:true}],coaches:[{id:"coach",displayName:"教練",status:"ACTIVE",courseCoachEnabled:true}],templates:[{id:"template",name:"單人紀錄測試",classType:"PRIVATE"}],storePeriods:[{openTime:"09:00",closeTime:"12:00"}],staffAvailability:[],staffAvailabilityExceptions:[],onOpenEmpty:vi.fn(),onSelectDate:vi.fn(),onOpenSession:open})));
 const card=[...host.querySelectorAll('button')].find(b=>b.title.includes('學員')&&b.title.includes('10:00'));
 expect(card).toBeTruthy();expect(card!.disabled).toBe(false);
 await act(async()=>card!.click());expect(open).toHaveBeenCalledWith('session','2026-10-07');
 }
 }finally{await act(async()=>root.unmount());host.remove();}
});
