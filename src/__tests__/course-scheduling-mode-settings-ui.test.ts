// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
const m=vi.hoisted(()=>({fetch:vi.fn(),refresh:vi.fn()}));
vi.mock("next/navigation",()=>({usePathname:()=>"/hq/dashboard/courses",useRouter:()=>({refresh:m.refresh})}));
import {CourseSchedulingModeSettings} from "@/components/admin/course-scheduling-mode-settings";
let host:HTMLDivElement,root:Root;
const props={storeId:"test",open:true,assigned:true,revision:0,canEdit:true};
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.stubGlobal("fetch",m.fetch);host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
it("confirms each toggle independently and disables both during an in-flight save",async()=>{
 let finish!:(r:unknown)=>void;m.fetch.mockReturnValue(new Promise(resolve=>{finish=resolve;}));await act(async()=>root.render(createElement(CourseSchedulingModeSettings,props)));
 const switches=host.querySelectorAll<HTMLInputElement>('[role="switch"]');await act(async()=>switches[0].click());
 expect(switches[0].checked).toBe(true);expect([...switches].every(s=>s.disabled)).toBe(true);
 expect(JSON.parse(m.fetch.mock.calls[0][1].body)).toMatchObject({mode:"OPEN",enabled:false,expectedRevision:0,expectedStoreId:"test"});
 await act(async()=>finish({json:async()=>({success:true,storeId:"test",data:{open:false,assigned:true,revision:1}})}));
 expect(switches[0].checked).toBe(false);expect(switches[1].checked).toBe(true);
 await act(async()=>root.render(createElement(CourseSchedulingModeSettings,props)));expect(switches[0].checked).toBe(false);
});
it("retains the exact request on uncertain network failure and never reports a guessed success",async()=>{
 m.fetch.mockRejectedValueOnce(new Error("network"));await act(async()=>root.render(createElement(CourseSchedulingModeSettings,props)));
 await act(async()=>host.querySelector<HTMLInputElement>('[aria-label="指定學員"]')!.click());const first=m.fetch.mock.calls[0][1].body;
 expect(host.textContent).toContain("尚未確認");expect(host.querySelector<HTMLInputElement>('[aria-label="指定學員"]')!.checked).toBe(true);
 m.fetch.mockResolvedValueOnce({json:async()=>({success:true,storeId:"test",data:{open:true,assigned:false,revision:1}})});
 await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());expect(m.fetch.mock.calls[1][1].body).toBe(first);
 expect(host.querySelector<HTMLInputElement>('[aria-label="指定學員"]')!.checked).toBe(false);
});
it("provides read-only switches when management permission is absent",async()=>{await act(async()=>root.render(createElement(CourseSchedulingModeSettings,{...props,canEdit:false})));expect([...host.querySelectorAll<HTMLInputElement>('input')].every(s=>s.disabled)).toBe(true);expect(m.fetch).not.toHaveBeenCalled();});
