// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {it,expect,vi} from "vitest";
vi.mock("@/server/actions/sports-staging",()=>({sportsStagingCommand:vi.fn()}));
vi.mock("@/components/dashboard-link",()=>({DashboardLink:()=>null}));
import {SportsScheduleFields} from "@/app/(dashboard)/dashboard/courses/sports-schedule-fields";
import type {SportsSnapshot} from "@/lib/sports-staging-types";
const data:SportsSnapshot={storeId:"sports-live-flow-store",date:"2026-10-18",subjects:[{id:"subject",name:"瑜伽",category:"運動",active:true,updatedAt:"v1"}],fees:[],lessons:[],students:[],customers:[{id:"student",name:"學員",phone:"0900000000"}],coaches:[{id:"coach",name:"王教練",templates:[]}],rooms:[{id:"first",name:"第一空間",capacity:10,rental:true},{id:"selected",name:"指定空間",capacity:5,rental:true}]};
async function mount(seed:{roomId?:string;coachId?:string;time?:string}={}){
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 await act(async()=>root.render(createElement(SportsScheduleFields,{initial:data,date:"2026-10-18",seed,requestKey:"00000000-0000-4000-8000-000000000001",onGuard:vi.fn(),onCreated:vi.fn()})));
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
 expect(m.host.querySelectorAll('[role="combobox"]').length).toBe(4);await m.close();
});
