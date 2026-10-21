// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {it,expect,vi} from "vitest";
vi.mock("@/server/actions/course-rental",()=>({createRentalCustomer:vi.fn()}));
vi.mock("@/server/actions/sports-staging",()=>({sportsStagingCommand:vi.fn()}));
vi.mock("@/components/dashboard-link",()=>({DashboardLink:()=>null}));
import {sportsStagingCommand} from "@/server/actions/sports-staging";
import {SportsScheduleFields} from "@/app/(dashboard)/dashboard/courses/sports-schedule-fields";
import type {SportsSnapshot} from "@/lib/sports-staging-types";
const data:SportsSnapshot={storeId:"sports-live-flow-store",date:"2026-10-18",subjects:[{id:"subject",templateId:"item-template",name:"瑜伽",category:"運動",active:true,updatedAt:"v1"}],fees:[],lessons:[],students:[],customers:[{id:"student",name:"學員",phone:"0900000000"}],coaches:[{id:"coach",name:"王教練",templates:["item-template"]}],rooms:[{id:"first",name:"第一空間",capacity:10,rental:true},{id:"selected",name:"指定空間",capacity:5,rental:true}]};
async function mount(seed:{roomId?:string;coachId?:string;time?:string}={},waitlistProps:{waitlistEnabled?:boolean;waitlistDefaultLimit?:number}={}){
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 await act(async()=>root.render(createElement(SportsScheduleFields,{initial:data,date:"2026-10-18",seed,...waitlistProps,requestKey:"00000000-0000-4000-8000-000000000001",onGuard:vi.fn(),onCreated:vi.fn()})));
 return {host,close:async()=>{await act(async()=>root.unmount());host.remove();}};
}
it("從空間格子排課即帶入空間及時間，指定學員無人數上限或堂數欄",async()=>{
 const m=await mount({roomId:"selected",time:"15:30"});
 expect((m.host.querySelector('[aria-label="排課空間"]') as HTMLInputElement).value).toBe("指定空間");
 expect((m.host.querySelector('[aria-label="排課時間"]') as HTMLInputElement).value).toBe("15:30");
 expect(m.host.querySelector('[aria-label="排課人數"]')).toBeNull();expect(m.host.querySelector('[aria-label="安排堂數"]')).toBeNull();
 const radio=Array.from(m.host.querySelectorAll('input[type="radio"]')).find(e=>e.parentElement?.textContent==="開放選課") as HTMLInputElement;
 await act(async()=>radio.click());expect(m.host.querySelector('[aria-label="排課人數"]')).not.toBeNull();await m.close();
});
it("教練視角帶入教練，空間預設第一個；五種排課有對應選取色",async()=>{
 const m=await mount({coachId:"coach"});
 expect((m.host.querySelector('[aria-label="排課教練"]') as HTMLInputElement).value).toBe("王教練");expect((m.host.querySelector('[aria-label="排課空間"]') as HTMLInputElement).value).toBe("第一空間");
 const button=Array.from(m.host.querySelectorAll('button')).find(b=>b.textContent==="固定隔週")!;await act(async()=>button.click());expect(button.getAttribute('aria-pressed')).toBe("true");expect(button.className).toContain("bg-violet-100");
 expect(m.host.querySelectorAll('[role="combobox"]').length).toBe(3);expect(m.host.querySelector('[aria-label="排課收費方式"]')).toBeNull();await m.close();
});

it("學員姓名／電話即時篩選，切換開放選課仍保留已選草稿",async()=>{
 const m=await mount();expect(m.host.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
 const initialQuery=m.host.querySelector('[aria-label="搜尋學員"]') as HTMLInputElement;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(initialQuery,"學員");initialQuery.dispatchEvent(new Event("input",{bubbles:true}));});
 const checkbox=m.host.querySelector('input[type="checkbox"]') as HTMLInputElement;
 await act(async()=>checkbox.click());expect(m.host.textContent).toContain("已選 1 人");
 const query=m.host.querySelector('[aria-label="搜尋學員"]') as HTMLInputElement;
 const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!;
 await act(async()=>{setter.call(query,'找不到');query.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(m.host.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);expect(m.host.querySelector('[aria-label="移除學員 學員"]')).not.toBeNull();
 await act(async()=>{setter.call(query,'0900');query.dispatchEvent(new Event('input',{bubbles:true}));});expect(m.host.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
 const radios=Array.from(m.host.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
 await act(async()=>radios[1].click());await act(async()=>radios[0].click());expect(m.host.textContent).toContain('已選 1 人');expect((m.host.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
 await m.close();
});

it("disabled waitlist starts at zero; enabled waitlist keeps the store default",async()=>{
 for(const enabled of [false,true]){
  const m=await mount({}, {waitlistEnabled:enabled,waitlistDefaultLimit:3});
  const radio=Array.from(m.host.querySelectorAll('input[type="radio"]')).find(e=>e.parentElement?.textContent==="開放選課") as HTMLInputElement;
  await act(async()=>radio.click());
  const input=m.host.querySelector('[aria-label="候補人數"]') as HTMLInputElement;
  expect(input.value).toBe(enabled?"3":"0");expect(input.disabled).toBe(!enabled);
  expect(m.host.textContent?.includes("候補未啟用")).toBe(!enabled);
  await m.close();
 }
});

it("submits assigned scheduling without choosing a sales package",async()=>{
 vi.mocked(sportsStagingCommand).mockResolvedValue({success:true});
 const m=await mount({coachId:"coach"});
 const query=m.host.querySelector<HTMLInputElement>('[aria-label="搜尋學員"]')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(query,"學員");query.dispatchEvent(new Event("input",{bubbles:true}));});
 await act(async()=>m.host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
 await act(async()=>m.host.querySelector('form')!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
 const request=vi.mocked(sportsStagingCommand).mock.calls.at(-1)![0] as {payload:Record<string,unknown>};
 expect(request.payload).toMatchObject({subject:"subject",coach:"王教練",coachId:"coach",mode:"指定學員",students:["student"]});
 expect(request.payload).not.toHaveProperty("fee");await m.close();
});

it("same-name coaches submit the selected staff identity",async()=>{
 data.coaches.push({id:"second-coach",name:"王教練",templates:["item-template"]});
 vi.mocked(sportsStagingCommand).mockResolvedValue({success:true});
 const m=await mount({coachId:"second-coach"});
 try {
  const radio=Array.from(m.host.querySelectorAll('input[type="radio"]')).find(e=>e.parentElement?.textContent==="開放選課") as HTMLInputElement;
  await act(async()=>radio.click());
  await act(async()=>m.host.querySelector('form')!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  const request=vi.mocked(sportsStagingCommand).mock.calls.at(-1)![0] as {payload:Record<string,unknown>};
  expect(request.payload).toMatchObject({coach:"王教練",coachId:"second-coach",mode:"開放選課"});
 } finally {await m.close();data.coaches.pop();}
});
