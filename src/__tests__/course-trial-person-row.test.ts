// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({collect:vi.fn(),supplement:vi.fn(),void:vi.fn()}));
vi.mock("@/server/actions/course-trial",()=>({collectCourseTrial:m.collect,supplementCourseTrialCustomer:m.supplement,voidCourseTrialPayment:m.void}));
vi.mock("@/components/admin/use-course-draft-guard",()=>({useCourseDraftGuard:vi.fn()}));
import {CourseTrialPersonRow,type TrialPerson} from "@/components/admin/course-trial-person-row";
const settings={trialAllowPriceEdit:true,trialDefaultPrice:499,trialMinPrice:0,trialMaxPrice:1000};
const person:TrialPerson={id:"booking",customerId:null,customerName:"體驗者 1",customerPhone:"",status:"RESERVED",trialPrice:0,trialPayments:[]};
beforeEach(()=>{vi.resetAllMocks();(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;});
async function render(p=person){const host=document.createElement("div"),root=createRoot(host),updated=vi.fn();await act(async()=>root.render(createElement(CourseTrialPersonRow,{person:p,settings,canCollect:true,canCorrect:true,canSupplement:true,onUpdated:updated})));return {host,root,updated};}
async function click(host:HTMLElement,text:string){await act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent===text)!.click());}
async function input(host:HTMLElement,label:string,value:string){const node=host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(node,value);await act(async()=>node.dispatchEvent(new Event("input",{bubbles:true})));}
it("zero checkout is explicit and does not show a payment method or attendance control",async()=>{const {host,root}=await render();try{
 expect(host.textContent).toContain("$0 · 未結帳");await click(host,"結帳");expect(host.querySelector("select")).toBeNull();
 m.collect.mockResolvedValue({success:true,receipt:{id:"free",amount:0,status:"SUCCESS",paymentMethod:"OTHER"}});await click(host,"確認0元結帳");
 expect(m.collect).toHaveBeenCalledWith(expect.objectContaining({bookingId:"booking",amount:0,paymentMethod:undefined}));expect(host.textContent).toContain("已結帳 · $0");expect(host.textContent).toContain("待補資料");expect(host.textContent).not.toContain("出席");
 }finally{await act(async()=>root.unmount());}});
it("an empty amount cannot silently become free checkout",async()=>{const {host,root}=await render();try{await click(host,"結帳");await input(host,"體驗者 1結帳金額","");expect([...host.querySelectorAll("button")].find(b=>b.textContent==="確認0元結帳")!.disabled).toBe(true);expect(m.collect).not.toHaveBeenCalled();}finally{await act(async()=>root.unmount());}});
it("failed supplementation retains the typed name and phone, and uses the original booking after checkout",async()=>{const {host,root}=await render({...person,trialPayments:[{id:"paid",amount:499,status:"SUCCESS",paymentMethod:"CASH"}]});try{
 await click(host,"補資料");await input(host,"體驗者 1姓名","小安");await input(host,"體驗者 1手機","0912345678");m.supplement.mockResolvedValueOnce({success:false,error:"同時段已有課"}).mockResolvedValue({success:true,customer:{id:"customer",name:"既有姓名",phone:"0912345678"}});
 await click(host,"儲存資料");expect(host.querySelector<HTMLInputElement>('[aria-label="體驗者 1姓名"]')!.value).toBe("小安");expect(host.textContent).toContain("已結帳 · $499");
 await click(host,"儲存資料");expect(m.supplement).toHaveBeenLastCalledWith({bookingId:"booking",name:"小安",phone:"0912345678"});expect(host.textContent).toContain("既有姓名 · 678");expect(host.textContent).not.toContain("待補資料");expect(m.collect).not.toHaveBeenCalled();
 }finally{await act(async()=>root.unmount());}});
