// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({move:vi.fn(),read:vi.fn()}));
vi.mock("@/server/actions/course",()=>({moveCourseSessions:m.move,readSportsMoveResult:m.read}));
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

it("撞課時保留日期與剪下內容，顯示修改方式，不呼叫成功回傳",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host),saved=vi.fn(),close=vi.fn();m.move.mockResolvedValue({success:false,error:"教練同時段已有課程"});
 await act(async()=>root.render(createElement(SportsMoveConfirm,{clipboard:{sessionId:"source",templateId:"t",roomId:"r",coachId:"c",durationMinutes:45,scope:"SINGLE",label:"保留這堂課",startsAt:"2026-12-18T10:05:00.000Z"},seed:{date:"2027-01-05",time:"18:00",roomId:"r",coachId:"c"},rooms:[],coaches:[],onClose:close,onSaved:saved})));
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
 expect(host.querySelector('[role="alert"]')?.textContent).toContain("這個時段無法貼上");expect(host.textContent).toContain("請調整時間、空間或教練");expect((host.querySelector('[aria-label="調課日期"]') as HTMLInputElement).value).toBe("2027-01-05");expect(host.textContent).toContain("保留這堂課");expect(saved).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
 await act(async()=>root.unmount());host.remove();
});

it("網路結果不明時鎖住重送，只讀核對已完成的貼上",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host),saved=vi.fn();m.move.mockReset();m.move.mockRejectedValue(new Error("offline"));m.read.mockResolvedValue({success:true,data:{startsAt:"2027-01-05T10:00:00.000Z",endsAt:"2027-01-05T10:45:00.000Z",roomId:"r",coachId:"c"}});
 await act(async()=>root.render(createElement(SportsMoveConfirm,{clipboard:{sessionId:"s",templateId:"t",roomId:"r",coachId:"c",durationMinutes:45,scope:"SINGLE",label:"課程",startsAt:"2026-12-18T10:05:00.000Z"},seed:{date:"2027-01-05",time:"18:00",roomId:"r",coachId:"c"},rooms:[],coaches:[],onClose:vi.fn(),onSaved:saved})));
 const submit=()=>host.querySelector('form')!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));await act(async()=>{submit();});expect(host.textContent).toContain("貼上結果待核對");await act(async()=>{submit();});expect(m.move).toHaveBeenCalledTimes(1);
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==="核對貼上結果")!.click());expect(m.read).toHaveBeenCalledExactlyOnceWith("s");expect(saved).toHaveBeenCalledExactlyOnceWith("2027-01-05");expect(m.move).toHaveBeenCalledTimes(1);await act(async()=>root.unmount());host.remove();
});
