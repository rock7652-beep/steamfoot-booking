// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({pathname:"/hq/dashboard/courses",search:"view=rooms&action=create&setupStep=room",refresh:vi.fn(),push:vi.fn()}));
vi.mock("next/navigation",()=>({usePathname:()=>m.pathname,useSearchParams:()=>new URLSearchParams(m.search),useRouter:()=>({refresh:m.refresh,push:m.push})}));
vi.mock("@/components/dashboard-link",()=>({DashboardLink:({children,...props}:Record<string,unknown>)=>createElement("a",props,children as never),resolveDashboardHref:(href:string)=>href}));
vi.mock("@/server/actions/course-setup",()=>({saveCourseSetupReminder:async()=>({success:true})}));
vi.mock("sonner",()=>({toast:{success:vi.fn()}}));
import {CourseSetupGuide} from "@/components/admin/course-setup-guide";
import {CourseSetupStepBadge} from "@/components/admin/course-setup-step-badge";
import {courseSetupSteps} from "@/lib/course-setup-progress";
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{host=document.createElement("div");document.body.append(host);root=createRoot(host);m.pathname="/hq/dashboard/courses";m.search="view=rooms&action=create&setupStep=room";});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const counts={openDays:1,rooms:0,subjects:0,templates:0,plans:0,coaches:0,qualifiedCoaches:0,sessions:0};
it("shows the step inside matching forms and ignores stale route markers",async()=>{
 const routes=[ ["hours","/hq/dashboard/courses/hours",""], ["room","/hq/dashboard/courses","view=rooms&"], ["course","/hq/dashboard/courses","view=catalog&"], ["plan","/hq/dashboard/courses","view=plans&"], ["coach","/hq/dashboard/teachers",""], ["schedule","/hq/dashboard/courses",""] ] as const;
 for(const [index,[step,path,query]] of routes.entries()) {
  m.pathname=path;m.search=`${query}setupStep=${step}`;
  await act(async()=>root.render(createElement(CourseSetupStepBadge,{step})));
  expect(host.textContent).toBe(`第 ${index+1}/6 步`);
 }
 m.pathname="/hq/dashboard/courses";m.search="view=plans&setupStep=course";
 await act(async()=>root.render(createElement(CourseSetupStepBadge,{step:"course"})));expect(host.textContent).toBe("");
});
it("keeps a guide step visible after save and continues to the next form",async()=>{
 const render=async(rooms:number)=>act(async()=>root.render(createElement(CourseSetupGuide,{steps:courseSetupSteps({...counts,rooms},true),preference:{mode:"never"},login:"test"})));
 await render(0);expect(host.textContent).toContain("第 2/6 步 · 新增空間");
 await render(1);expect(host.textContent).toContain("第 2/6 步 · 新增空間 · 已完成");
 const link=host.querySelector<HTMLAnchorElement>('a[href*="view=catalog"]')!;
 expect(link.textContent).toContain("繼續下一步");expect(link.href).toContain("action=create&setupStep=course");
 m.search="view=catalog&action=create&setupStep=course";await render(1);
 expect(host.textContent).toContain("第 3/6 步 · 建立教學項目");
 m.search="view=plans";await render(1);expect(host.querySelector('[aria-label="開始設定"]')).toBeNull();
});
it("completion hides details by default and offers the actual session roster",async()=>{
 await act(async()=>root.render(createElement(CourseSetupGuide,{steps:courseSetupSteps({...counts,rooms:1,subjects:1,templates:1,plans:1,coaches:1,qualifiedCoaches:1,sessions:1},true),preference:{mode:"show"},login:"test",manual:true,studentHref:"/dashboard/courses?date=2026-10-10&session=synthetic"})));
 await act(async()=>host.querySelector("button")!.click());
 const details=host.querySelector("details")!;expect(details.open).toBe(false);
 expect(host.querySelector('a[href*="session=synthetic"]')?.textContent).toContain("加入學員");
 expect(host.textContent).not.toContain("不再提醒");
 await act(async()=>host.querySelector("summary")!.click());expect(details.open).toBe(true);expect(details.querySelectorAll("ol > li")).toHaveLength(6);
});
