// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
vi.mock("@/server/actions/course-slot-matches",()=>({getMusicSlotMatches:vi.fn()}));
import {CourseScheduleBoard} from "@/app/(dashboard)/dashboard/courses/course-schedule-board";
const session={id:"occupied",templateId:"group",nameSnapshot:"團課",startsAt:"2026-10-01T02:00:00Z",endsAt:"2026-10-01T03:00:00Z",coachId:"coach",roomId:"room",capacity:10,pointCost:2,bookings:[]};
const base={businessProfile:"FITNESS" as const,selectedDate:"2026-10-01",today:"2026-10-01",initialWeekRoomId:"room",sessions:[],rooms:[{id:"room",name:"A教室",isActive:true}],coaches:[{id:"coach",displayName:"林教練",status:"ACTIVE",courseCoachEnabled:true}],templates:[{id:"group",name:"團課",classType:"GROUP"},{id:"private",name:"私課",classType:"PRIVATE"}],storePeriods:[{openTime:"09:00",closeTime:"12:00"}],staffAvailability:[],staffAvailabilityExceptions:[],onSelectDate:vi.fn(),onOpenSession:vi.fn()};
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
it("fitness week cards distinguish group/private accessibly without coloured fills",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(createElement(CourseScheduleBoard,{...base,mode:"week",sessions:[session,{...session,id:"private",templateId:"private",nameSnapshot:"私課",startsAt:"2026-10-01T03:00:00Z",endsAt:"2026-10-01T04:00:00Z"}],onOpenEmpty:vi.fn()})));
  const group=[...host.querySelectorAll("button")].find(b=>b.getAttribute("aria-label")?.includes("，團課，"))!;
  const individual=[...host.querySelectorAll("button")].find(b=>b.getAttribute("aria-label")?.includes("，私課，"))!;
  expect(group.getAttribute("aria-label")).toContain("團課");expect(individual.getAttribute("aria-label")).toContain("私課");expect(group.className).toContain("bg-white");
  expect(group.querySelector("strong")?.parentElement?.className).toContain("text-sm");
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
  expect(host.textContent).toContain("體驗客1");
  await act(async()=>root.render(createElement(CourseScheduleBoard,{...base,mode:"day",assignedFiltered:true,sessions:[],occupiedSessions:[filtered],onOpenEmpty:vi.fn()})));
  expect(host.textContent).toContain("所屬 0 人次");
  expect(host.textContent).toContain("今日安排0");
  expect(host.querySelector<HTMLButtonElement>('button[aria-label="10:00 已有課"]')?.disabled).toBe(true);
 } finally {await act(async()=>root.unmount());host.remove();}
});

it("music uses schedule-kind colors and attendance progress",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try {
  const item={...session,endsAt:"2026-10-01T03:30:00Z",isFixed:true,isBiweekly:true,bookings:[{customerId:"learner",customerName:"小安",status:"ATTENDED",bookingKind:"PLAN"}]};
  await act(async()=>root.render(createElement(CourseScheduleBoard,{...base,businessProfile:"MUSIC",initialResourceView:"room",mode:"week",sessions:[item],onOpenEmpty:vi.fn()})));
  const card=host.querySelector<HTMLButtonElement>('button[data-schedule-card="tracking"]')!;
  expect(card.className).toContain("bg-violet-100");
  expect(card.className).not.toContain("border-l-4");
  expect(card.getAttribute("aria-label")).toContain("隔週");
  expect(card.textContent).toContain("10:00–11:30");
  expect(card.textContent).toContain("✓ 1/1");
  expect(card.getAttribute("aria-label")).toContain("隔週");
  expect(card.querySelector("strong")?.parentElement?.className).toContain("text-sm");
  expect(host.textContent).toContain("今天");
  expect(host.textContent).not.toContain("0 堂｜0 人次");
 } finally {await act(async()=>root.unmount());host.remove();}
});


it("music keeps inactive historical rooms in the timeline and expands teacher columns",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(createElement(CourseScheduleBoard,{...base,businessProfile:"MUSIC",mode:"week",initialResourceView:"room",sessions:[{...session,roomId:"old"}],rooms:[...base.rooms,{id:"old",name:"02",isActive:false}],initialWeekRoomId:"old",onOpenEmpty:vi.fn()})));
  expect(host.querySelector('[aria-label="教室週課表"]')).not.toBeNull();
  expect(host.textContent).toContain("10:00–11:00");
  expect(host.querySelector<HTMLButtonElement>('button[aria-label="2026-10-01 09:00 資源未啟用"]')?.disabled).toBe(true);
  await act(async()=>root.render(createElement(CourseScheduleBoard,{...base,businessProfile:"MUSIC",mode:"day",sessions:[session],coaches:[...base.coaches,{...base.coaches[0],id:"two",displayName:"老師二"}],onOpenEmpty:vi.fn()})));
  await act(async()=>[...host.querySelectorAll("button")].find(button=>button.textContent==="教師視角")!.click());
  expect(host.querySelector('[aria-label="日表日期"]')?.textContent).toContain("2026-10-01");
  expect(host.querySelector('[style*="grid-template-columns: 64px repeat(2, minmax(200px, 1fr))"]')).not.toBeNull();
 } finally {await act(async()=>root.unmount());host.remove();}
});

