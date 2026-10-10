// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({fetch:vi.fn(),day:vi.fn(),summary:vi.fn(),specials:vi.fn()}));
vi.mock("next/navigation",()=>({usePathname:()=>"/s/a/admin/dashboard/courses/hours"}));
vi.mock("sonner",()=>({toast:{success:vi.fn(),error:vi.fn()}}));
vi.mock("@/app/(dashboard)/dashboard/courses/hours/weekly-hours-editor",()=>({CourseWeeklyHoursEditor:()=>null}));
vi.mock("@/server/actions/course-business-hours",()=>({getCourseDayHours:m.day,getCourseMonthScheduleSummary:m.summary,getCourseMonthSpecialDays:m.specials,saveCourseDayHours:vi.fn()}));
vi.mock("@/server/actions/business-hours",()=>Object.fromEntries(["updateBusinessHours","addSpecialDay","removeSpecialDayByDate","getMonthSpecialDays","getMonthScheduleSummary","getDaySlotDetails","copySettingsToFutureWeeks","copySettingsToDates","undoCopySettingsToDates","toggleSlotOverride","overrideSlotCapacity","applyWeeklyTemplate","syncFromHeadquarters"].map(key=>[key,vi.fn()])));
import {ScheduleManager} from "@/app/(dashboard)/dashboard/settings/hours/schedule-manager";
const periods=[{openTime:"09:00",closeTime:"18:00",slotInterval:30,defaultCapacity:6}];
const weekly=["週日","週一","週二","週三","週四","週五","週六"].map((dayName,dayOfWeek)=>({dayName,dayOfWeek,isOpen:true,persisted:true,openTime:"09:00",closeTime:"18:00",slotInterval:30,defaultCapacity:6,periods}));
const detail={status:"open",openTime:"09:00",closeTime:"18:00",reason:null,specialDayId:null,dayOfWeek:2,dayName:"週二",slots:[],slotInterval:30,defaultCapacity:6,periods,weeklyDefault:weekly[2],hoursRevision:"a".repeat(64)};
const summary=Object.fromEntries(Array.from({length:31},(_,i)=>[`2030-10-${String(i+1).padStart(2,"0")}`,{status:"open" as const,openTime:"09:00",closeTime:"18:00",slotCount:0,overrideCount:0}]));
const saved={date:"2030-10-01",day:{...detail,status:"closed",periods:[],specialDayId:"special",hoursRevision:"b".repeat(64)},weekly,specials:[{id:"special",date:"2030-10-01",type:"closed",reason:null,openTime:null,closeTime:null}],summary:{...summary,"2030-10-01":{status:"closed",openTime:"09:00",closeTime:"18:00",slotCount:0,overrideCount:0}}};
let host:HTMLDivElement,root:Root;
function calendarDay(n:number){return [...host.querySelectorAll<HTMLButtonElement>('[data-schedule-calendar] button')].find(b=>b.querySelector("span")?.textContent===String(n))!;}
async function click(text:string){const b=[...host.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent?.trim()===text)!;expect(b,text).toBeTruthy();await act(async()=>b.click());}
beforeEach(async()=>{
 vi.resetAllMocks();vi.stubGlobal("fetch",m.fetch);Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});m.day.mockResolvedValue(detail);
 host=document.createElement("div");document.body.append(host);root=createRoot(host);
 await act(async()=>root.render(createElement(ScheduleManager,{storeId:"s",weeklyHours:weekly,initialSpecialDays:[],initialSummary:summary,initialYear:2030,initialMonth:10,canManage:true,isHeadquarters:false,isSpaStore:false,isCourseStore:true})));
 await act(async()=>calendarDay(1).click());await click("全天休息");await click("檢查變更");
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
it("updates the day and calendar from the authoritative receipt without rereading the month or day",async()=>{
 let finish!:(r:unknown)=>void;m.fetch.mockReturnValue(new Promise(r=>{finish=r;}));const b=[...host.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent?.trim()==="確認並儲存")!;
 await act(async()=>{b.click();b.click();});expect(m.fetch).toHaveBeenCalledTimes(1);expect(calendarDay(2).disabled).toBe(true);
 await act(async()=>finish({json:async()=>({success:true,storeId:"s",data:saved})}));
 expect(calendarDay(1).textContent).toContain("休");expect(calendarDay(2).disabled).toBe(false);expect(m.day).toHaveBeenCalledTimes(1);expect(m.summary).not.toHaveBeenCalled();expect(m.specials).not.toHaveBeenCalled();expect(host.textContent).not.toContain("尚未儲存");
});
it("keeps the edited date locked and retries the identical batch after a lost reply",async()=>{
 m.fetch.mockRejectedValueOnce(new Error("lost reply"));await click("確認並儲存");expect(calendarDay(2).disabled).toBe(true);
 expect(host.querySelector<HTMLFieldSetElement>('[data-schedule-day] fieldset')!.disabled).toBe(true);
 m.fetch.mockResolvedValueOnce({json:async()=>({success:true,storeId:"s",data:saved})});await click("重試確認儲存結果");
 expect(m.fetch.mock.calls[1][1].body).toBe(m.fetch.mock.calls[0][1].body);expect(m.fetch.mock.calls[0][0]).toBe("/s/a/admin/dashboard/settings-save/course/day-hours");expect(calendarDay(1).textContent).toContain("休");
});
it("retains a rejected closure draft and allows an explicit revision reread without losing edits",async()=>{
 m.fetch.mockResolvedValueOnce({json:async()=>({success:false,error:"課程衝突"})});await click("確認並儲存");
 expect(host.querySelector('[role="alert"]')!.textContent).toBe("課程衝突");expect(calendarDay(1).textContent).not.toContain("休");expect(host.textContent).toContain("尚未儲存");
 m.day.mockResolvedValueOnce({...detail,hoursRevision:"c".repeat(64)});await click("重新核對日期");expect(host.textContent).toContain("尚未儲存");
 m.fetch.mockResolvedValueOnce({json:async()=>({success:true,storeId:"s",data:saved})});await click("確認並儲存");expect(JSON.parse(m.fetch.mock.calls[1][1].body).expectedRevision).toBe("c".repeat(64));
});
