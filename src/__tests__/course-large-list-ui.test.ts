// @vitest-environment jsdom
import {act,createElement,useState} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({search:vi.fn(),cards:vi.fn()}));
vi.mock("@/server/actions/course-browse",()=>({searchCourseCustomers:m.search,browseCourseCards:m.cards}));
import {CourseCustomerPicker} from "@/components/admin/course-customer-picker";
import {CourseOptionSelect} from "@/components/admin/course-option-select";
import {CourseCardBrowser,type CardBrowseState} from "@/app/(dashboard)/dashboard/courses/card-browser";
let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.useFakeTimers();vi.resetAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();});
async function tick(){await act(async()=>vi.advanceTimersByTimeAsync(300));}
async function type(input:HTMLInputElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true}));});}
async function click(text:string){const b=[...host.querySelectorAll("button")].find(b=>b.textContent===text);expect(b).toBeTruthy();await act(async()=>b!.click());}
it("retains existing shared members that are outside the current search results",async()=>{
  m.search.mockResolvedValue({success:true,rows:[{id:"new",name:"新成員",phone:"0900"}],hasMore:false});
  await act(async()=>root.render(createElement("form",null,createElement(CourseCustomerPicker,{name:"members",multiple:true,initial:[{id:"old",name:"原成員"}]}))));
  expect(m.search).not.toHaveBeenCalled();
  await type(host.querySelector('input[aria-label]')!,"新成員");await tick();await click("新成員 · 0900選取");
  m.search.mockResolvedValue({success:true,rows:[],hasMore:false});await type(host.querySelector('input[aria-label]')!,"其他姓名");await tick();
  expect(new FormData(host.querySelector("form")!).getAll("members")).toEqual(["old","new"]);
});
it("does not treat a typed customer name as a selected customer",async()=>{
  m.search.mockResolvedValue({success:true,rows:[],hasMore:false});
  await act(async()=>root.render(createElement("form",null,createElement(CourseCustomerPicker,{name:"customerId",required:true}))));
  await type(host.querySelector('input[aria-label]')!,"同名顧客");await tick();
  expect(host.querySelector("form")!.checkValidity()).toBe(false);expect(new FormData(host.querySelector("form")!).get("customerId")).toBeNull();
});
it("searches a hundred plans with the keyboard without changing the selection merely by typing",async()=>{
  function Form(){const [value,setValue]=useState("0");return createElement("form",null,createElement(CourseOptionSelect,{name:"plan",label:"方案",value,onChange:setValue,options:Array.from({length:100},(_,i)=>({id:String(i),label:`方案${i}`}))}));}
  await act(async()=>root.render(createElement(Form)));const input=host.querySelector('input[role="combobox"]') as HTMLInputElement;
  await act(async()=>input.focus());await type(input,"方案99");expect(new FormData(host.querySelector("form")!).get("plan")).toBe("0");
  await act(async()=>input.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})));expect(new FormData(host.querySelector("form")!).get("plan")).toBe("99");
});
it("replaces card pages instead of accumulating rows and resets the page when searching",async()=>{
  const card=(id:string)=>({id,name:id,available:3,unit:"POINT",held:1,remaining:4,members:[],expiresAt:"2026-10-01T00:00:00Z"});
  m.cards.mockImplementation(async({page}:{page:number})=>({success:true,rows:[card(page ? "第二頁":"第一頁")],hasMore:page===0}));
  function View(){const [state,setState]=useState<CardBrowseState>({search:"",history:false,page:0});return createElement(CourseCardBrowser,{state,onChange:setState,onSelect:()=>{}});}
  await act(async()=>root.render(createElement(View)));await tick();await click("下一頁");await tick();
  expect(host.textContent).toContain("第二頁");expect(host.textContent).not.toContain("第一頁");
  await type(host.querySelector("input")!,"新搜尋");await tick();expect(m.cards).toHaveBeenLastCalledWith(expect.objectContaining({page:0,search:"新搜尋"}));
});
