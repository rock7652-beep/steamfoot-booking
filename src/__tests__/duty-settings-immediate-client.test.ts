// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({fetch:vi.fn(),saved:vi.fn(),refresh:vi.fn()}));
vi.mock("next/navigation",()=>({usePathname:()=>"/s/a/admin/dashboard/settings/duty",useRouter:()=>({refresh:m.refresh})}));
vi.mock("sonner",()=>({toast:{success:vi.fn(),error:vi.fn()}}));
import {DutySchedulingToggle} from "@/app/(dashboard)/dashboard/settings/duty/duty-toggle";
import {DutyStatusProvider,DutyEnabledContent} from "@/app/(dashboard)/dashboard/settings/duty/duty-status";
let host:HTMLDivElement,root:Root;
beforeEach(async()=>{
 vi.resetAllMocks();vi.stubGlobal("fetch",m.fetch);Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);
 await act(async()=>root.render(createElement(DutyStatusProvider,{enabled:false},
  createElement(DutySchedulingToggle,{key:"toggle",enabled:false,storeId:"s",course:true,onSaved:m.saved}),
  createElement(DutyEnabledContent,{key:"on"},"缺班警示"),
  createElement(DutyEnabledContent,{key:"off",when:false},"聯動停用中"))));
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function click(text:string){const b=[...host.querySelectorAll("button")].find(b=>b.textContent===text)!;expect(b).toBeTruthy();await act(async()=>b.click());}
async function start(){await act(async()=>host.querySelector<HTMLButtonElement>('[role="switch"]')!.click());await click("確認啟用");}
it("confirms the switch, status and dependent warning immediately without refreshing",async()=>{
 let finish!:(r:unknown)=>void;m.fetch.mockReturnValue(new Promise(r=>{finish=r;}));
 await act(async()=>host.querySelector<HTMLButtonElement>('[role="switch"]')!.click());const b=[...host.querySelectorAll("button")].find(b=>b.textContent==="確認啟用")!;
 await act(async()=>{b.click();b.click();});expect(m.fetch).toHaveBeenCalledTimes(1);expect(host.querySelector<HTMLButtonElement>('[role="switch"]')!.disabled).toBe(true);
 await act(async()=>finish({json:async()=>({success:true,storeId:"s",data:{enabled:true}})}));
 expect(host.querySelector('[role="switch"]')!.getAttribute("aria-checked")).toBe("true");expect(host.textContent).toContain("缺班警示");expect(host.textContent).not.toContain("聯動停用中");expect(m.saved).toHaveBeenCalledExactlyOnceWith(true);expect(m.refresh).not.toHaveBeenCalled();
});
it("retains an unknown attempt and retries its exact request",async()=>{
 m.fetch.mockRejectedValueOnce(new Error("lost response"));await start();expect(host.querySelector<HTMLButtonElement>('[role="switch"]')!.disabled).toBe(true);
 m.fetch.mockResolvedValueOnce({json:async()=>({success:true,storeId:"s",data:{enabled:true}})});await click("重試確認儲存結果");
 expect(m.fetch.mock.calls[1][1].body).toBe(m.fetch.mock.calls[0][1].body);expect(m.fetch.mock.calls[0][0]).toBe("/s/a/admin/dashboard/settings-save/duty");expect(host.textContent).toContain("已啟用");
});
it("keeps the switch off and editable on a definitive teaching conflict",async()=>{
 m.fetch.mockResolvedValueOnce({json:async()=>({success:false,error:"值班未涵蓋"})});await start();expect(host.querySelector('[role="switch"]')!.getAttribute("aria-checked")).toBe("false");expect(host.querySelector<HTMLButtonElement>('[role="switch"]')!.disabled).toBe(false);expect(host.querySelector('[role="alert"]')!.textContent).toBe("值班未涵蓋");expect(m.saved).not.toHaveBeenCalled();
});
