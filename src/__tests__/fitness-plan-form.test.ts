// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {OperationScope} from "@/components/operations/operation-scope";
import {CoursePlanDraftForm} from "@/app/(dashboard)/dashboard/courses/course-profile-forms";
const m=vi.hoisted(()=>({save:vi.fn(),refresh:vi.fn()}));
vi.mock("@/server/actions/course-members",()=>({saveCourseCustomer:vi.fn(),saveCoursePointPlan:m.save}));
vi.mock("next/navigation",()=>({usePathname:()=>"/dashboard/courses",useRouter:()=>({refresh:m.refresh})}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{sessionStorage.clear();vi.resetAllMocks();m.save.mockResolvedValue({success:false,error:"保留輸入"});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function mount(){await act(async()=>root.render(React.createElement(OperationScope,{scope:"user:fitness"},React.createElement(CoursePlanDraftForm,{plan:null,templates:[{id:"t",name:"瑜珈",category:"",isActive:true}],termSessions:[{id:"s",name:"瑜珈",startsAt:"2026-10-02T01:00:00Z"}],profitEnabled:true,onPending:()=>{},onSaved:()=>{}}))));}
async function select(label:string,value:string){const el=Array.from(host.querySelectorAll("label")).find(l=>l.firstChild?.textContent===label)!.querySelector("select")!;await act(async()=>{el.value=value;el.dispatchEvent(new Event("change",{bubbles:true}));});}
async function submit(){await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));}
it("basic fields precede course selection, all courses has an explicit empty-id payload",async()=>{
 await mount();expect(host.querySelector('input[name="price"]')!.compareDocumentPosition(host.querySelector('input[value="t"]')!)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 await submit();expect(m.save.mock.calls[0][0]).toMatchObject({unit:"POINT",templateIds:[],termSessionIds:[]});
});
it("does not silently turn an empty specified selection into all courses",async()=>{
 await mount();await select("範圍","selected");await submit();expect(m.save).not.toHaveBeenCalled();expect(host.textContent).toContain("請選至少一門");
 await act(async()=>host.querySelector<HTMLInputElement>('input[value="t"]')!.click());await submit();expect(m.save.mock.calls[0][0].templateIds).toEqual(["t"]);
});
it("term mode requires matching dates and a session unit, hides sharing",async()=>{
 await mount();await select("方案","TERM");await submit();expect(m.save).not.toHaveBeenCalled();expect(host.textContent).toContain("上課日期數須");
 const points=host.querySelector<HTMLInputElement>('input[name="points"]')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(points,"1");points.dispatchEvent(new Event("input",{bubbles:true}));host.querySelector<HTMLInputElement>('input[value="s"]')!.click();});
 await submit();expect(m.save.mock.calls[0][0]).toMatchObject({unit:"SESSION",points:1,termSessionIds:["s"],allowShared:false});
 await select("方案","POINT");await submit();expect(m.save.mock.calls[1][0].termSessionIds).toEqual([]);
});
