// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {ExclusiveMenu} from "@/components/admin/exclusive-menu";
import {CourseStatusButton} from "@/components/admin/course-status-button";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/server/actions/course-batch",()=>({courseStatusImpact:vi.fn(async()=>({success:true,count:0})),applyCourseBatchStatus:vi.fn(async()=>({success:true}))}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it("retains a status confirmation when outside pointer closes its parent menu",async()=>{
 const menuProps={label:"方案操作",triggerText:"⋯",quiet:true,children:React.createElement(CourseStatusButton,{quiet:true,kind:"plan",id:"p",active:true,onApplied:()=>{}})};
 await act(async()=>root.render(React.createElement(ExclusiveMenu,menuProps)));
 await act(async()=>host.querySelector("button")!.click());
 await act(async()=>Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="下架")!.click());
 expect(document.querySelector('[role="dialog"]')).not.toBeNull();
 await act(async()=>document.body.dispatchEvent(new Event("pointerdown",{bubbles:true})));
 expect(document.querySelector('[role="dialog"]')).not.toBeNull();
 await act(async()=>Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="取消")!.click());
 expect(document.querySelector('[role="dialog"]')).toBeNull();
});
