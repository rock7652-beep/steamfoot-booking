// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({load:vi.fn(),save:vi.fn(),close:vi.fn()}));
vi.mock("@/server/actions/course-teacher-session",()=>({loadCourseTeacherSession:m.load,changeCourseTeacherSession:m.save}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
import {CourseTeacherSessionDialog} from "@/components/course-teacher-session-dialog";
let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.resetAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);m.load.mockResolvedValue({success:true,data:{name:"吉他課",startsAt:"2099-10-15T02:00:00Z",endsAt:"2099-10-15T03:00:00Z",room:"教室",revision:"a".repeat(64),students:[{id:"b",name:"學員甲"},{id:"c",name:"學員乙"}],waiting:[{id:"w",name:"候補甲"}]}});});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function render(mode:"leave"|"reschedule"="leave"){await act(async()=>root.render(createElement(CourseTeacherSessionDialog,{sessionId:"s",mode,name:"吉他課",close:m.close})));}
function button(label:string){return Array.from(document.querySelectorAll("button")).find(b=>b.textContent===label)!;}
it("shows affected class and waiting students before permitting whole-class leave",async()=>{await render();expect(document.body.textContent).toContain("影響 2 位學員・僅這一堂");expect(document.body.textContent).toContain("學員甲");expect(document.body.textContent).toContain("候補甲");expect(document.body.textContent).toContain("將取消候補");expect(button("確認整堂停課").disabled).toBe(true);expect(m.save).not.toHaveBeenCalled();});
it("keeps rescheduling in the same dialog with separate date/time and unchanged-class explanation",async()=>{await render("reschedule");expect(document.querySelector('[aria-label="新日期"]')).not.toBeNull();expect(document.querySelector('[aria-label="新時間"]')).not.toBeNull();expect(button("確認整堂調課").disabled).toBe(true);expect(document.body.textContent).toContain("隨課程改時間");await act(async()=>button("返回").click());expect(m.close).toHaveBeenCalledTimes(1);});
it("displays read denial and never enables mutation on a missing/revoked grant",async()=>{m.load.mockResolvedValue({success:false,error:"尚未授權此授課操作"});await render();expect(document.querySelector('[role="alert"]')?.textContent).toBe("尚未授權此授課操作");expect(button("確認整堂停課").disabled).toBe(true);});
