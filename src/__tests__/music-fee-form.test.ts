// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {OperationScope} from "@/components/operations/operation-scope";
import {CoursePlanDraftForm} from "@/app/(dashboard)/dashboard/courses/course-profile-forms";
const m=vi.hoisted(()=>({save:vi.fn(),refresh:vi.fn()}));
vi.mock("@/server/actions/course-members",()=>({saveCourseCustomer:vi.fn(),saveCoursePointPlan:m.save}));
vi.mock("next/navigation",()=>({useSearchParams:()=>new URLSearchParams(),usePathname:()=>"/dashboard/courses",useRouter:()=>({refresh:m.refresh})}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{sessionStorage.clear();vi.resetAllMocks();m.save.mockResolvedValue({success:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it("edits five fee fields while preserving hidden purchase options and validity",async()=>{
 const plan={id:"fee-a",name:"五堂優惠",points:5,price:3200,validDays:70,isActive:false,customerPurchasable:false,allowShared:true,storeCost:100,unit:"SESSION",templateIds:["t"],musicTerms:1,musicTermSizes:[5]};
 await act(async()=>root.render(React.createElement(OperationScope,{scope:"user:music"},React.createElement(CoursePlanDraftForm,{music:true,plan,subjects:[{id:"g",name:"吉他",category:"",isActive:true}],templates:[{id:"t",name:"吉他",category:"",isActive:true,musicSubjectId:"g",musicTeacherShare:0.7,classType:"PRIVATE"}],termSessions:[],profitEnabled:false,onPending:()=>{},onSaved:()=>{}}))));
 expect([...host.querySelectorAll('label')].map(l=>l.firstChild?.textContent)).toEqual(["科目類別","收費名稱","收費金額","課堂數","拆帳比例（老師 %）"]);
 const price=host.querySelectorAll('input[type="number"]')[0];
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(price,"3201");price.dispatchEvent(new Event("input",{bubbles:true}));});
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
 expect(m.save.mock.calls[0][0]).toMatchObject({price:3201,points:5,validDays:70,isActive:false,customerPurchasable:false,allowShared:true,storeCost:100,musicSetup:{subjectId:"g",totalPrice:3201,musicTeacherShare:0.7,musicTermLessons:5}});
});
