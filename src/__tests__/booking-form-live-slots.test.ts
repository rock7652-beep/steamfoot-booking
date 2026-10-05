// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({slots:vi.fn(),calendar:vi.fn()}));
vi.mock("@/server/actions/slots",()=>({fetchDaySlots:m.slots}));
vi.mock("@/app/(dashboard)/dashboard/bookings/new/booking-create-form",()=>({useBookingFormValidation:()=>({errors:{},clearError:vi.fn(),setCalendarDate:m.calendar})}));
vi.mock("@/components/steamfoot-booking-calendar",()=>({SteamfootBookingCalendar:({days,onChange}:{days:string[];onChange:(date:string)=>void})=>React.createElement("div",{},...days.map(day=>React.createElement("button",{key:day,onClick:()=>onChange(day)},day)))}));
import {DashboardBookingForm} from "@/app/(dashboard)/dashboard/bookings/new/booking-form";
let host:HTMLDivElement,root:Root;
const slot=(bookedCount:number)=>({startTime:"10:00",endTime:"10:30",capacity:2,bookedCount,available:2-bookedCount,isEnabled:true});
beforeEach(()=>{vi.resetAllMocks();vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-10-04T00:00:00+08:00"));Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());vi.useRealTimers();});
it("uses the fresh initial snapshot once, then reflects capacity changes when returning to that date",async()=>{
 const props={days:["2026-10-05","2026-10-06"],defaultDate:"2026-10-05",todayStr:"2026-10-04",initialSlots:[slot(2)]};
 await act(async()=>root.render(React.createElement(DashboardBookingForm,props)));
 expect(m.slots).not.toHaveBeenCalled();expect(host.querySelector<HTMLInputElement>('input[type="radio"]')!.disabled).toBe(true);
 m.slots.mockResolvedValue({slots:[slot(0)]});
 await act(async()=>Array.from(host.querySelectorAll("button")).find(b=>b.textContent==="2026-10-06")!.click());
 await act(async()=>Array.from(host.querySelectorAll("button")).find(b=>b.textContent==="2026-10-05")!.click());
 expect(m.slots).toHaveBeenCalledWith("2026-10-05");expect(host.querySelector<HTMLInputElement>('input[type="radio"]')!.disabled).toBe(false);
});
