// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({move:vi.fn()}));
vi.mock("@/server/actions/course",()=>({moveCourseSessions:m.move}));
vi.mock("@/components/admin/right-sheet",()=>({RightSheet:({children}:{children:React.ReactNode})=>createElement("div",null,children)}));
vi.mock("@/components/admin/course-option-select",()=>({CourseOptionSelect:()=>null}));
import {SportsMoveConfirm} from "@/app/(dashboard)/dashboard/courses/sports-move-confirm";
it("貼上確認保留修改日期，連點只有一次交易，完成後以實際日期更新課表",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement("div");document.body.append(host);const root=createRoot(host);const onSaved=vi.fn();let resolve!:(value:{success:boolean})=>void;m.move.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 await act(async()=>root.render(createElement(SportsMoveConfirm,{clipboard:{sessionId:"source",templateId:"template",roomId:"room",coachId:"coach",durationMinutes:40,scope:"SINGLE",label:"瑜伽",startsAt:"2026-12-18T10:05:00.000Z"},seed:{date:"2026-12-20",time:"18:00",roomId:"room",coachId:"coach"},rooms:[],coaches:[],onClose:vi.fn(),onSaved})));
 const date=host.querySelector('[aria-label="調課日期"]') as HTMLInputElement;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(date,"2027-01-05");date.dispatchEvent(new Event("input",{bubbles:true}));});
 await act(async()=>{for(let i=0;i<5;i++)host.querySelector('form')!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));});
 expect(m.move).toHaveBeenCalledTimes(1);expect(m.move).toHaveBeenCalledWith(expect.objectContaining({date:"2027-01-05",durationMinutes:40,expectedStartsAt:"2026-12-18T10:05:00.000Z"}));expect(onSaved).not.toHaveBeenCalled();
 await act(async()=>resolve({success:true}));expect(onSaved).toHaveBeenCalledExactlyOnceWith("2027-01-05");await act(async()=>root.unmount());host.remove();
});