it("music week pastes the actual 25-minute class on the chosen day without opening a new class",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const paste=vi.fn();const open=vi.fn();
 try {
  await act(async()=>root.render(createElement(CourseScheduleBoard,{...base,businessProfile:"MUSIC",mode:"week",initialResourceView:"room",storePeriods:[{openTime:"09:00",closeTime:"09:55"}],moveClipboard:{sessionId:"source",templateId:"group",coachId:"coach",roomId:"room",durationMinutes:25,scope:"SINGLE",label:"體驗"},onPasteMove:paste,onOpenEmpty:open})));
  const free=host.querySelector<HTMLButtonElement>('button[aria-label="2026-10-02 09:30 貼上"]')!;
  expect(free.disabled).toBe(false);await act(async()=>free.click());
  expect(paste).toHaveBeenCalledWith({date:"2026-10-02",time:"09:30",roomId:"room",coachId:"coach"});expect(open).not.toHaveBeenCalled();
 } finally {await act(async()=>root.unmount());host.remove();}
});

it.each([{native:true,service:true},{native:true,service:false},{native:false,service:false}])('clipboard loading feedback follows the actual slot query ($native/$service)',async({native,service})=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 vi.stubGlobal('ResizeObserver',class {observe=vi.fn();disconnect=vi.fn();});
 vi.stubGlobal('requestAnimationFrame',()=>0);vi.stubGlobal('cancelAnimationFrame',vi.fn());
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
 const {getMusicSlotMatches}=await import('@/server/actions/course-slot-matches');
 const read=vi.mocked(getMusicSlotMatches);read.mockReset().mockImplementation(()=>new Promise(()=>{}));
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),paste=vi.fn();
 try{
  await act(async()=>root.render(createElement(CourseScheduleBoard,{...base,businessProfile:native?'FITNESS':'MUSIC',sportsNative:native,serviceMode:service,mode:'day',initialResourceView:'room',onOpenEmpty:vi.fn(),onPasteMove:paste,moveClipboard:{sessionId:'move',templateId:'private',roomId:'room',coachId:'coach',durationMinutes:60,scope:'SINGLE',label:'測試改期'}})));
  if(native){
   expect(read).not.toHaveBeenCalled();expect(host.textContent).not.toContain('正在核對老師與教室');
   const target=host.querySelector<HTMLButtonElement>('button[aria-label="09:30 貼上課程"]')!;
   expect(target.disabled).toBe(false);await act(async()=>target.click());expect(paste).toHaveBeenCalledWith({date:base.selectedDate,time:'09:30',roomId:'room',coachId:'coach'});
  }else{expect(read).toHaveBeenCalledOnce();expect(host.textContent).toContain('正在核對老師與教室');}
 }finally{await act(async()=>root.unmount());host.remove();read.mockReset();vi.unstubAllGlobals();}
});

it("music displays its opening range rather than a fixed 09:00–22:00 window", async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try {
  await act(async()=>root.render(createElement(CourseScheduleBoard,{...base,businessProfile:"MUSIC",mode:"day",storePeriods:[{openTime:"07:00",closeTime:"23:00"}],onOpenEmpty:vi.fn()})));
  expect(host.querySelector('button[aria-label^="09:00"]')).not.toBeNull();
  expect(host.querySelector('button[aria-label^="07:00"]')).not.toBeNull();
  expect(host.querySelector('button[aria-label^="22:00"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="課表結束時間"]')?.textContent).toBe("23:00");
 } finally {await act(async()=>root.unmount());host.remove();}
});
it("music keeps real lessons and original moved positions outside its default window visible", async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 const late={...session,startsAt:"2026-10-01T14:00:00Z",endsAt:"2026-10-01T14:30:00Z",rescheduledFromStartsAt:"2026-10-01T00:00:00Z",rescheduledFromEndsAt:"2026-10-01T00:30:00Z",rescheduledFromRoomId:"room",rescheduledFromCoachId:"coach"};
 try {
  await act(async()=>root.render(createElement(CourseScheduleBoard,{...base,businessProfile:"MUSIC",mode:"day",sessions:[late],onOpenEmpty:vi.fn()})));
  expect(host.querySelector('button[aria-label^="08:00"]')).not.toBeNull();
  expect(host.querySelector('button[aria-label^="22:00"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="課表結束時間"]')?.textContent).toBe("23:00");
 } finally {await act(async()=>root.unmount());host.remove();}
});
