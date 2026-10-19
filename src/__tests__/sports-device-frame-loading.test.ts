// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {DeviceFrame} from "@/components/device-preview/device-frame";
let host:HTMLDivElement,root:Root;
beforeEach(()=>{
 vi.useFakeTimers();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}}});
 host=document.createElement("div");document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();});
async function render(resilientLoading=true,key="one"){
 await act(async()=>root.render(React.createElement(DeviceFrame,{key,device:"tablet",src:"/s/sports-live-flow/admin/dashboard/work-orders?devicePreview=1",refreshKey:0,onRouteChange:vi.fn(),resilientLoading})));
}
async function elapsed(ms:number){await act(async()=>vi.advanceTimersByTime(ms));}
function loaded(path:string){const iframe=host.querySelector("iframe")!;Object.defineProperty(iframe,"contentWindow",{configurable:true,value:{location:{pathname:path,search:"?devicePreview=1"}}});iframe.dispatchEvent(new Event("load"));}
it("slow sports reads keep waiting and recover without reporting failure",async()=>{
 await render();await elapsed(20_001);expect(host.textContent).toContain("載入較慢，仍在讀取");expect(host.textContent).not.toContain("預覽載入失敗");
 await act(async()=>loaded("/s/sports-live-flow/admin/dashboard/work-orders"));expect(host.textContent).not.toContain("仍在讀取");await elapsed(20_000);expect(host.textContent).not.toContain("預覽載入失敗");
});
it("the original non-sports timeout remains unchanged",async()=>{await render(false);await elapsed(20_001);expect(host.textContent).toContain("預覽載入失敗");});
it("an iframe error signal still exposes retry guidance",async()=>{await render();await act(async()=>host.querySelector('iframe')!.dispatchEvent(new Event("error",{bubbles:true})));expect(host.textContent).toContain("預覽載入失敗");});
it("expired login stays distinct from a slow connection",async()=>{await render();await act(async()=>loaded("/hq/login"));await elapsed(21_000);expect(host.textContent).toContain("登入狀態已失效");expect(host.textContent).not.toContain("仍在讀取");});
it("switching the frame cancels the previous timer and starts a fresh wait",async()=>{await render();await elapsed(19_000);await render(true,"two");await elapsed(2_000);expect(host.textContent).toContain("正在載入平板版預覽");expect(host.textContent).not.toContain("載入較慢");await elapsed(18_001);expect(host.textContent).toContain("載入較慢");});
