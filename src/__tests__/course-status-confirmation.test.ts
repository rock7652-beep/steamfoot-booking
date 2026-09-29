// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {CourseStatusButton} from "@/components/admin/course-status-button";
const m=vi.hoisted(()=>({impact:vi.fn(),save:vi.fn(),applied:vi.fn(),pending:vi.fn(),refresh:vi.fn()}));
vi.mock("@/server/actions/course-batch",()=>({courseStatusImpact:m.impact,applyCourseBatchStatus:m.save}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:m.refresh})}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(async()=>{vi.resetAllMocks();m.impact.mockResolvedValue({success:true,count:2});m.save.mockResolvedValue({success:true,succeeded:["p"],failed:[]});host=document.createElement("div");document.body.append(host);root=createRoot(host);await act(async()=>root.render(React.createElement(CourseStatusButton,{kind:"plan",id:"p",active:true,onApplied:m.applied,onPendingChange:m.pending})));});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const click=async(text:string,last=false)=>act(async()=>{const buttons=Array.from(host.querySelectorAll("button")).filter(b=>b.textContent===text);(last?buttons.at(-1):buttons[0])!.click();});
it("checks impact without showing saving or sending mutations; cancel preserves state",async()=>{await click("下架");expect(host.textContent).toContain("已購方案與歷史紀錄保留");expect(host.textContent).not.toContain("儲存中");expect(m.save).not.toHaveBeenCalled();expect(m.pending).not.toHaveBeenCalled();await click("取消");expect(m.applied).not.toHaveBeenCalled();expect(host.querySelector('[role="dialog"]')).toBeNull();});
it("writes only after explicit confirmation",async()=>{await click("下架");await click("下架",true);expect(m.save).toHaveBeenCalledExactlyOnceWith({kind:"plan",ids:["p"],active:false});expect(m.applied).toHaveBeenCalledWith(["p"],false);});
it("does not write when impact lookup fails",async()=>{m.impact.mockResolvedValue({success:false,error:"無權限"});await click("下架");expect(host.textContent).toContain("無權限");expect(m.save).not.toHaveBeenCalled();});
