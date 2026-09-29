// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({apply:vi.fn(),refresh:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:m.refresh})}));
vi.mock("@/components/admin/right-sheet",()=>({RightSheet:()=>null}));
vi.mock("@/server/actions/course-batch",()=>({applyCourseBatchStatus:m.apply,courseStatusImpact:vi.fn()}));
import {CourseStatusButton} from "@/components/admin/course-status-button";
let host:HTMLDivElement,root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});m.apply.mockReset();m.refresh.mockReset();host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it("plan changes immediately and rolls back only its row on rejection",async()=>{
 let resolve!:(value:unknown)=>void;m.apply.mockReturnValue(new Promise(r=>{resolve=r;}));const applied=vi.fn();
 await act(async()=>root.render(React.createElement(CourseStatusButton,{kind:"plan",id:"a",active:false,onApplied:applied})));
 await act(async()=>host.querySelector("button")!.click());expect(applied).toHaveBeenLastCalledWith(["a"],true);
 await act(async()=>resolve({success:false,error:"儲存失敗"}));expect(applied).toHaveBeenLastCalledWith(["a"],false);expect(host.textContent).toContain("儲存失敗");expect(m.refresh).not.toHaveBeenCalled();
});
it("staff permission changes wait for authoritative success",async()=>{
 let resolve!:(value:unknown)=>void;m.apply.mockReturnValue(new Promise(r=>{resolve=r;}));const applied=vi.fn();
 await act(async()=>root.render(React.createElement(CourseStatusButton,{kind:"staff",id:"b",active:false,onApplied:applied})));
 await act(async()=>host.querySelector("button")!.click());expect(applied).not.toHaveBeenCalled();
 await act(async()=>resolve({success:true,succeeded:["b"],failed:[]}));expect(applied).toHaveBeenCalledWith(["b"],true);
});

import {CourseBatchBar} from "@/components/admin/course-batch-selection";
it("batch partial failure restores the failed row to its original state",async()=>{
 let resolve!:(value:unknown)=>void;m.apply.mockReturnValue(new Promise(r=>{resolve=r;}));const applied=vi.fn(),selected=vi.fn();
 await act(async()=>root.render(React.createElement(CourseBatchBar,{kind:"plan",ids:["a","b"],selected:["a","b"],states:{a:false,b:false},onChange:selected,onApplied:applied})));
 await act(async()=>Array.from(host.querySelectorAll("button")).find(b=>b.textContent==="批次上架")!.click());
 expect(applied).toHaveBeenCalledWith(["a","b"],true);
 await act(async()=>resolve({success:true,succeeded:["a"],failed:[{id:"b",error:"禁止修改"}]}));
 expect(applied).toHaveBeenCalledWith(["b"],false);expect(selected).toHaveBeenLastCalledWith(["b"]);expect(host.textContent).toContain("禁止修改");
});
