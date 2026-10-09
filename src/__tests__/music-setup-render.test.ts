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
 // Keep the same mounted guide, as the persistent dashboard layout does.
 // New server data must advance the next action without reopening the panel.
 const counts={openDays:0,coaches:0,rooms:0,templates:0,plans:0,sessions:0,qualifiedCoaches:0};
 const transitions=[
  {change:{openDays:1},label:"新增空間"},
  {change:{rooms:1},label:"建立教學項目"},
  {change:{templates:1},label:"設定班型與學費"},
  {change:{plans:1},label:"新增教師與授課課程"},
  {change:{coaches:1,qualifiedCoaches:1},label:"排第一堂課"},
 ];
 for(const [index,transition] of transitions.entries()) {
  Object.assign(counts,transition.change);
  await act(async()=>root.render(createElement(CourseSetupGuide,{steps:courseSetupSteps(counts,true),preference:{mode:"show"},login:"fixture"})));
  expect(host.textContent).toContain(`已完成 ${index+1}/6`);
  expect(host.textContent).toContain(`下一步：${transition.label}`);
 }
 counts.sessions=1;
 await act(async()=>root.render(createElement(CourseSetupGuide,{steps:courseSetupSteps(counts,true),preference:{mode:"show"},login:"fixture"})));
 expect(host.querySelector('[aria-label="開始設定"]')).toBeNull();
 await act(async()=>root.render(createElement(CourseSetupGuide,{steps:courseSetupSteps(counts,true),preference:{mode:"show"},login:"fixture",manual:true})));
 const reopen=[...host.querySelectorAll("button")].find(b=>b.textContent?.includes("設定完成 · 6/6"))!;
 await act(async()=>reopen.click());
 expect([...host.querySelectorAll<HTMLAnchorElement>("ol a")].every(a=>!a.href.includes("action="))).toBe(true);
 expect(host.querySelectorAll("ol > li")).toHaveLength(6);
 expect(host.textContent).toContain("設定完成，可以開始上課了");
 expect(host.textContent).not.toContain("稍後設定");
 expect(host.textContent).not.toContain("不再提醒");
 expect(host.querySelector('a[href="/dashboard/courses"]')?.textContent).toContain("查看課表");
 await act(async()=>root.render(createElement(CourseSetupGuide,{key:"new-store",steps:courseSetupSteps(counts,true),preference:{mode:"show"},login:"fixture"})));
 counts.rooms=0;
 await act(async()=>root.render(createElement(CourseSetupGuide,{key:"new-store",steps:courseSetupSteps(counts,true),preference:{mode:"show"},login:"fixture"})));
 expect(host.textContent).toContain("已完成 5/6");
 expect(host.textContent).toContain("下一步：新增空間");
 counts.rooms=1;counts.qualifiedCoaches=0;
 await act(async()=>root.render(createElement(CourseSetupGuide,{key:"new-store",steps:courseSetupSteps(counts,true),preference:{mode:"show"},login:"fixture"})));
 expect(host.textContent).toContain("下一步：設定教師授課資格");
 const dismiss=[...host.querySelectorAll("button")].find(b=>b.textContent==="不再提醒")!;
 await act(async()=>dismiss.click());
 expect(host.querySelector('[aria-label="開始設定"]')).toBeNull();
 counts.rooms=0;
 await act(async()=>root.render(createElement(CourseSetupGuide,{key:"new-store",steps:courseSetupSteps(counts,true),preference:{mode:"show"},login:"fixture"})));
 expect(host.querySelector('[aria-label="開始設定"]')).toBeNull();
});
