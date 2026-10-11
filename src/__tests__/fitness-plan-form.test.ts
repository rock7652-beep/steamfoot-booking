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
beforeEach(()=>{vi.stubGlobal("fetch",async (_url:string,init:RequestInit)=>({json:async()=>m.save(JSON.parse(String(init.body)))}));sessionStorage.clear();vi.resetAllMocks();m.save.mockResolvedValue({success:false,error:"保留輸入"});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function mount(overrides: Partial<React.ComponentProps<typeof CoursePlanDraftForm>> = {}){await act(async()=>root.render(React.createElement(OperationScope,{scope:"user:fitness"},React.createElement(CoursePlanDraftForm,{storeId:"store",plan:null,templates:[{id:"t",name:"瑜珈",category:"",isActive:true}],termSessions:[{id:"s",name:"瑜珈",startsAt:"2026-10-02T01:00:00Z"}],profitEnabled:true,onPending:()=>{},onSaved:()=>{},...overrides}))));}
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
 await mount();await select("計費方式","TERM");await submit();expect(m.save).not.toHaveBeenCalled();expect(host.textContent).toContain("上課日期數須");
 const points=host.querySelector<HTMLInputElement>('input[name="points"]')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(points,"1");points.dispatchEvent(new Event("input",{bubbles:true}));host.querySelector<HTMLInputElement>('input[value="s"]')!.click();});
 await submit();expect(m.save.mock.calls[0][0]).toMatchObject({unit:"SESSION",points:1,termSessionIds:["s"],allowShared:false});
 await select("計費方式","POINT");await submit();expect(m.save.mock.calls[1][0].termSessionIds).toEqual([]);
});

const sharedPlan = {id:"shared-plan",name:"已有共卡設定的長名稱方案",points:10,price:2000,validDays:90,isActive:true,unit:"POINT",templateIds:[],allowShared:true};
it.each(["LOCKED","HIDDEN"] as const)("preserves saved sharing when editing an unrelated field while %s", async(sharedCardState)=>{
 await mount({plan:sharedPlan,sharedCardState});
 const control=host.querySelector<HTMLInputElement>('input[name="allowShared"]');
 if(sharedCardState==="HIDDEN") {expect(control).toBeNull();expect(host.textContent).not.toContain("購買方式與共卡");}
 else {expect(control?.disabled).toBe(true);expect(control?.checked).toBe(true);expect(host.textContent).toContain("功能未開通");}
 const price=host.querySelector<HTMLInputElement>('input[name="price"]')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(price,"2300");price.dispatchEvent(new Event("input",{bubbles:true}));});
 await submit();expect(m.save.mock.calls[0][0]).toMatchObject({id:"shared-plan",price:2300,allowShared:true});
});
it.each(["LOCKED","HIDDEN"] as const)("cannot create new sharing while %s",async(sharedCardState)=>{
 await mount({sharedCardState});await submit();expect(m.save.mock.calls[0][0].allowShared).toBe(false);
});
it("does not submit an unsaved sharing addition after the gate changes",async()=>{
 const plan={...sharedPlan,allowShared:false};await mount({plan});
 await act(async()=>host.querySelector<HTMLInputElement>('input[name="allowShared"]')!.click());
 await mount({plan,sharedCardState:"HIDDEN"});await submit();expect(m.save.mock.calls[0][0].allowShared).toBe(false);
});
it("keeps music sharing control independent of this sports gate",async()=>{
 await mount({music:true,sharedCardState:"HIDDEN"});expect(host.querySelector('input[name="allowShared"]')).not.toBeNull();
});
it("delivers the committed plan and retains the original payload after an ambiguous reply",async()=>{
 const saved=vi.fn();await mount({onSaved:saved});
 const input=host.querySelector<HTMLInputElement>('input[name="name"]')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,"十堂方案");input.dispatchEvent(new Event("input",{bubbles:true}));});
 m.save.mockRejectedValueOnce(new Error("lost response"));await submit();expect(host.textContent).toContain("尚未確認儲存結果");
 const row={id:"P",name:"十堂方案",points:10,price:0,storeCost:0,validDays:90,isActive:true,customerPurchasable:true,allowShared:false,unit:"POINT",templateIds:[],termSessionIds:[],musicTerms:null,musicBonusLessons:0,musicTermSizes:[],lowBalanceEnabled:false,lowBalanceThreshold:null};
 m.save.mockResolvedValueOnce({success:true,storeId:"store",data:row});await submit();
 expect(m.save.mock.calls[0][0]).toEqual(m.save.mock.calls[1][0]);expect(saved).toHaveBeenCalledExactlyOnceWith(row);expect(m.refresh).not.toHaveBeenCalled();
});
