// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MusicScheduleList } from "@/app/(dashboard)/dashboard/courses/music-schedule-list";
let root: Root, element: HTMLDivElement;
beforeEach(() => { Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});element=document.createElement("div");document.body.append(element);root=createRoot(element); });
afterEach(async()=>{await act(async()=>root.unmount());element.remove();});
const session={id:"s",nameSnapshot:"吉他個別課",startsAt:"2026-10-16T01:00:00Z",endsAt:"2026-10-16T02:00:00Z",coachId:"t",roomId:"r",bookings:[{customerId:"a",customerName:"學員",status:"RESERVED",bookingKind:"MEMBER"}]};
it("keeps each header over its data and opens the correct class from the menu",async()=>{
 const onOpen=vi.fn(),onEdit=vi.fn();
 await act(async()=>root.render(createElement(MusicScheduleList,{sessions:[session],coaches:[{id:"t",displayName:"老師"}],rooms:[{id:"r",name:"教室一"}],nowIso:"2026-10-16T03:00:00Z",canCreate:true,canEdit:true,onOpen,onEdit,onBook:vi.fn()})));
 expect([...element.querySelectorAll("th")].map(x=>x.textContent)).toEqual(["日期","時間","課程","教師","教室","人數","狀態","操作"]);
 const cells=element.querySelectorAll("tbody td");expect(cells).toHaveLength(8);expect(cells[3].textContent).toBe("老師");expect(cells[5].textContent).toBe("1");expect(cells[6].textContent).toContain("待點名 1");
 await act(async()=>element.querySelector<HTMLButtonElement>('button[aria-expanded]')!.click());
 await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==="編輯排課")!.click());
 expect(onEdit).toHaveBeenCalledWith("s");expect(onOpen).not.toHaveBeenCalled();
});
it("does not expose write actions to read-only staff",async()=>{
 await act(async()=>root.render(createElement(MusicScheduleList,{sessions:[session],coaches:[],rooms:[],nowIso:session.startsAt,canCreate:false,canEdit:false,onOpen:vi.fn(),onEdit:vi.fn(),onBook:vi.fn()})));
 await act(async()=>element.querySelector<HTMLButtonElement>('button[aria-expanded]')!.click());
 expect(document.body.textContent).not.toContain("編輯排課");expect(document.body.textContent).not.toContain("新增預約");expect(document.body.textContent).toContain("名單／點名");
});
