// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {it,expect,vi} from "vitest";
import {useCourseDraftGuard,requestCourseDraftLeave} from "@/components/admin/use-course-draft-guard";
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
it("allows dirty drafts to leave silently while retaining in-flight navigation protection",async()=>{
 const confirm=vi.spyOn(window,"confirm").mockReturnValue(false);
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 function Harness({pending}:{pending:boolean}){useCourseDraftGuard(true,pending);return React.createElement("a",{href:"/different-page"},"離開");}
 const render=async(pending:boolean)=>act(async()=>root.render(React.createElement(Harness,{pending})));
 const blocked=()=>{const event=new MouseEvent("click",{bubbles:true,cancelable:true});let seen=false;document.addEventListener("click",e=>{seen=e.defaultPrevented;e.preventDefault();},{capture:true,once:true});host.querySelector("a")!.dispatchEvent(event);return seen;};
 try {
  await render(false);expect(requestCourseDraftLeave()).toBe(true);expect(blocked()).toBe(false);
  await render(true);expect(requestCourseDraftLeave()).toBe(false);expect(blocked()).toBe(true);
  const unload=new Event("beforeunload",{cancelable:true});window.dispatchEvent(unload);expect(unload.defaultPrevented).toBe(true);
  await render(false);expect(requestCourseDraftLeave()).toBe(true);expect(blocked()).toBe(false);
  expect(confirm).not.toHaveBeenCalled();
 }finally{await act(async()=>root.unmount());host.remove();confirm.mockRestore();}
});
