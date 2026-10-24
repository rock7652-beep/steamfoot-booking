// @vitest-environment jsdom
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,it,expect,vi} from "vitest";
vi.mock("@/server/actions/course-slot-matches",()=>({getMusicSlotMatches:vi.fn()}));
vi.mock("@/components/admin/use-sports-calendar-state",()=>({
 useSportsCalendarState:(_enabled:boolean,_key:string,initial:unknown)=>React.useState(initial),
 useSportsCalendarScroll:vi.fn(),calendarResource:()=>true,calendarString:()=>true,
}));
import {CourseScheduleBoard} from "@/app/(dashboard)/dashboard/courses/course-schedule-board";
function board(mode:"week"|"day",minutes:number,sportsNative=true){
 const props:React.ComponentProps<typeof CourseScheduleBoard>={
  sportsNative,businessProfile:sportsNative?"FITNESS":"MUSIC",mode,selectedDate:"2026-10-19",today:"2026-10-19",initialResourceView:"room",
  rooms:[{id:"room",name:"教室",isActive:true}],coaches:[{id:"coach",displayName:"教練",status:"ACTIVE",courseCoachEnabled:true}],templates:[{id:"tpl",name:"課程",classType:"GROUP"}],
  sessions:[{id:"session",templateId:"tpl",nameSnapshot:"短課程",startsAt:"2026-10-19T02:15:00Z",endsAt:new Date(Date.parse("2026-10-19T02:15:00Z")+minutes*60000).toISOString(),coachId:"coach",roomId:"room",capacity:8,pointCost:1,sportsPalette:sportsNative,bookings:[]}],
  storePeriods:[{openTime:"09:00",closeTime:"22:00"}],staffAvailability:[],staffAvailabilityExceptions:[],onOpenEmpty:vi.fn(),onSelectDate:vi.fn(),onOpenSession:vi.fn(),
 };
 const div=document.createElement("div");div.innerHTML=renderToStaticMarkup(React.createElement(CourseScheduleBoard,props));return div;
}
describe("sports compact timetable uses one scale for cards and clock",()=>{
 for(const mode of ["week","day"] as const){
  it.each([40,45,50,60])(`${mode} preserves a %i minute course and its quarter-hour start`,minutes=>{
   const div=board(mode,minutes);const card=div.querySelector('[data-schedule-card="tracking"]')!;const wrapper=card.parentElement!;
   expect(parseFloat(wrapper.style.height)).toBeCloseTo(minutes*88/60-4);
   expect(parseFloat(wrapper.style.top)).toBeCloseTo(15*88/60+2);
   expect(div.querySelector('[style*="height:88px"]')).not.toBeNull();
   expect(card.textContent).toContain("10:15");expect(card.textContent).toContain("短課程");
  });
  it(`${mode} keeps music cards aligned with the denser 64px hour scale`,()=>{
   const div=board(mode,60,false);const wrapper=div.querySelector('[data-schedule-card="tracking"]')!.parentElement!;
   expect(parseFloat(wrapper.style.height)).toBe(60);expect(div.querySelector('[style*="height:64px"]')).not.toBeNull();
  });
 }
});

for (const mode of ["week", "day"] as const) {
 it.each([25, 50])(`${mode} keeps %i minute music lessons aligned without stretching into the next slot`, minutes => {
  const div=board(mode,minutes,false);
  const card=div.querySelector<HTMLButtonElement>('button[title^="10:15 短課程"]')!;
  expect(card).not.toBeNull();
  expect(parseFloat(card.parentElement!.style.height)).toBeCloseTo(minutes*64/60-4);
  expect(parseFloat(card.parentElement!.style.top)).toBeCloseTo(15*64/60+2);
  expect(card.textContent).toContain("10:15");
  expect(card.textContent).toContain(minutes===25?"10:40":"11:05");
  expect(card.textContent).toContain("短課程");
 });
}
