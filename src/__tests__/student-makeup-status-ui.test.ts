// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {beforeEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({read:vi.fn(),invalidate:vi.fn(),create:vi.fn(),refresh:vi.fn()}));
vi.mock("next/navigation",()=>({useSearchParams:()=>new URLSearchParams(),useRouter:()=>({refresh:m.refresh})}));
vi.mock("@/server/actions/music-student-makeups",()=>({loadMusicStudentMakeups:vi.fn()}));
vi.mock("@/server/actions/course-members",()=>({createCourseBooking:m.create}));
vi.mock("@/components/operations/panel-read-cache",()=>{const reader={read:m.read,invalidate:m.invalidate};return {usePanelReader:()=>reader};});
vi.mock("@/components/admin/modal-panel",()=>({ModalPanel:({open,children}:{open:boolean;children:React.ReactNode})=>open?createElement("div",{role:"dialog"},children):null}));
import {StudentMakeupStatus} from "@/app/(dashboard)/dashboard/courses/student-makeup-status";
const row={id:"original-leave",customerId:"student",customerName:"測試學員",name:"吉他",date:"2026-10-01T10:00:00Z",state:"待安排",issue:null,cardId:"ordinary",separate:false,booking:null,sessions:[{id:"target-session",date:"2026-10-20T10:00:00Z",name:"吉他"}]};
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});m.read.mockResolvedValue({success:true,data:{customerName:"測試學員",canArrange:true,rows:[row],truncated:false}});m.create.mockResolvedValue({success:true});});
it("shows the person's pending count in the roster, then arranges against the original leave",async()=>{
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(createElement(StudentMakeupStatus,{customerId:"student",compact:true})));
 expect(host.textContent).toBe("待補課 1 堂");expect(m.read).toHaveBeenCalledWith("student","operational");
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
 try{await act(async()=>root.render(createElement(StudentMakeupStatus,{customerId:"student"})));expect(host.textContent).toContain("已安排 1 堂・2026-10-20 18:00");expect(host.textContent).toContain("2026-10-01");expect(host.textContent).toContain("2026-10-20");expect([...host.querySelectorAll("button")].some(b=>b.textContent==="安排補課")).toBe(false);}finally{await act(async()=>root.unmount());host.remove();}
});

it("counts a second leave on a makeup once, without counting its historical source again",async()=>{
 m.read.mockResolvedValue({success:true,data:{customerName:"測試學員",canArrange:true,rows:[{...row,state:"補課再次請假"},{...row,id:"makeup-leave",state:"待安排"}]}});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(createElement(StudentMakeupStatus,{customerId:"student",compact:true})));expect(host.textContent).toBe("待補課 1 堂");}finally{await act(async()=>root.unmount());host.remove();}
});

it("shows scheduled dates in Taipei time in the roster without opening details",async()=>{
 m.read.mockResolvedValue({success:true,data:{customerName:"測試學員",canArrange:true,rows:[{...row,state:"已安排",booking:{date:"2026-10-22T10:00:00Z"}},{...row,id:"earlier",state:"已安排",booking:{date:"2026-10-20T16:30:00Z"}},{...row,id:"pending"}]}});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(createElement(StudentMakeupStatus,{customerId:"student",compact:true})));expect(host.textContent).toBe("待補課 1 堂・已安排 2 堂・最早 2026-10-21 00:30");expect(m.create).not.toHaveBeenCalled();}finally{await act(async()=>root.unmount());host.remove();}
});
it("uses the same completed label in both views without offering another makeup",async()=>{
 m.read.mockResolvedValue({success:true,data:{customerName:"測試學員",canArrange:true,rows:[{...row,state:"已補課",booking:{date:"2026-10-20T10:00:00Z"}}]}});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(createElement(StudentMakeupStatus,{customerId:"student",compact:true})));expect(host.textContent).toBe("已補課 1 堂");await act(async()=>root.render(createElement(StudentMakeupStatus,{customerId:"student"})));expect(host.textContent).toContain("已補課 1 堂");expect(host.textContent).toContain("2026-10-20 18:00");expect([...host.querySelectorAll("button")].some(b=>b.textContent==="安排補課")).toBe(false);expect(m.create).not.toHaveBeenCalled();}finally{await act(async()=>root.unmount());host.remove();}
});
