// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({replace:vi.fn(),frameProps:null as null|{src:string;onRouteChange:(path:string)=>void;resilientLoading:boolean;refreshKey:number}}));
vi.mock("next/navigation",()=>({usePathname:()=>window.location.pathname,useSearchParams:()=>new URLSearchParams(window.location.search),useRouter:()=>({replace:state.replace})}));
vi.mock("next/link",()=>({default:({children,...props}:React.ComponentProps<'a'>)=>React.createElement('a',props,children)}));
vi.mock("@/components/device-preview/device-frame",()=>({DeviceFrame:(props:NonNullable<typeof state.frameProps>)=>{state.frameProps=props;return React.createElement('div',{'data-src':props.src});}}));
import {DevicePreview} from "@/components/device-preview/device-preview";
let host:HTMLDivElement,root:Root;
const prefix="/s/sports-live-flow/admin";
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});window.history.replaceState(null,"",`${prefix}/dashboard/device-preview?page=bookings&device=tablet`);state.replace.mockClear();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function render(sportsPreview=true){await act(async()=>root.render(React.createElement(DevicePreview,{sportsPreview,moduleId:"course"})));}
async function report(path:string){await act(async()=>state.frameProps!.onRouteChange(path));}
it("inner work-order navigation synchronizes the URL without reloading its iframe",async()=>{
 await render();const src=state.frameProps!.src;await report(`${prefix}/dashboard/work-orders?devicePreview=1`);
 expect(window.location.search).toBe('?page=work-orders&device=tablet');expect(state.frameProps!.src).toBe(src);expect(state.replace).not.toHaveBeenCalled();
 expect((host.querySelector('select') as HTMLSelectElement).value).toBe('work-orders');
 const length=history.length;await report(`${prefix}/dashboard/work-orders?devicePreview=1`);expect(history.length).toBe(length);
});
it("reopening the saved URL initializes the actual work-order frame",async()=>{
 window.history.replaceState(null,"",`${prefix}/dashboard/device-preview?page=work-orders&device=tablet`);await render();expect(state.frameProps!.src).toBe(`${prefix}/dashboard/work-orders?devicePreview=1`);
});
it("back and forward restoration loads the corresponding selected page",async()=>{
 await render();await report(`${prefix}/dashboard/work-orders?devicePreview=1`);
 window.history.replaceState(null,'',`${prefix}/dashboard/device-preview?page=bookings&device=tablet`);await act(async()=>window.dispatchEvent(new PopStateEvent('popstate')));
 expect(state.frameProps!.src).toBe(`${prefix}/dashboard/courses?devicePreview=1`);expect(state.frameProps!.refreshKey).toBe(1);
 window.history.replaceState(null,'',`${prefix}/dashboard/device-preview?page=work-orders&device=tablet`);await act(async()=>window.dispatchEvent(new PopStateEvent('popstate')));
 expect(state.frameProps!.src).toBe(`${prefix}/dashboard/work-orders?devicePreview=1`);
});
it.each(["/s/another/admin/dashboard/work-orders","https://example.com/dashboard/work-orders",`${prefix}/dashboard/device-preview`,`${prefix}/dashboard/operation-audits`])("rejects unowned or disallowed frame routes %s",async path=>{await render();await report(path);expect(window.location.search).toBe('?page=bookings&device=tablet');});
it("legacy music/non-sports behavior is not opted in",async()=>{await render(false);await report(`${prefix}/dashboard/work-orders?devicePreview=1`);expect(window.location.search).toBe('?page=bookings&device=tablet');expect(state.frameProps!.resilientLoading).toBe(false);});
