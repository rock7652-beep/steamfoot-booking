// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {beforeEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({read:vi.fn(),invalidate:vi.fn(),create:vi.fn(),createNew:vi.fn(),options:vi.fn(),refresh:vi.fn()}));
vi.mock("next/navigation",()=>({useSearchParams:()=>new URLSearchParams(),useRouter:()=>({refresh:m.refresh})}));
vi.mock("@/server/actions/music-student-makeups",()=>({loadMusicStudentMakeups:vi.fn(),loadMusicMakeupScheduleOptions:vi.fn(),createMusicStudentMakeupSchedule:m.createNew}));
vi.mock("@/server/actions/course-members",()=>({createCourseBooking:m.create}));
vi.mock("@/components/operations/panel-read-cache",()=>{const reader={read:m.read,invalidate:m.invalidate},options={read:m.options,invalidate:m.invalidate};return {usePanelReader:(key:string)=>key==="music-student-makeups"?reader:options};});
vi.mock("@/components/admin/modal-panel",()=>({ModalPanel:({open,children}:{open:boolean;children:React.ReactNode})=>open?createElement("div",{role:"dialog"},children):null}));
import {StudentMakeupStatus} from "@/app/(dashboard)/dashboard/courses/student-makeup-status";
const row={id:"original-leave",customerId:"student",customerName:"測試學員",name:"吉他",date:"2026-10-01T10:00:00Z",state:"待安排",issue:null,cardId:"ordinary",separate:false,booking:null,sessions:[{id:"target-session",date:"2026-10-20T10:00:00Z",name:"吉他"}]};
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});m.read.mockResolvedValue({success:true,data:{customerName:"測試學員",canArrange:true,rows:[row],truncated:false}});m.create.mockResolvedValue({success:true});});
it("shows the person's pending count in the roster, then arranges against the original leave",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(createElement(StudentMakeupStatus,{customerId:"student",compact:true})));
 expect(host.textContent).toBe("待補 1");expect(m.read).toHaveBeenCalledWith("student","operational");
 await act(async()=>host.querySelector("button")!.click());expect(host.textContent).toContain("測試學員・請假與補課");
 await act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="安排補課")!.click());
 await act(async()=>{const select=host.querySelector("select")!;select.value="target-session";select.dispatchEvent(new Event("change",{bubbles:true}));});
 await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
 expect(m.create).toHaveBeenCalledWith({sessionId:"target-session",customerId:"student",cardId:"ordinary",makeupForBookingId:"original-leave",requestKey:expect.any(String)});
 expect(m.refresh).toHaveBeenCalled();
 }finally{await act(async()=>root.unmount());host.remove();}
});
it("shows the original and makeup dates directly on basic information",async()=>{
 m.read.mockResolvedValue({success:true,data:{customerName:"測試學員",canArrange:false,rows:[{...row,state:"已安排",booking:{date:"2026-10-20T10:00:00Z"}}]}});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(createElement(StudentMakeupStatus,{customerId:"student"})));expect(host.textContent).toContain("已排補 1");expect(host.textContent).not.toContain("2026-10-20");await act(async()=>host.querySelector("button")!.click());expect(host.textContent).toContain("2026-10-01");expect(host.textContent).toContain("2026-10-20");expect([...host.querySelectorAll("button")].some(b=>b.textContent==="安排補課")).toBe(false);}finally{await act(async()=>root.unmount());host.remove();}
});

it("counts a second leave on a makeup once, without counting its historical source again",async()=>{
 m.read.mockResolvedValue({success:true,data:{customerName:"測試學員",canArrange:true,rows:[{...row,state:"補課再次請假"},{...row,id:"makeup-leave",state:"待安排"}]}});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(createElement(StudentMakeupStatus,{customerId:"student",compact:true})));expect(host.textContent).toBe("待補 1");}finally{await act(async()=>root.unmount());host.remove();}
});

it("keeps dates out of the roster and shows them in personal details",async()=>{
 m.read.mockResolvedValue({success:true,data:{customerName:"測試學員",canArrange:true,rows:[{...row,state:"已安排",booking:{date:"2026-10-22T10:00:00Z"}},{...row,id:"earlier",state:"已安排",booking:{date:"2026-10-20T16:30:00Z"}},{...row,id:"pending"}]}});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(createElement(StudentMakeupStatus,{customerId:"student",compact:true})));expect(host.textContent).toBe("待補 1・已排補 2");await act(async()=>host.querySelector("button")!.click());expect(host.textContent).toContain("2026-10-21 00:30");expect(m.create).not.toHaveBeenCalled();}finally{await act(async()=>root.unmount());host.remove();}
});
it("hides completed badges but keeps completed history in the personal view",async()=>{
 m.read.mockResolvedValue({success:true,data:{customerName:"測試學員",canArrange:true,rows:[{...row,state:"已補課",booking:{date:"2026-10-20T10:00:00Z"}}]}});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(createElement(StudentMakeupStatus,{customerId:"student",compact:true})));expect(host.textContent).toBe("");await act(async()=>root.render(createElement(StudentMakeupStatus,{customerId:"student"})));expect(host.textContent).toContain("歷史紀錄");await act(async()=>host.querySelector("button")!.click());expect(host.textContent).toContain("2026-10-20 18:00");expect([...host.querySelectorAll("button")].some(b=>b.textContent==="安排補課")).toBe(false);expect(m.create).not.toHaveBeenCalled();}finally{await act(async()=>root.unmount());host.remove();}
});
it("creates a makeup time without leaving the learner and preserves the source on retry",async()=>{
 m.options.mockResolvedValue({success:true,data:{name:"吉他",durationMinutes:50,rooms:[{id:"r",name:"01"}],teachers:[{id:"t",displayName:"教師"}]}});m.createNew.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({success:true});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 const click=async(text:string)=>act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent===text)!.click());
 try{await act(async()=>root.render(createElement(StudentMakeupStatus,{customerId:"student",compact:true})));await click("待補 1");await click("安排補課");await click("新增補課時段");
 await act(async()=>{for(const [label,value] of [["補課日期","2099-10-20"],["補課時間","18:00"],["補課教師","t"],["補課教室","r"]]){const el=host.querySelector(`[aria-label="${label}"]`)!;const proto=el.tagName==="SELECT"?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,"value")!.set!.call(el,value);el.dispatchEvent(new Event(el.tagName==="SELECT"?"change":"input",{bubbles:true}));}});
 await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
 expect(m.createNew).toHaveBeenCalledWith(expect.objectContaining({sourceId:"original-leave",customerId:"student",date:"2099-10-20",time:"18:00",coachId:"t",roomId:"r"}));expect(host.textContent).toContain("結果尚未確認");expect(host.querySelector<HTMLInputElement>('[aria-label="補課日期"]')!.disabled).toBe(true);
 await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
 expect(m.createNew.mock.calls[0][0]).toEqual(m.createNew.mock.calls[1][0]);expect(m.create).not.toHaveBeenCalled();expect(m.refresh).toHaveBeenCalled();
 }finally{await act(async()=>root.unmount());host.remove();}
});
