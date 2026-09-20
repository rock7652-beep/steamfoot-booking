// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const push=vi.hoisted(()=>vi.fn());
vi.mock("next/navigation",()=>({useRouter:()=>({push}),useSearchParams:()=>new URLSearchParams("view=analytics&preset=today&month=2026-08")}));
vi.mock("@/components/navigation-notice",()=>({NavigationNotice:()=>null}));
import ReportDateRange from "@/components/report-date-range";
let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);push.mockReset();host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function mount(preserveQuery=true){await act(async()=>root.render(createElement(ReportDateRange,{activePreset:"custom",startDate:"2026-09-01",endDate:"2026-09-30",preserveQuery})));}
async function submit(start:string,end:string){host.querySelector<HTMLInputElement>('[name="startDate"]')!.value=start;host.querySelector<HTMLInputElement>('[name="endDate"]')!.value=end;await act(async()=>{host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));});}
it("submits visible date fields even when a browser did not deliver a React change event",async()=>{
 await mount();await submit("2026-09-16","2026-09-16");
 expect(push).toHaveBeenCalledWith("?view=analytics&startDate=2026-09-16&endDate=2026-09-16");
});
it("keeps invalid selections for correction without navigating",async()=>{
 await mount();await submit("2026-09-18","2026-09-16");expect(push).not.toHaveBeenCalled();expect(host.textContent).toContain("結束日期不能早於起始日期");expect(host.querySelector<HTMLInputElement>('[name="startDate"]')!.value).toBe("2026-09-18");
});
it("preserves legacy reports' clean custom query by default",async()=>{
 await mount(false);await submit("2026-09-16","2026-09-16");expect(push).toHaveBeenCalledWith("?startDate=2026-09-16&endDate=2026-09-16");
});
