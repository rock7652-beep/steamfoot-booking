// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({read:vi.fn()}));
vi.mock("@/server/actions/customer-panel-summary",()=>({getCustomerHealthTracking:m.read}));
vi.mock("@/components/operations/panel-read-cache",()=>({usePanelReader:()=>m}));
vi.mock("@/components/customer-health-tracking",()=>({CustomerHealthTracking:({summary}:{summary:{label:string}})=>createElement("p",null,summary.label)}));
import {SteamCustomerHealthTracking} from "@/components/steam-customer-health-tracking";
let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);host=document.createElement("div");root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());vi.useRealTimers();vi.unstubAllGlobals();});
const render=async(customerId:string)=>{await act(async()=>root.render(createElement(SteamCustomerHealthTracking,{customerId,revision:0})));};
it("does not show the previous customer's late health result",async()=>{
 let finish!:(result:unknown)=>void;m.read.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce({success:true,data:{label:"B 的量測"}});
 await render("a");await render("b");await act(async()=>finish({success:true,data:{label:"A 的晚到量測"}}));
 expect(host.textContent).toBe("B 的量測");
});
it("times out independently, ignores the late result and can retry",async()=>{
 vi.useFakeTimers();let finish!:(result:unknown)=>void;m.read.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));await render("a");
 await act(async()=>vi.advanceTimersByTime(15_000));expect(host.textContent).toContain("讀取逾時");
 await act(async()=>finish({success:true,data:{label:"舊回應"}}));expect(host.textContent).not.toContain("舊回應");
 m.read.mockResolvedValueOnce({success:true,data:{label:"重試成功"}});await act(async()=>host.querySelector("button")!.click());expect(host.textContent).toBe("重試成功");
});
