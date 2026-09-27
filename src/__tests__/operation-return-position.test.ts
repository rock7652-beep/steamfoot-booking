// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({refresh:vi.fn(),path:"/dashboard/customers"}));
vi.mock("next/navigation",()=>({usePathname:()=>m.path,useRouter:()=>({refresh:m.refresh})}));
import {ReturnPosition} from "@/components/operations/return-position";
import {operationStateKey} from "@/lib/operation-state";
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let root:ReturnType<typeof createRoot>;let container:HTMLDivElement;
beforeEach(()=>{vi.useFakeTimers();sessionStorage.clear();m.refresh.mockReset();history.replaceState(null,"","/dashboard/customers?search=test");container=document.createElement("div");root=createRoot(container);vi.spyOn(window,"scrollTo").mockImplementation(()=>{});vi.stubGlobal("requestAnimationFrame",(fn:FrameRequestCallback)=>setTimeout(()=>fn(0),16));vi.stubGlobal("cancelAnimationFrame",(id:number)=>clearTimeout(id));});
afterEach(async()=>{await act(async()=>root.unmount());vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function render(scope:string) {await act(async()=>root.render(React.createElement(ReturnPosition,{scope})));}
it("restores once for the same account/store and full list URL",async()=>{
 const key=operationStateKey("a", "position:/dashboard/customers?search=test");sessionStorage.setItem(key,JSON.stringify({at:Date.now(),value:430}));
 await render("a");await act(async()=>{await vi.advanceTimersByTimeAsync(20);});
 expect(window.scrollTo).toHaveBeenCalledWith({top:430,behavior:"instant"});expect(m.refresh).toHaveBeenCalledOnce();expect(sessionStorage.getItem(key)).toBeNull();
});
it("does not restore another store's position",async()=>{
 sessionStorage.setItem(operationStateKey("a","position:/dashboard/customers?search=test"),JSON.stringify({at:Date.now(),value:430}));
 await render("b");await act(async()=>{await vi.advanceTimersByTimeAsync(30);});expect(window.scrollTo).not.toHaveBeenCalled();expect(m.refresh).not.toHaveBeenCalled();
});
it("stops restoration as soon as the user interacts",async()=>{
 sessionStorage.setItem(operationStateKey("a","position:/dashboard/customers?search=test"),JSON.stringify({at:Date.now(),value:430}));
 await render("a");window.dispatchEvent(new Event("pointerdown"));await act(async()=>{await vi.advanceTimersByTimeAsync(30);});expect(window.scrollTo).not.toHaveBeenCalled();
});
