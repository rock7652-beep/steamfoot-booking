// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn(), saved: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock("@/server/actions/course-business-hours", () => ({ saveCourseWeeklyHours: m.save }));
import { CourseWeeklyHoursEditor } from "@/app/(dashboard)/dashboard/courses/hours/weekly-hours-editor";
let root: Root, host: HTMLDivElement;
const days = ["週日","週一","週二","週三","週四","週五","週六"].map((dayName, dayOfWeek) => ({ dayName, dayOfWeek, isOpen: true, periods: [{openTime:"09:00",closeTime:"18:00"}], openTime:"09:00",closeTime:"18:00" }));
beforeEach(async () => { vi.resetAllMocks(); Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT:true}); m.save.mockResolvedValue({success:true}); host=document.createElement("div"); document.body.append(host); root=createRoot(host); await act(async () => root.render(createElement(CourseWeeklyHoursEditor, {initial:days, canManage:true, onSaved:m.saved}))); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function input(label: string, value: string) { const el = host.querySelector(`input[aria-label="${label}"]`)!; await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(el,value); el.dispatchEvent(new Event("input",{bubbles:true})); }); }
async function click(text: string) { const b=[...host.querySelectorAll("button")].find(b=>b.textContent===text)!; expect(b).toBeTruthy(); await act(async()=>b.click()); }
async function submit() { await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))); }
it("copies a day to selected weekdays and saves all changed days once", async()=>{
 await input("週一第1段開始","10:00");
 const label=[...host.querySelectorAll("fieldset:last-of-type label")].find(l=>l.textContent==="週二")!;
 await act(async()=>label.querySelector("input")!.click()); await click("套用至勾選日");
 expect((host.querySelector('input[aria-label="週二第1段開始"]') as HTMLInputElement).value).toBe("10:00"); await submit();
 expect(m.save).toHaveBeenCalledExactlyOnceWith([1,2].map(dayOfWeek=>({dayOfWeek,isOpen:true,periods:[{openTime:"10:00",closeTime:"18:00"}]}))); expect(m.saved).toHaveBeenCalledOnce();
});
it("saves all missing weekdays on first setup without forcing edits", async()=>{
 await act(async()=>root.render(createElement(CourseWeeklyHoursEditor,{key:"blank",initial:days.map(day=>({...day,persisted:false})),canManage:true,onSaved:m.saved})));
 expect(host.textContent).toContain("7 天尚未儲存");
 await click("還原修改"); expect(host.querySelectorAll('input[aria-label$="段開始"]')).toHaveLength(7);
 await click("儲存每週設定");
 expect(m.save).toHaveBeenCalledExactlyOnceWith(days.map(({dayOfWeek,isOpen,periods})=>({dayOfWeek,isOpen,periods})));
 expect(host.textContent).toContain("尚未變更");
});
it("persists missing weekdays alongside a newly selected public holiday",async()=>{
 await act(async()=>root.render(createElement(CourseWeeklyHoursEditor,{key:"partial",initial:days.map(day=>({...day,persisted:day.dayOfWeek===0})),canManage:true,onSaved:m.saved})));
 await act(async()=>host.querySelector('fieldset input[type="checkbox"]')!.dispatchEvent(new MouseEvent("click",{bubbles:true})));
 await submit();
 expect(m.save.mock.calls[0][0]).toHaveLength(7);
 expect(m.save.mock.calls[0][0][0].isOpen).toBe(false);
});
it("retains all edits after a conflict, supports restore and prevents double save", async()=>{
 await input("週一第1段開始","11:00"); m.save.mockResolvedValueOnce({success:false,error:"課程衝突"}); await submit(); expect(host.textContent).toContain("課程衝突"); expect(m.saved).not.toHaveBeenCalled();
 let finish!: (result:unknown)=>void; m.save.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;})); await submit(); await submit(); expect(m.save).toHaveBeenCalledTimes(2); await act(async()=>finish({success:false,error:"重試"}));
 await click("還原修改"); expect((host.querySelector('input[aria-label="週一第1段開始"]') as HTMLInputElement).value).toBe("09:00");
});
it("keeps multi-period drafts and closure in the same save", async()=>{
 const first=host.querySelector("fieldset")!; await act(async()=>first.querySelector('input[type="checkbox"]')!.dispatchEvent(new MouseEvent("click",{bubbles:true})));
 await click("＋ 時段"); expect(host.querySelector('input[aria-label="週一第2段開始"]')).not.toBeNull(); await input("週一第2段開始","18:00"); await submit(); expect(m.save.mock.calls[0][0]).toHaveLength(2);
});
