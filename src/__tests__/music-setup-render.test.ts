// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {writeFileSync} from "node:fs";
vi.mock("next/navigation",()=>({usePathname:()=>"/dashboard",useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/components/dashboard-link",()=>({DashboardLink:({children,...props}:Record<string,unknown>)=>createElement("a",props,children as never)}));
vi.mock("@/server/actions/course-setup",()=>({saveCourseSetupReminder:async()=>({success:true})}));
import {CourseSetupGuide} from "@/components/admin/course-setup-guide";
import {courseSetupSteps} from "@/lib/course-setup-progress";
import styles from "@/components/admin/right-sheet.module.css";
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
const host=document.createElement("main");document.body.append(host);const root=createRoot(host);
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it("shows the actual six setup actions with store hours first and teachers in music",async()=>{
 await act(async()=>root.render(createElement(CourseSetupGuide,{steps:courseSetupSteps({openDays:0,coaches:0,rooms:0,templates:0,plans:0,sessions:0,qualifiedCoaches:0},true),preference:{mode:"show"},login:"fixture"})));
 expect(host.textContent).toContain("下一步：設定營業時間與公休");
 const button=[...host.querySelectorAll("button")].find(b=>b.textContent?.includes("查看全部步驟"))!;
 await act(async()=>button.click());
 expect(host.querySelectorAll("ol > li")).toHaveLength(6);
 expect(host.querySelector("ol a")?.getAttribute("href")).toBe("/dashboard/courses/hours");
 expect(host.textContent).toContain("新增教師與授課課程");expect(host.textContent).not.toContain("教練");
 if(process.env.MUSIC_SETUP_RENDER_FILE)writeFileSync(process.env.MUSIC_SETUP_RENDER_FILE,JSON.stringify({html:host.innerHTML,styles}));
 const close=[...host.querySelectorAll("button")].find(b=>b.textContent==="關閉")!;
 await act(async()=>close.click());expect(host.querySelector('[role="dialog"]')).toBeNull();
});
