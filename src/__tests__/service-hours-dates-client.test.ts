// @vitest-environment jsdom
import {writeFileSync} from "node:fs";
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({fetch:vi.fn(),day:vi.fn(),summary:vi.fn(),specials:vi.fn(),toast:vi.fn()}));
vi.mock("next/navigation",()=>({usePathname:()=>"/s/a/admin/dashboard/settings/hours"}));
vi.mock("sonner",()=>({toast:{success:m.toast,error:vi.fn()}}));
vi.mock("@/app/(dashboard)/dashboard/courses/hours/weekly-hours-editor",()=>({CourseWeeklyHoursEditor:()=>null}));
vi.mock("@/server/actions/course-business-hours",()=>({getCourseDayHours:m.day,getCourseMonthScheduleSummary:m.summary,getCourseMonthSpecialDays:m.specials,saveCourseDayHours:vi.fn()}));
vi.mock("@/server/actions/business-hours",()=>({getDaySlotDetails:m.day,getMonthScheduleSummary:m.summary,getMonthSpecialDays:m.specials,syncFromHeadquarters:vi.fn()}));
import {ScheduleManager} from "@/app/(dashboard)/dashboard/settings/hours/schedule-manager";
const periods=[{openTime:"09:00",closeTime:"18:00",slotInterval:60,defaultCapacity:6}];
const weekly=["週日","週一","週二","週三","週四","週五","週六"].map((dayName,dayOfWeek)=>({dayName,dayOfWeek,isOpen:true,persisted:true,openTime:"09:00",closeTime:"18:00",slotInterval:60,defaultCapacity:6,periods}));
const detail={status:"open",openTime:"09:00",closeTime:"18:00",reason:null,specialDayId:null,dayOfWeek:2,dayName:"週二",slots:[],slotInterval:60,defaultCapacity:6,periods,weeklyDefault:weekly[2],hoursRevision:"a".repeat(64)};
const summary=Object.fromEntries(Array.from({length:31},(_,i)=>[`2030-10-${String(i+1).padStart(2,"0")}`,{status:"open" as const,openTime:"09:00",closeTime:"18:00",slotCount:0,overrideCount:1}]));
const saved={date:"2030-10-01",day:{...detail,status:"custom",specialDayId:"special",hoursRevision:"b".repeat(64)},weekly,specials:[{id:"special",date:"2030-10-01",type:"custom",reason:null,openTime:null,closeTime:null}],summary:{...summary,"2030-10-01":{status:"custom",openTime:"09:00",closeTime:"18:00",slotCount:0,overrideCount:1}}};
let host:HTMLDivElement,root:Root;
function calendarDay(n:number){return [...host.querySelectorAll<HTMLButtonElement>('[data-schedule-calendar] button')].find(b=>b.querySelector("span")?.textContent===String(n))!;}
async function click(text:string){const b=[...host.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent?.trim()===text)!;expect(b,text).toBeTruthy();await act(async()=>b.click());}
beforeEach(async()=>{
 vi.resetAllMocks();vi.stubGlobal("fetch",m.fetch);Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});m.day.mockResolvedValue(detail);
 host=document.createElement("div");document.body.append(host);root=createRoot(host);
 await act(async()=>root.render(createElement(ScheduleManager,{storeId:"s",weeklyHours:weekly,initialSpecialDays:[],initialSummary:summary,initialYear:2030,initialMonth:10,canManage:true,isHeadquarters:false,isSpaStore:false,isCourseStore:false})));
 await act(async()=>calendarDay(1).click());await act(async()=>{host.querySelector<HTMLInputElement>('input[value="dates"]')!.click();});
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});

function pickerDay(n:number){return [...host.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find(b=>b.querySelector("span")?.textContent===String(n))!;}
it("applies selected dates with existing adjustments without a conflict-mode choice, then adopts the receipt and offers undo",async()=>{
 await act(async()=>pickerDay(2).click());
 expect(host.textContent).not.toContain("保留原設定並略過");
 expect(host.textContent).toContain("選取的日期會更新為本次設定");
 await click("檢查變更");
 expect(m.fetch).not.toHaveBeenCalled();
 expect(host.querySelector('[aria-label="儲存前確認"]')!.textContent).toContain("這 1 個日期原有的服務時間、名額與單一時段調整");
 // Static component preview only; no authenticated store data is used.
 if(process.env.HOURS_PREVIEW_PATH){host.querySelectorAll("details").forEach(d=>d.open=true);writeFileSync(process.env.HOURS_PREVIEW_PATH,host.innerHTML);}
 const result={...saved,count:1,skipped:[],operationId:"operation",summary:{...saved.summary,"2030-10-02":{status:"custom",openTime:"09:00",closeTime:"18:00",slotCount:9,overrideCount:0}}};
 m.fetch.mockResolvedValueOnce({json:async()=>({success:true,storeId:"s",data:result})});
 await click("確認並儲存");
 expect(JSON.parse(m.fetch.mock.calls[0][1].body).values).toMatchObject({mode:"dates",targetDates:["2030-10-02"],conflictMode:"replace"});
 expect(calendarDay(2).textContent).toContain("特殊時段");
 expect(m.toast).toHaveBeenCalledWith("來源日已儲存；已套用 1 個日期",expect.objectContaining({action:expect.objectContaining({label:"復原"})}));
 expect(m.day).toHaveBeenCalledTimes(1);
 expect(m.summary).not.toHaveBeenCalled();
});
it("keeps selected dates and the draft when bookings prevent replacement",async()=>{
 await act(async()=>pickerDay(2).click());await click("檢查變更");
 m.fetch.mockResolvedValueOnce({json:async()=>({success:false,error:"已有預約；本批尚未儲存"})});
 await click("確認並儲存");
 expect(pickerDay(2).getAttribute("aria-pressed")).toBe("true");
 expect(host.textContent).toContain("已有預約；本批尚未儲存");
 expect(calendarDay(2).textContent).not.toContain("特殊時段");
 expect(m.toast).not.toHaveBeenCalled();
});
