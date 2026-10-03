// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({replace:vi.fn()}));
vi.mock("@/components/customer-labels", () => ({ CustomerLabels: () => null, CustomerLabelFilter: () => null }));
vi.mock("next/navigation",()=>({usePathname:()=>"/dashboard/customers",useRouter:()=>({replace:m.replace})}));
vi.mock("@/components/dashboard-link",()=>({DashboardLink:()=>null}));
import {SpaCustomerList} from "@/app/(dashboard)/dashboard/customers/_components/spa-customer-list";
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let container:HTMLDivElement;let root:ReturnType<typeof createRoot>;
beforeEach(()=>{vi.useFakeTimers();m.replace.mockReset();container=document.createElement("div");root=createRoot(container);history.replaceState(null,"","/");});
afterEach(async()=>{await act(async()=>root.unmount());vi.useRealTimers();});
async function render(search="") {await act(async()=>root.render(React.createElement(SpaCustomerList,{customers:[],search,permissions:{canSell:false,canRefund:false,canEdit:false,canCreate:false,canBook:false,canReadBookings:true,canReadAccounts:false,canManageStaff:false},onOpen:vi.fn(),onPrefetch:vi.fn()})));}
async function type(text:string) {await act(async()=>{const input=container.querySelector("input")!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,text);input.dispatchEvent(new Event("input",{bubbles:true}));});}
it("automatically searches the server using the latest input without a search button",async()=>{
 await render();await type("陳");await act(async()=>{await vi.advanceTimersByTimeAsync(100);});await type("陳小");
 await act(async()=>{await vi.advanceTimersByTimeAsync(250);});
 expect(m.replace).toHaveBeenCalledExactlyOnceWith(`/dashboard/customers?search=${encodeURIComponent("陳小")}`,{scroll:false});
 expect([...container.querySelectorAll("button")].some(b=>b.textContent==="搜尋")).toBe(false);
});
it("does not replace newer typed text with an older server search response",async()=>{
 await render();await type("first");await act(async()=>{await vi.advanceTimersByTimeAsync(250);});
 await type("second");await render("first");expect(container.querySelector("input")?.value).toBe("second");
 await act(async()=>{await vi.advanceTimersByTimeAsync(250);});expect(m.replace).toHaveBeenLastCalledWith("/dashboard/customers?search=second",{scroll:false});
});
it("restores the search on browser back without navigating back to stale input",async()=>{
 await render();await type("new");history.replaceState(null,"","/?search=old");
 await act(async()=>window.dispatchEvent(new Event("popstate")));await render("old");
 await act(async()=>{await vi.advanceTimersByTimeAsync(500);});expect(container.querySelector("input")?.value).toBe("old");expect(m.replace).not.toHaveBeenCalled();
});
